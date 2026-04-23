export type SourceType = 'rss' | 'rsshub' | 'x_user' | 'x_search' | 'web_page';

export type Topic =
  | 'ai'
  | 'games'
  | 'single-cell'
  | 'biopharma'
  | 'medicine'
  | 'other';

export interface Source {
  id: number;
  userId: number;
  name: string;
  url: string;
  type: SourceType;
  externalId: string | null;
  topics: Topic[];
  enabled: boolean;
  fetchIntervalMinutes: number;
  dailyRequestLimit: number;
  lastFetchAt: string | null;
  lastStatus: string | null;
  createdAt: string;
}

export interface Item {
  id: number;
  sourceId: number;
  sourceName: string;
  sourceType: SourceType;
  guid: string | null;
  canonicalUrl: string;
  title: string;
  author: string | null;
  summary: string | null;
  contentText: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  readAt: string | null;
  starred: boolean;
  topics: Topic[];
}

export interface NormalizedItem {
  guid?: string | null;
  canonicalUrl: string;
  title: string;
  author?: string | null;
  summary?: string | null;
  contentText?: string | null;
  publishedAt?: string | null;
  topics?: Topic[];
}

export interface FetchResult {
  status: 'ok' | 'skipped' | 'error';
  items: NormalizedItem[];
  requestCount: number;
  externalId?: string;
  error?: string;
}

export interface FetchRun {
  id: number;
  sourceId: number;
  sourceName: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  itemCount: number;
  newCount: number;
  requestCount: number;
  error: string | null;
}
