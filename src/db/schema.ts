import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config, resolveProjectPath } from '../config.js';

export function openDatabase(): Database.Database {
  const dbPath = resolveProjectPath(config.databasePath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('rss', 'rsshub', 'x_user', 'x_search', 'web_page')),
      external_id TEXT,
      topics TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      fetch_interval_minutes INTEGER NOT NULL DEFAULT 30,
      daily_request_limit INTEGER NOT NULL DEFAULT 100,
      last_fetch_at TEXT,
      last_status TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      guid TEXT,
      canonical_url TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT,
      summary TEXT,
      content_text TEXT,
      published_at TEXT,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      hash TEXT NOT NULL,
      read_at TEXT,
      starred INTEGER NOT NULL DEFAULT 0,
      UNIQUE(source_id, hash)
    );

    CREATE TABLE IF NOT EXISTS item_topics (
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      topic TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1,
      origin TEXT NOT NULL DEFAULT 'rule',
      PRIMARY KEY (item_id, topic)
    );

    CREATE TABLE IF NOT EXISTS fetch_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      item_count INTEGER NOT NULL DEFAULT 0,
      new_count INTEGER NOT NULL DEFAULT 0,
      request_count INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
      title,
      summary,
      content_text,
      content='items',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
      INSERT INTO items_fts(rowid, title, summary, content_text)
      VALUES (new.id, new.title, coalesce(new.summary, ''), coalesce(new.content_text, ''));
    END;

    CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
      INSERT INTO items_fts(items_fts, rowid, title, summary, content_text)
      VALUES ('delete', old.id, old.title, coalesce(old.summary, ''), coalesce(old.content_text, ''));
    END;

    CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
      INSERT INTO items_fts(items_fts, rowid, title, summary, content_text)
      VALUES ('delete', old.id, old.title, coalesce(old.summary, ''), coalesce(old.content_text, ''));
      INSERT INTO items_fts(rowid, title, summary, content_text)
      VALUES (new.id, new.title, coalesce(new.summary, ''), coalesce(new.content_text, ''));
    END;
  `);
  ensureColumn(db, 'sources', 'external_id', 'TEXT');
  ensureWebPageSourceType(db);
  ensureUserIdColumn(db);
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!rows.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function ensureWebPageSourceType(db: Database.Database): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sources'")
    .get() as { sql: string } | undefined;
  if (!row?.sql || row.sql.includes("'web_page'")) return;

  db.pragma('foreign_keys = OFF');
  try {
    db.exec(`
      CREATE TABLE sources_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('rss', 'rsshub', 'x_user', 'x_search', 'web_page')),
        external_id TEXT,
        topics TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        fetch_interval_minutes INTEGER NOT NULL DEFAULT 30,
        daily_request_limit INTEGER NOT NULL DEFAULT 100,
        last_fetch_at TEXT,
        last_status TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO sources_new (
        id, name, url, type, external_id, topics, enabled, fetch_interval_minutes,
        daily_request_limit, last_fetch_at, last_status, created_at
      )
      SELECT
        id, name, url, type, external_id, topics, enabled, fetch_interval_minutes,
        daily_request_limit, last_fetch_at, last_status, created_at
      FROM sources;

      DROP TABLE sources;
      ALTER TABLE sources_new RENAME TO sources;
    `);
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

function ensureUserIdColumn(db: Database.Database): void {
  // Check if sources already has user_id
  const rows = db.prepare(`PRAGMA table_info(sources)`).all() as Array<{ name: string }>;
  if (rows.some((row) => row.name === 'user_id')) return;

  // Add user_id column (nullable initially for migration)
  db.exec(`ALTER TABLE sources ADD COLUMN user_id INTEGER REFERENCES users(id)`);

  // Create default user if no users exist
  const userCount = db.prepare(`SELECT COUNT(*) as count FROM users`).get() as { count: number };
  if (userCount.count === 0) {
    db.exec(`
      INSERT INTO users (email, password_hash)
      VALUES ('default@localhost', '')
    `);
  }

  // Get the first user id (should be 1 after above insert)
  const defaultUser = db.prepare(`SELECT id FROM users ORDER BY id LIMIT 1`).get() as { id: number } | undefined;

  if (defaultUser) {
    // Assign all existing sources to the default user
    db.prepare(`UPDATE sources SET user_id = ? WHERE user_id IS NULL`).run(defaultUser.id);
  }

  // Now make user_id NOT NULL by recreating the table
  db.pragma('foreign_keys = OFF');
  try {
    db.exec(`
      CREATE TABLE sources_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('rss', 'rsshub', 'x_user', 'x_search', 'web_page')),
        external_id TEXT,
        topics TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        fetch_interval_minutes INTEGER NOT NULL DEFAULT 30,
        daily_request_limit INTEGER NOT NULL DEFAULT 100,
        last_fetch_at TEXT,
        last_status TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO sources_new (
        id, user_id, name, url, type, external_id, topics, enabled, fetch_interval_minutes,
        daily_request_limit, last_fetch_at, last_status, created_at
      )
      SELECT
        id, user_id, name, url, type, external_id, topics, enabled, fetch_interval_minutes,
        daily_request_limit, last_fetch_at, last_status, created_at
      FROM sources;

      DROP TABLE sources;
      ALTER TABLE sources_new RENAME TO sources;
    `);
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
