import { classifyText } from '../classifier.js';
import type { FetchResult, NormalizedItem, Source } from '../types.js';

interface LinkCandidate {
  url: string;
  title: string;
  summary: string;
  publishedAt: string | null;
}

export async function fetchWebPageSource(source: Source, maxItems: number): Promise<FetchResult> {
  if (isMiniMaxNewsSource(source.url)) {
    return fetchMiniMaxNewsSource(source, maxItems);
  }

  try {
    const response = await fetch(source.url, {
      headers: {
        'User-Agent': 'RSS-reader/0.1 (+local-first information reader)',
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    const html = await response.text();
    if (!response.ok) {
      return {
        status: 'error',
        items: [],
        requestCount: 1,
        error: `HTTP ${response.status} ${response.statusText}`.trim()
      };
    }

    const candidates = extractArticleLinks(html, source.url, maxItems);
    const items: NormalizedItem[] = candidates.map((candidate) => ({
      guid: candidate.url,
      canonicalUrl: candidate.url,
      title: candidate.title,
      author: new URL(source.url).hostname,
      summary: candidate.summary || `Discovered from ${source.name}`,
      contentText: candidate.summary || candidate.title,
      publishedAt: candidate.publishedAt,
      topics: classifyText(candidate.title, source.topics)
    }));
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

async function fetchMiniMaxNewsSource(source: Source, maxItems: number): Promise<FetchResult> {
  let requestCount = 0;
  try {
    const [homeTech, research] = await Promise.all([
      fetchMiniMaxSetting('home_tech_list').then((value) => {
        requestCount += 1;
        return value;
      }),
      fetchMiniMaxSetting('research_list').then((value) => {
        requestCount += 1;
        return value;
      })
    ]);

    const candidates = [
      ...miniMaxHomeTechCandidates(homeTech),
      ...miniMaxResearchCandidates(research)
    ];
    const seen = new Set<string>();
    const selected: LinkCandidate[] = [];
    for (const candidate of candidates) {
      if (seen.has(candidate.url)) continue;
      seen.add(candidate.url);
      selected.push(candidate);
      if (selected.length >= maxItems) break;
    }

    const enriched = await Promise.all(
      selected.map(async (candidate) => {
        if (candidate.publishedAt) return candidate;
        const detail = await fetchMiniMaxArticleMetadata(candidate.url);
        requestCount += 1;
        return {
          ...candidate,
          title: detail.title || candidate.title,
          summary: detail.summary || candidate.summary,
          publishedAt: detail.publishedAt
        };
      })
    );

    const items: NormalizedItem[] = enriched.map((candidate) => ({
      guid: candidate.url,
      canonicalUrl: candidate.url,
      title: candidate.title,
      author: new URL(source.url).hostname,
      summary: candidate.summary || `Discovered from ${source.name}`,
      contentText: candidate.summary || candidate.title,
      publishedAt: candidate.publishedAt,
      topics: classifyText(`${candidate.title}\n${candidate.summary}`, source.topics)
    }));
    return { status: 'ok', items, requestCount };
  } catch (error) {
    return {
      status: 'error',
      items: [],
      requestCount,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function extractArticleLinks(html: string, pageUrl: string, maxItems: number): LinkCandidate[] {
  const sourceUrl = new URL(pageUrl);
  const seen = new Set<string>();
  const candidates: LinkCandidate[] = [];

  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1];
    const title = cleanText(match[2]);
    let absoluteUrl: URL;
    try {
      absoluteUrl = new URL(href, sourceUrl);
    } catch {
      continue;
    }

    if (absoluteUrl.origin !== sourceUrl.origin) continue;
    absoluteUrl.hash = '';
    const normalizedUrl = absoluteUrl.href;
    if (seen.has(normalizedUrl)) continue;
    if (!isArticlePath(absoluteUrl, sourceUrl)) continue;

    seen.add(normalizedUrl);
    const parsedText = parseArticleText(title);
    candidates.push({
      url: normalizedUrl,
      title: parsedText.title || titleFromPath(absoluteUrl),
      summary: parsedText.summary,
      publishedAt: parsedText.publishedAt
    });
    if (candidates.length >= maxItems) break;
  }

  return candidates;
}

function parseArticleText(value: string): { title: string; summary: string; publishedAt: string | null } {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const dateMatch = normalized.match(/\b(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\b/);
  if (!dateMatch || dateMatch.index === undefined) {
    return { title: limitText(normalized, 160), summary: '', publishedAt: null };
  }

  const title = normalized.slice(0, dateMatch.index).trim();
  const year = dateMatch[1];
  const month = dateMatch[2].padStart(2, '0');
  const day = dateMatch[3].padStart(2, '0');
  return {
    title: limitText(title || normalized, 160),
    summary: normalized,
    publishedAt: `${year}-${month}-${day}`
  };
}

function limitText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength).trim()}...` : value;
}

function isArticlePath(url: URL, sourceUrl: URL): boolean {
  if (url.pathname === sourceUrl.pathname || url.pathname === `${sourceUrl.pathname}/`) return false;
  return /\/(news|research)\//i.test(url.pathname);
}

function cleanText(value: string): string {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function titleFromPath(url: URL): string {
  const lastSegment = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) ?? url.hostname);
  return lastSegment.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || url.href;
}

function isMiniMaxNewsSource(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === 'www.minimax.io' && url.pathname.replace(/\/$/, '') === '/news';
  } catch {
    return false;
  }
}

async function fetchMiniMaxSetting(key: string): Promise<unknown> {
  const response = await fetch(`https://www.minimax.io/setting/get_app_settings?fe_setting_key=${key}`, {
    headers: {
      'User-Agent': 'RSS-reader/0.1 (+local-first information reader)',
      Accept: 'application/json'
    }
  });
  if (!response.ok) throw new Error(`MiniMax settings ${key} failed: HTTP ${response.status}`);
  const body = (await response.json()) as { data?: unknown };
  return body.data;
}

function miniMaxHomeTechCandidates(data: unknown): LinkCandidate[] {
  const list = getPath<Array<Record<string, unknown>>>(data, ['en', 'techList']) ?? [];
  return list
    .map((entry): LinkCandidate | null => {
      const title = stringValue(entry.title);
      const summary = stringValue(entry.subTitle);
      const url = miniMaxUrl(stringValue(entry.linkUrl));
      if (!title || !url) return null;
      return { url, title, summary, publishedAt: null };
    })
    .filter((entry): entry is LinkCandidate => entry !== null);
}

function miniMaxResearchCandidates(data: unknown): LinkCandidate[] {
  const list = getPath<Array<Record<string, unknown>>>(data, ['en', 'researchList']) ?? [];
  return list
    .map((entry) => {
      const title = stringValue(entry.title);
      const summary = stringValue(entry.summary);
      const slug = stringValue(entry.slug);
      if (!title || !slug) return null;
      return {
        url: `https://www.minimax.io/news/${slug}`,
        title,
        summary,
        publishedAt: stringValue(entry.publishDate) || null
      };
    })
    .filter((entry): entry is LinkCandidate => entry !== null);
}

async function fetchMiniMaxArticleMetadata(url: string): Promise<{ title: string; summary: string; publishedAt: string | null }> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'RSS-reader/0.1 (+local-first information reader)',
      Accept: 'text/html,application/xhtml+xml'
    }
  });
  if (!response.ok) return { title: '', summary: '', publishedAt: null };
  const html = await response.text();
  return {
    title: jsonLdValue(html, 'headline') || metaValue(html, 'og:title') || '',
    summary: jsonLdValue(html, 'description') || metaValue(html, 'description') || metaValue(html, 'og:description') || '',
    publishedAt: jsonLdValue(html, 'datePublished') || null
  };
}

function miniMaxUrl(value: string): string {
  if (!value) return '';
  try {
    return new URL(value, 'https://www.minimax.io').href;
  } catch {
    return '';
  }
}

function getPath<T>(value: unknown, path: string[]): T | undefined {
  let current = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null || !(key in current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current as T;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function jsonLdValue(html: string, key: string): string {
  const match = html.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, 'i'));
  return match ? decodeEntities(match[1]).trim() : '';
}

function metaValue(html: string, key: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${escapedKey}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i')
  );
  return match ? decodeEntities(match[1]).trim() : '';
}
