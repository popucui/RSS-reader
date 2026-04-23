import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function intFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  rootDir,
  webHost: process.env.WEB_HOST ?? '127.0.0.1',
  webPort: intFromEnv('WEB_PORT', 4300),
  databasePath: process.env.DATABASE_PATH ?? './data/rss-reader.sqlite3',
  fetchIntervalMinutes: intFromEnv('FETCH_INTERVAL_MINUTES', 30),
  maxItemsPerFetch: intFromEnv('MAX_ITEMS_PER_FETCH', 30),
  xBearerToken: process.env.X_BEARER_TOKEN ?? '',
  clashSourceUrl: process.env.CLASH_SOURCE_URL ?? '',
  clashRefreshIntervalMinutes: intFromEnv('CLASH_REFRESH_INTERVAL_MINUTES', 60)
};

export function resolveProjectPath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}
