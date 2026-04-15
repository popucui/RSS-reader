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
  if (isZhipuResearchSource(source.url)) {
    return fetchZhipuResearchSource(source, maxItems);
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
      summary: candidate.summary || null,
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
  try {
    const response = await fetch('https://www.minimaxi.com/nezha/en/news?page=1', {
      headers: {
        'User-Agent': 'RSS-reader/0.1 (+local-first information reader)',
        Accept: 'application/json'
      }
    });
    if (!response.ok) throw new Error(`MiniMax news failed: HTTP ${response.status}`);
    const body = (await response.json()) as { data?: Array<Record<string, unknown>> };
    const candidates = (body.data ?? []).slice(0, maxItems).map((entry) => miniMaxNewsCandidate(entry));

    const items: NormalizedItem[] = candidates.map((candidate) => ({
      guid: candidate.url,
      canonicalUrl: candidate.url,
      title: candidate.title,
      author: new URL(source.url).hostname,
      summary: candidate.summary || null,
      contentText: candidate.summary || candidate.title,
      publishedAt: candidate.publishedAt,
      topics: classifyText(`${candidate.title}\n${candidate.summary}`, source.topics)
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

async function fetchZhipuResearchSource(source: Source, maxItems: number): Promise<FetchResult> {
  try {
    const response = await fetch(source.url, {
      headers: {
        'User-Agent': 'RSS-reader/0.1 (+local-first information reader)',
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    const html = await response.text();
    if (!response.ok) throw new Error(`Zhipu research failed: HTTP ${response.status}`);

    const candidates = extractZhipuResearchItems(html, source.url, maxItems);
    const items: NormalizedItem[] = candidates.map((candidate) => ({
      guid: candidate.url,
      canonicalUrl: candidate.url,
      title: candidate.title,
      author: new URL(source.url).hostname,
      summary: candidate.summary || null,
      contentText: candidate.summary || candidate.title,
      publishedAt: candidate.publishedAt,
      topics: classifyText(`${candidate.title}\n${candidate.summary}`, source.topics)
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

function isZhipuResearchSource(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === 'www.zhipuai.cn' && url.pathname.replace(/\/$/, '') === '/en/research';
  } catch {
    return false;
  }
}

function miniMaxNewsCandidate(entry: Record<string, unknown>): LinkCandidate {
  const title = stringValue(entry.title) || 'Untitled MiniMax news';
  const slug = stringValue(entry.slug);
  const summary = stringValue(entry.summary);
  return {
    url: stringValue(entry.externalLink) || (slug ? `https://www.minimax.io/news/${slug}` : 'https://www.minimax.io/news'),
    title,
    summary,
    publishedAt: stringValue(entry.publishDate) || null
  };
}

function extractZhipuResearchItems(html: string, pageUrl: string, maxItems: number): LinkCandidate[] {
  const page = new URL(pageUrl);
  const items = extractZhipuBlogsItems(html)
    .map((entry) => zhipuResearchCandidate(entry, page))
    .filter((candidate): candidate is LinkCandidate => candidate !== null)
    .sort((a, b) => dateMs(b.publishedAt) - dateMs(a.publishedAt));
  return items.slice(0, maxItems);
}

function extractZhipuBlogsItems(html: string): Array<Record<string, unknown>> {
  const scriptPattern = /<script>self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;
  for (const match of html.matchAll(scriptPattern)) {
    const payload = decodeJsonStringLiteral(match[1]);
    if (!payload.includes('"blogsItems"')) continue;
    const arrayText = extractJsonArrayAfter(payload, '"blogsItems"');
    if (!arrayText) continue;
    try {
      const parsed = JSON.parse(arrayText) as unknown;
      if (Array.isArray(parsed)) return parsed.filter(isRecord);
    } catch {
      continue;
    }
  }
  return [];
}

function zhipuResearchCandidate(entry: Record<string, unknown>, pageUrl: URL): LinkCandidate | null {
  const id = numberOrStringValue(entry.id);
  const title = stringValue(entry.title_en) || stringValue(entry.title_zh);
  if (!id || !title) return null;

  const summary =
    stringValue(entry.resume_en) || stringValue(entry.resume_zh) || extractLexicalText(entry.content_en) || extractLexicalText(entry.content_zh);
  const link = stringValue(entry.link);
  const url = link || new URL(`/en/research/${id}`, pageUrl).href;
  return {
    url,
    title,
    summary: limitText(summary, 240),
    publishedAt: stringValue(entry.createAt) || null
  };
}

function extractJsonArrayAfter(value: string, key: string): string | null {
  const keyIndex = value.indexOf(key);
  if (keyIndex === -1) return null;
  const start = value.indexOf('[', keyIndex);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return null;
}

function decodeJsonStringLiteral(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
}

function extractLexicalText(value: unknown): string {
  const texts: string[] = [];
  collectLexicalText(value, texts);
  return texts.join(' ').replace(/\s+/g, ' ').trim();
}

function collectLexicalText(value: unknown, texts: string[]): void {
  if (texts.join(' ').length > 320) return;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectLexicalText(entry, texts));
    return;
  }
  if (!isRecord(value)) return;
  const text = stringValue(value.text);
  if (text) texts.push(text);
  collectLexicalText(value.root, texts);
  collectLexicalText(value.children, texts);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function numberOrStringValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return stringValue(value);
}

function dateMs(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
