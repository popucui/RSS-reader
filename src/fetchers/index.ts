import { config } from '../config.js';
import type { FetchResult, Source } from '../types.js';
import { fetchRssSource } from './rss.js';
import { fetchWebPageSource } from './webPage.js';
import { fetchXSource } from './x.js';

export async function fetchSource(source: Source): Promise<FetchResult> {
  if (source.type === 'rss' || source.type === 'rsshub') {
    return fetchRssSource(source, config.maxItemsPerFetch);
  }
  if (source.type === 'web_page') {
    return fetchWebPageSource(source, config.maxItemsPerFetch);
  }
  return fetchXSource(source, config.maxItemsPerFetch);
}
