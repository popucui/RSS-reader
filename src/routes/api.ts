import type { FastifyInstance } from 'fastify';
import { generateClashConfig, readClashState, saveCustomRules } from '../clash.js';
import { Repository } from '../db/repository.js';
import { fetchSource } from '../fetchers/index.js';
import { clashRulesSchema, itemStateSchema, sourceInputSchema, sourceUpdateSchema } from './schemas.js';
import type { AuthUser } from './auth.js';

export function registerApiRoutes(app: FastifyInstance, repo: Repository): void {
  // Health endpoint is public (no auth)
  app.get('/api/health', async () => ({ ok: true }));

  // All other /api/* routes are protected by the global onRequest hook in server.ts

  app.get('/api/sources', async (request) => {
    const user = request.user as AuthUser;
    return repo.listSources(user.id);
  });

  app.post('/api/sources', async (request, reply) => {
    const user = request.user as AuthUser;
    const parsed = sourceInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid source', details: parsed.error.flatten() });
    }
    return reply.code(201).send(repo.createSource({
      userId: user.id,
      ...applyCostAwareDefaults(parsed.data, request.body)
    }));
  });

  app.put('/api/sources/:id', async (request, reply) => {
    const user = request.user as AuthUser;
    const id = Number((request.params as { id: string }).id);
    const parsed = sourceUpdateSchema.safeParse(request.body);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid source id' });
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid source', details: parsed.error.flatten() });
    const source = repo.updateSource(id, parsed.data, user.id);
    if (!source) return reply.code(404).send({ error: 'Source not found' });
    return source;
  });

  app.delete('/api/sources/:id', async (request, reply) => {
    const user = request.user as AuthUser;
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid source id' });
    if (!repo.deleteSource(id, user.id)) return reply.code(404).send({ error: 'Source not found' });
    return { ok: true };
  });

  app.get('/api/items', async (request) => {
    const user = request.user as AuthUser;
    const query = request.query as { topic?: string; sourceId?: string; unread?: string; q?: string; limit?: string };
    // Only show items from user's sources
    const userSources = repo.listSources(user.id);
    const userSourceIds = userSources.map(s => s.id);
    const sourceId = query.sourceId ? Number(query.sourceId) : undefined;
    if (sourceId && !userSourceIds.includes(sourceId)) {
      return []; // Don't expose other users' items
    }
    return repo.listItems({
      userId: user.id,
      topic: query.topic || undefined,
      sourceId,
      unread: query.unread === 'true',
      q: query.q || undefined,
      limit: query.limit ? Number(query.limit) : 100
    });
  });

  app.post('/api/items/:id/read', async (request, reply) => {
    const user = request.user as AuthUser;
    const id = Number((request.params as { id: string }).id);
    const parsed = itemStateSchema.safeParse(request.body);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid item id' });
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid read state' });
    if (!repo.markRead(id, parsed.data.value, user.id)) return reply.code(404).send({ error: 'Item not found' });
    return { ok: true };
  });

  app.post('/api/items/:id/star', async (request, reply) => {
    const user = request.user as AuthUser;
    const id = Number((request.params as { id: string }).id);
    const parsed = itemStateSchema.safeParse(request.body);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid item id' });
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid star state' });
    if (!repo.setStarred(id, parsed.data.value, user.id)) return reply.code(404).send({ error: 'Item not found' });
    return { ok: true };
  });

  app.post('/api/sources/:id/refresh', async (request, reply) => {
    const user = request.user as AuthUser;
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid source id' });
    const source = repo.getSource(id, user.id);
    if (!source) return reply.code(404).send({ error: 'Source not found' });
    return refreshOne(repo, source.id);
  });

  app.post('/api/refresh', async (request) => {
    const user = request.user as AuthUser;
    const sources = repo.listSources(user.id).filter((source) => source.enabled);
    const results = [];
    for (const source of sources) {
      results.push(await refreshOne(repo, source.id));
    }
    return results;
  });

  app.get('/api/fetch-runs', async (request) => {
    const user = request.user as AuthUser;
    return repo.listFetchRuns(user.id);
  });

  app.get('/api/clash', async (request) => readClashState(requestOrigin(request)));

  app.put('/api/clash/rules', async (request, reply) => {
    const parsed = clashRulesSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid Clash rules', details: parsed.error.flatten() });
    }
    await saveCustomRules(parsed.data.rules);
    return readClashState(requestOrigin(request));
  });

  app.post('/api/clash/generate', async (request, reply) => {
    try {
      return await generateClashConfig(requestOrigin(request));
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}

async function refreshOne(repo: Repository, sourceId: number) {
  const source = repo.getSource(sourceId);
  if (!source) return { sourceId, status: 'error', error: 'Source not found' };

  const intervalCheck = repo.shouldSkipForInterval(source);
  if (intervalCheck.skip) {
    const runId = repo.startFetchRun(source.id);
    repo.finishFetchRun(runId, 'skipped', 0, 0, 0, intervalCheck.error);
    repo.updateSourceFetchStatus(source.id, 'skipped');
    return { sourceId: source.id, status: 'skipped', itemCount: 0, newCount: 0, requestCount: 0, error: intervalCheck.error };
  }

  const usedToday = repo.requestCountToday(source.id);
  if (source.dailyRequestLimit > 0 && usedToday >= source.dailyRequestLimit) {
    const runId = repo.startFetchRun(source.id);
    const error = `Daily request limit reached (${usedToday}/${source.dailyRequestLimit})`;
    repo.finishFetchRun(runId, 'skipped', 0, 0, 0, error);
    repo.updateSourceFetchStatus(source.id, 'skipped');
    return { sourceId: source.id, status: 'skipped', itemCount: 0, newCount: 0, requestCount: 0, error };
  }

  const runId = repo.startFetchRun(source.id);
  const result = await fetchSource(source);
  if (result.externalId) {
    repo.setSourceExternalId(source.id, result.externalId);
  }
  const newCount = result.status === 'ok' ? repo.saveItems(source, result.items, source.topics) : 0;
  repo.finishFetchRun(runId, result.status, result.items.length, newCount, result.requestCount, result.error);
  repo.updateSourceFetchStatus(source.id, result.status);
  return {
    sourceId: source.id,
    status: result.status,
    itemCount: result.items.length,
    newCount,
    requestCount: result.requestCount,
    error: result.error
  };
}

function applyCostAwareDefaults<T extends { type: string; fetchIntervalMinutes: number; dailyRequestLimit: number }>(
  parsed: T,
  raw: unknown
): T {
  if (parsed.type !== 'x_user' && parsed.type !== 'x_search' && parsed.type !== 'web_page') return parsed;
  const body = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    ...parsed,
    fetchIntervalMinutes: body.fetchIntervalMinutes === undefined ? 1440 : parsed.fetchIntervalMinutes,
    dailyRequestLimit: body.dailyRequestLimit === undefined ? (parsed.type === 'web_page' ? 10 : 2) : parsed.dailyRequestLimit
  };
}

function requestOrigin(request: { headers: Record<string, string | string[] | undefined> }): string {
  const proto = headerValue(request.headers['x-forwarded-proto']) ?? 'http';
  const host = headerValue(request.headers['x-forwarded-host']) ?? headerValue(request.headers.host) ?? '127.0.0.1:4300';
  return `${proto}://${host}`;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
