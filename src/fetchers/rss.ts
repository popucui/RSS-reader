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
      const summary = summarizeFeedContent(entry);
      const canonicalUrl = entry.link || entry.guid || source.url;
      return {
        guid: entry.guid || entry.id || entry.link || null,
        canonicalUrl,
        title,
        author: textValue(entry.creator) || textValue(entry.author) || textValue(feed.title),
        summary,
        contentText: summary || null,
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

function textValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = textValue(entry);
      if (normalized) return normalized;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['name', '_', '#text', 'title']) {
      const normalized = textValue(record[key]);
      if (normalized) return normalized;
    }
  }
  return null;
}

function summarizeFeedContent(entry: Record<string, unknown>): string {
  const snippet = textValue(entry.contentSnippet);
  if (snippet) return snippet;

  const html = textValue(entry.summary) || textValue(entry.content);
  if (!html) return '';
  return htmlToText(html);
}

function htmlToText(value: string): string {
  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      .replace(/<\/(div|section|article|li|ul|ol|blockquote|h[1-6])>/gi, '\n')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
