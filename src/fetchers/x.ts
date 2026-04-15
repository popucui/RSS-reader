import { config } from '../config.js';
import { classifyText } from '../classifier.js';
import type { FetchResult, NormalizedItem, Source } from '../types.js';

interface XUserResponse {
  data?: {
    id: string;
    username: string;
    name: string;
  };
  title?: string;
  detail?: string;
  errors?: Array<{ title?: string; detail?: string }>;
}

interface XPostsResponse {
  data?: Array<{
    id: string;
    text: string;
    created_at?: string;
    author_id?: string;
  }>;
  title?: string;
  detail?: string;
  meta?: {
    result_count?: number;
    next_token?: string;
  };
  errors?: Array<{ title?: string; detail?: string }>;
}

function xHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${config.xBearerToken}`,
    'User-Agent': 'RSS-reader/0.1'
  };
}

function xError(body: XUserResponse | XPostsResponse, status: number): string {
  const detail = body.errors?.map((error) => error.detail || error.title).filter(Boolean).join('; ');
  return body.detail || detail || body.title || `X API request failed with HTTP ${status}`;
}

function parseUsername(value: string): string {
  return value
    .replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//i, '')
    .replace(/^@/, '')
    .replace(/^x:\/\/user\//i, '')
    .split(/[/?#]/)[0]
    .trim();
}

export async function fetchXSource(source: Source, maxItems: number): Promise<FetchResult> {
  if (!config.xBearerToken) {
    return {
      status: 'skipped',
      items: [],
      requestCount: 0,
      error: 'X_BEARER_TOKEN is not configured'
    };
  }

  if (source.type === 'x_user') {
    return fetchXUserTimeline(source, maxItems);
  }

  return fetchXSearch(source, maxItems);
}

async function fetchXUserTimeline(source: Source, maxItems: number): Promise<FetchResult> {
  let requestCount = 0;
  try {
    const username = parseUsername(source.url);
    let userId = source.externalId;

    if (!userId) {
      const userUrl = new URL(`https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`);
      const userResponse = await fetch(userUrl, { headers: xHeaders() });
      requestCount += 1;
      const userBody = (await userResponse.json()) as XUserResponse;
      if (!userResponse.ok || !userBody.data) {
        return { status: 'error', items: [], requestCount, error: xError(userBody, userResponse.status) };
      }
      userId = userBody.data.id;
    }

    const postsUrl = new URL(`https://api.x.com/2/users/${userId}/tweets`);
    postsUrl.searchParams.set('max_results', String(Math.min(Math.max(maxItems, 5), 100)));
    postsUrl.searchParams.set('tweet.fields', 'created_at,author_id');
    postsUrl.searchParams.set('start_time', oneDayAgoIso());
    const postsResponse = await fetch(postsUrl, { headers: xHeaders() });
    requestCount += 1;
    const postsBody = (await postsResponse.json()) as XPostsResponse;
    if (!postsResponse.ok) {
      return { status: 'error', items: [], requestCount, error: xError(postsBody, postsResponse.status) };
    }

    const items = (postsBody.data ?? []).map((post) => normalizePost(source, post, username));
    const warning = postsBody.meta?.next_token
      ? `More than ${items.length} posts in the last 24 hours; pagination was intentionally skipped to save X API credits.`
      : undefined;
    return { status: 'ok', items, requestCount, externalId: userId, error: warning };
  } catch (error) {
    return {
      status: 'error',
      items: [],
      requestCount,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function fetchXSearch(source: Source, maxItems: number): Promise<FetchResult> {
  let requestCount = 0;
  try {
    const url = new URL('https://api.x.com/2/tweets/search/recent');
    url.searchParams.set('query', source.url);
    url.searchParams.set('max_results', String(Math.min(Math.max(maxItems, 10), 100)));
    url.searchParams.set('tweet.fields', 'created_at,author_id');
    url.searchParams.set('start_time', oneDayAgoIso());
    const response = await fetch(url, { headers: xHeaders() });
    requestCount += 1;
    const body = (await response.json()) as XPostsResponse;
    if (!response.ok) {
      return { status: 'error', items: [], requestCount, error: xError(body, response.status) };
    }

    const items = (body.data ?? []).map((post) => normalizePost(source, post));
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

function oneDayAgoIso(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

function normalizePost(
  source: Source,
  post: { id: string; text: string; created_at?: string; author_id?: string },
  username?: string
): NormalizedItem {
  const title = post.text.length > 96 ? `${post.text.slice(0, 96)}...` : post.text;
  const canonicalUrl = username ? `https://x.com/${username}/status/${post.id}` : `https://x.com/i/web/status/${post.id}`;
  return {
    guid: `x:${post.id}`,
    canonicalUrl,
    title,
    author: username ? `@${username}` : post.author_id ?? null,
    summary: post.text,
    contentText: post.text,
    publishedAt: post.created_at ?? null,
    topics: classifyText(post.text, source.topics)
  };
}
