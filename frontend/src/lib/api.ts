import type { Item, Source, SourceType, Topic, FetchRun } from '../../../src/types';

export interface SourceInput {
  name: string;
  url: string;
  type: SourceType;
  topics: Topic[];
  enabled: boolean;
  fetchIntervalMinutes: number;
  dailyRequestLimit: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    ...init
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export function listSources(): Promise<Source[]> {
  return request<Source[]>('/api/sources');
}

export function createSource(input: SourceInput): Promise<Source> {
  return request<Source>('/api/sources', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export function deleteSource(id: number): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/sources/${id}`, { method: 'DELETE' });
}

export function listItems(filters: { topic?: string; sourceId?: number; unread?: boolean; q?: string }): Promise<Item[]> {
  const params = new URLSearchParams();
  if (filters.topic) params.set('topic', filters.topic);
  if (filters.sourceId) params.set('sourceId', String(filters.sourceId));
  if (filters.unread) params.set('unread', 'true');
  if (filters.q) params.set('q', filters.q);
  const query = params.toString();
  return request<Item[]>(`/api/items${query ? `?${query}` : ''}`);
}

export function refreshSource(id: number) {
  return request(`/api/sources/${id}/refresh`, { method: 'POST' });
}

export function refreshAll() {
  return request('/api/refresh', { method: 'POST' });
}

export function markRead(id: number, value: boolean) {
  return request(`/api/items/${id}/read`, {
    method: 'POST',
    body: JSON.stringify({ value })
  });
}

export function setStarred(id: number, value: boolean) {
  return request(`/api/items/${id}/star`, {
    method: 'POST',
    body: JSON.stringify({ value })
  });
}

export function listFetchRuns(): Promise<FetchRun[]> {
  return request<FetchRun[]>('/api/fetch-runs');
}
