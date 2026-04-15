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
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('rss', 'rsshub', 'x_user', 'x_search')),
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
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!rows.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
