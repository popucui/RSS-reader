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

export interface AuthResponse {
  token: string;
  user: { id: number; email: string };
}

export interface ClashState {
  rules: string;
  sourceConfigured: boolean;
  refreshIntervalMinutes: number;
  configExists: boolean;
  configUpdatedAt: string | null;
  lastRefreshAttemptAt: string | null;
  lastRefreshSuccessAt: string | null;
  lastRefreshErrorAt: string | null;
  lastRefreshError: string | null;
  configUrl: string;
  importUrl: string;
}

export interface ClashGenerateResult {
  ok: true;
  ruleCount: number;
  configUrl: string;
  importUrl: string;
  updatedAt: string;
}

const TOKEN_KEY = 'rss_reader_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, {
    ...init,
    headers
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export function register(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export function getCurrentUser(): Promise<{ id: number; email: string }> {
  return request<{ id: number; email: string }>('/api/auth/me');
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: true }> {
  return request<{ ok: true }>('/api/auth/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword })
  });
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

export function getClashState(): Promise<ClashState> {
  return request<ClashState>('/api/clash');
}

export function saveClashRules(rules: string): Promise<ClashState> {
  return request<ClashState>('/api/clash/rules', {
    method: 'PUT',
    body: JSON.stringify({ rules })
  });
}

export function generateClashConfig(): Promise<ClashGenerateResult> {
  return request<ClashGenerateResult>('/api/clash/generate', { method: 'POST' });
}
