import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { parseTopics, serializeTopics } from '../classifier.js';
import type { FetchRun, Item, NormalizedItem, Source, SourceType, Topic } from '../types.js';

interface SourceRow {
  id: number;
  user_id: number;
  name: string;
  url: string;
  type: SourceType;
  external_id: string | null;
  topics: string;
  enabled: number;
  fetch_interval_minutes: number;
  daily_request_limit: number;
  last_fetch_at: string | null;
  last_status: string | null;
  created_at: string;
}

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
}

interface ItemRow {
  id: number;
  source_id: number;
  source_name: string;
  source_type: SourceType;
  guid: string | null;
  canonical_url: string;
  title: string;
  author: string | null;
  summary: string | null;
  content_text: string | null;
  published_at: string | null;
  fetched_at: string;
  read_at: string | null;
  starred: number;
  topics: string | null;
}

interface FetchRunRow {
  id: number;
  source_id: number;
  source_name: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  item_count: number;
  new_count: number;
  request_count: number;
  error: string | null;
}

function toSource(row: SourceRow): Source {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    url: row.url,
    type: row.type,
    externalId: row.external_id,
    topics: parseTopics(row.topics),
    enabled: row.enabled === 1,
    fetchIntervalMinutes: row.fetch_interval_minutes,
    dailyRequestLimit: row.daily_request_limit,
    lastFetchAt: row.last_fetch_at,
    lastStatus: row.last_status,
    createdAt: row.created_at
  };
}

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceType: row.source_type,
    guid: row.guid,
    canonicalUrl: row.canonical_url,
    title: row.title,
    author: row.author,
    summary: row.summary,
    contentText: row.content_text,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    readAt: row.read_at,
    starred: row.starred === 1,
    topics: parseTopics(row.topics)
  };
}

function toFetchRun(row: FetchRunRow): FetchRun {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    itemCount: row.item_count,
    newCount: row.new_count,
    requestCount: row.request_count,
    error: row.error
  };
}

function itemHash(item: NormalizedItem): string {
  return crypto
    .createHash('sha256')
    .update(`${item.guid ?? ''}|${item.canonicalUrl}|${item.title}`)
    .digest('hex');
}

export class Repository {
  constructor(private readonly db: Database.Database) {}

  listSources(userId?: number): Source[] {
    const sql = userId
      ? 'SELECT * FROM sources WHERE user_id = ? ORDER BY name COLLATE NOCASE'
      : 'SELECT * FROM sources ORDER BY name COLLATE NOCASE';
    const params = userId ? [userId] : [];
    const rows = this.db.prepare(sql).all(...params) as SourceRow[];
    return rows.map(toSource);
  }

  getSource(id: number, userId?: number): Source | null {
    const sql = userId
      ? 'SELECT * FROM sources WHERE id = ? AND user_id = ?'
      : 'SELECT * FROM sources WHERE id = ?';
    const params = userId ? [id, userId] : [id];
    const row = this.db.prepare(sql).get(...params) as SourceRow | undefined;
    return row ? toSource(row) : null;
  }

  createSource(input: {
    userId: number;
    name: string;
    url: string;
    type: SourceType;
    topics: Topic[];
    enabled: boolean;
    fetchIntervalMinutes: number;
    dailyRequestLimit: number;
  }): Source {
    const result = this.db
      .prepare(
        `INSERT INTO sources (user_id, name, url, type, topics, enabled, fetch_interval_minutes, daily_request_limit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.userId,
        input.name,
        input.url,
        input.type,
        serializeTopics(input.topics),
        input.enabled ? 1 : 0,
        input.fetchIntervalMinutes,
        input.dailyRequestLimit
      );
    return this.getSource(Number(result.lastInsertRowid)) as Source;
  }

  updateSource(id: number, input: Partial<Omit<Source, 'id' | 'userId' | 'createdAt' | 'lastFetchAt' | 'lastStatus'>>, userId?: number): Source | null {
    const current = this.getSource(id, userId);
    if (!current) return null;
    const next = { ...current, ...input };
    this.db
      .prepare(
        `UPDATE sources
         SET name = ?, url = ?, type = ?, topics = ?, enabled = ?, fetch_interval_minutes = ?, daily_request_limit = ?
         WHERE id = ?${userId ? ' AND user_id = ?' : ''}`
      )
      .run(
        next.name,
        next.url,
        next.type,
        serializeTopics(next.topics),
        next.enabled ? 1 : 0,
        next.fetchIntervalMinutes,
        next.dailyRequestLimit,
        id,
        ...(userId ? [userId] : [])
      );
    return this.getSource(id, userId);
  }

  deleteSource(id: number, userId?: number): boolean {
    const sql = userId ? 'DELETE FROM sources WHERE id = ? AND user_id = ?' : 'DELETE FROM sources WHERE id = ?';
    const params = userId ? [id, userId] : [id];
    const result = this.db.prepare(sql).run(...params);
    return result.changes > 0;
  }

  setSourceExternalId(id: number, externalId: string): void {
    this.db.prepare('UPDATE sources SET external_id = ? WHERE id = ?').run(externalId, id);
  }

  shouldSkipForInterval(source: Source): { skip: false } | { skip: true; error: string } {
    if (!source.lastFetchAt) return { skip: false };
    const lastFetchMs = Date.parse(`${source.lastFetchAt.replace(' ', 'T')}Z`);
    if (!Number.isFinite(lastFetchMs)) return { skip: false };
    const nextFetchMs = lastFetchMs + source.fetchIntervalMinutes * 60_000;
    if (Date.now() >= nextFetchMs) return { skip: false };
    return {
      skip: true,
      error: `Fetch interval not reached; next fetch after ${new Date(nextFetchMs).toISOString()}`
    };
  }

  listItems(filters: { userId?: number; topic?: string; sourceId?: number; unread?: boolean; q?: string; limit?: number }): Item[] {
    const params: Array<string | number> = [];
    const where: string[] = [];
    let join = '';

    if (filters.q) {
      join += ' JOIN items_fts ON items_fts.rowid = items.id';
      where.push('items_fts MATCH ?');
      params.push(filters.q);
    }
    if (filters.topic) {
      join += ' JOIN item_topics topic_filter ON topic_filter.item_id = items.id';
      where.push('topic_filter.topic = ?');
      params.push(filters.topic);
    }
    if (filters.sourceId) {
      where.push('items.source_id = ?');
      params.push(filters.sourceId);
    }
    if (filters.unread) {
      where.push('items.read_at IS NULL');
    }
    if (filters.userId) {
      where.push('sources.user_id = ?');
      params.push(filters.userId);
    }

    const sql = `
      SELECT items.*, sources.name AS source_name, sources.type AS source_type,
        group_concat(item_topics.topic) AS topics
      FROM items
      JOIN sources ON sources.id = items.source_id
      LEFT JOIN item_topics ON item_topics.item_id = items.id
      ${join}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY items.id
      ORDER BY coalesce(items.published_at, items.fetched_at) DESC
      LIMIT ?
    `;
    params.push(filters.limit ?? 100);
    return (this.db.prepare(sql).all(...params) as ItemRow[]).map(toItem);
  }

  saveItems(source: Source, items: NormalizedItem[], defaultTopics: Topic[]): number {
    const insertItem = this.db.prepare(
      `INSERT OR IGNORE INTO items
        (source_id, guid, canonical_url, title, author, summary, content_text, published_at, hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertTopic = this.db.prepare(
      `INSERT OR IGNORE INTO item_topics (item_id, topic, confidence, origin)
       VALUES (?, ?, 1, ?)`
    );
    const findItem = this.db.prepare('SELECT id FROM items WHERE source_id = ? AND hash = ?');
    let inserted = 0;

    const tx = this.db.transaction(() => {
      for (const item of items) {
        const hash = itemHash(item);
        const result = insertItem.run([
          source.id,
          item.guid ?? null,
          item.canonicalUrl,
          item.title,
          item.author ?? null,
          item.summary ?? null,
          item.contentText ?? null,
          item.publishedAt ?? null,
          hash
        ]);
        const row = findItem.get(source.id, hash) as { id: number } | undefined;
        if (!row) continue;
        if (result.changes > 0) inserted += 1;
        const topics = item.topics?.length ? item.topics : defaultTopics;
        for (const topic of topics.length ? topics : ['other' as Topic]) {
          insertTopic.run(row.id, topic, item.topics?.length ? 'rule' : 'source');
        }
      }
    });
    tx();
    return inserted;
  }

  startFetchRun(sourceId: number): number {
    const result = this.db.prepare('INSERT INTO fetch_runs (source_id) VALUES (?)').run(sourceId);
    return Number(result.lastInsertRowid);
  }

  finishFetchRun(runId: number, status: string, itemCount: number, newCount: number, requestCount: number, error?: string): void {
    this.db
      .prepare(
        `UPDATE fetch_runs
         SET finished_at = datetime('now'), status = ?, item_count = ?, new_count = ?, request_count = ?, error = ?
         WHERE id = ?`
      )
      .run(status, itemCount, newCount, requestCount, error ?? null, runId);
  }

  updateSourceFetchStatus(sourceId: number, status: string): void {
    this.db
      .prepare("UPDATE sources SET last_fetch_at = datetime('now'), last_status = ? WHERE id = ?")
      .run(status, sourceId);
  }

  requestCountToday(sourceId: number): number {
    const row = this.db
      .prepare(
        `SELECT coalesce(sum(request_count), 0) AS count
         FROM fetch_runs
         WHERE source_id = ? AND date(started_at) = date('now')`
      )
      .get(sourceId) as { count: number };
    return row.count;
  }

  listFetchRuns(userId?: number, limit = 50): FetchRun[] {
    const sql = userId
      ? `SELECT fetch_runs.*, sources.name AS source_name
         FROM fetch_runs
         JOIN sources ON sources.id = fetch_runs.source_id AND sources.user_id = ?
         ORDER BY fetch_runs.started_at DESC
         LIMIT ?`
      : `SELECT fetch_runs.*, sources.name AS source_name
         FROM fetch_runs
         JOIN sources ON sources.id = fetch_runs.source_id
         ORDER BY fetch_runs.started_at DESC
         LIMIT ?`;
    const params = userId ? [userId, limit] : [limit];
    const rows = this.db.prepare(sql).all(...params) as FetchRunRow[];
    return rows.map(toFetchRun);
  }

  markRead(id: number, read: boolean, userId?: number): boolean {
    const result = this.db
      .prepare(
        `UPDATE items
         SET read_at = CASE WHEN ? THEN datetime('now') ELSE NULL END
         WHERE id = ?${userId ? ' AND source_id IN (SELECT id FROM sources WHERE user_id = ?)' : ''}`
      )
      .run(read ? 1 : 0, id, ...(userId ? [userId] : []));
    return result.changes > 0;
  }

  setStarred(id: number, starred: boolean, userId?: number): boolean {
    const result = this.db
      .prepare(
        `UPDATE items
         SET starred = ?
         WHERE id = ?${userId ? ' AND source_id IN (SELECT id FROM sources WHERE user_id = ?)' : ''}`
      )
      .run(starred ? 1 : 0, id, ...(userId ? [userId] : []));
    return result.changes > 0;
  }

  // User methods
  findUserByEmail(email: string): { id: number; email: string; passwordHash: string } | null {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
    if (!row) return null;
    return { id: row.id, email: row.email, passwordHash: row.password_hash };
  }

  findUserById(id: number): { id: number; email: string; passwordHash: string } | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    if (!row) return null;
    return { id: row.id, email: row.email, passwordHash: row.password_hash };
  }

  createUser(input: { email: string; passwordHash: string }): { id: number; email: string } {
    const result = this.db
      .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
      .run(input.email, input.passwordHash);
    return { id: Number(result.lastInsertRowid), email: input.email };
  }

  updateUserPassword(userId: number, passwordHash: string): boolean {
    const result = this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
    return result.changes > 0;
  }

  adoptLegacySourcesForUser(userId: number): number {
    const targetSourceCount = this.db
      .prepare('SELECT COUNT(*) AS count FROM sources WHERE user_id = ?')
      .get(userId) as { count: number };
    if (targetSourceCount.count > 0) return 0;

    const legacyUser = this.db
      .prepare("SELECT id FROM users WHERE email = 'default@localhost' AND password_hash = ''")
      .get() as { id: number } | undefined;
    if (!legacyUser || legacyUser.id === userId) return 0;

    const result = this.db.prepare('UPDATE sources SET user_id = ? WHERE user_id = ?').run(userId, legacyUser.id);
    return result.changes;
  }
}
