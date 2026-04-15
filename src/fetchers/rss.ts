import Parser from 'rss-parser';
import { classifyText } from '../classifier.js';
import type { FetchResult, NormalizedItem, Source } from '../types.js';

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'RSS-reader/0.1 (+local-first information reader)'
  }
});

export async function fetchRssSource(source: Source, maxItems: number): Promise<FetchResult> {
  try {
    const feed = await parser.parseURL(source.url);
    const items: NormalizedItem[] = feed.items.slice(0, maxItems).map((entry) => {
      const title = entry.title?.trim() || entry.link || 'Untitled item';
      const summary = entry.contentSnippet || entry.summary || entry.content || '';
      const canonicalUrl = entry.link || entry.guid || source.url;
      return {
        guid: entry.guid || entry.id || entry.link || null,
        canonicalUrl,
        title,
        author: entry.creator || entry.author || feed.title || null,
        summary,
        contentText: entry.contentSnippet || entry.content || entry.summary || null,
        publishedAt: entry.isoDate || entry.pubDate || null,
        topics: classifyText(`${title}\n${summary}`, source.topics)
      };
    });
    return { status: 'ok', items, requestCount: 1 };
  } catch (error) {
    return {
      status: 'error',
      items: [],
      requestCount: 1,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
