import { config } from '../config.js';
import type { FetchResult, Source } from '../types.js';
import { fetchRssSource } from './rss.js';
import { fetchXSource } from './x.js';

export async function fetchSource(source: Source): Promise<FetchResult> {
  if (source.type === 'rss' || source.type === 'rsshub') {
    return fetchRssSource(source, config.maxItemsPerFetch);
  }
  return fetchXSource(source, config.maxItemsPerFetch);
}
