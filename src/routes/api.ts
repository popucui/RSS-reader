import type { FastifyInstance } from 'fastify';
import { Repository } from '../db/repository.js';
import { fetchSource } from '../fetchers/index.js';
import { itemStateSchema, sourceInputSchema, sourceUpdateSchema } from './schemas.js';

export function registerApiRoutes(app: FastifyInstance, repo: Repository): void {
  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/sources', async () => repo.listSources());

  app.post('/api/sources', async (request, reply) => {
    const parsed = sourceInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid source', details: parsed.error.flatten() });
    }
    return reply.code(201).send(repo.createSource(applyCostAwareDefaults(parsed.data, request.body)));
  });

  app.put('/api/sources/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const parsed = sourceUpdateSchema.safeParse(request.body);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid source id' });
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid source', details: parsed.error.flatten() });
    const source = repo.updateSource(id, parsed.data);
    if (!source) return reply.code(404).send({ error: 'Source not found' });
    return source;
  });

  app.delete('/api/sources/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid source id' });
    if (!repo.deleteSource(id)) return reply.code(404).send({ error: 'Source not found' });
    return { ok: true };
  });

  app.get('/api/items', async (request) => {
    const query = request.query as { topic?: string; sourceId?: string; unread?: string; q?: string; limit?: string };
    return repo.listItems({
      topic: query.topic || undefined,
      sourceId: query.sourceId ? Number(query.sourceId) : undefined,
      unread: query.unread === 'true',
      q: query.q || undefined,
      limit: query.limit ? Number(query.limit) : 100
    });
  });

  app.post('/api/items/:id/read', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const parsed = itemStateSchema.safeParse(request.body);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid item id' });
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid read state' });
    if (!repo.markRead(id, parsed.data.value)) return reply.code(404).send({ error: 'Item not found' });
    return { ok: true };
  });

  app.post('/api/items/:id/star', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const parsed = itemStateSchema.safeParse(request.body);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid item id' });
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid star state' });
    if (!repo.setStarred(id, parsed.data.value)) return reply.code(404).send({ error: 'Item not found' });
    return { ok: true };
  });

  app.post('/api/sources/:id/refresh', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Invalid source id' });
    const source = repo.getSource(id);
    if (!source) return reply.code(404).send({ error: 'Source not found' });
    return refreshOne(repo, source.id);
  });

  app.post('/api/refresh', async () => {
    const sources = repo.listSources().filter((source) => source.enabled);
    const results = [];
    for (const source of sources) {
      results.push(await refreshOne(repo, source.id));
    }
    return results;
  });

  app.get('/api/fetch-runs', async () => repo.listFetchRuns());
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
  if (parsed.type !== 'x_user' && parsed.type !== 'x_search') return parsed;
  const body = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    ...parsed,
    fetchIntervalMinutes: body.fetchIntervalMinutes === undefined ? 1440 : parsed.fetchIntervalMinutes,
    dailyRequestLimit: body.dailyRequestLimit === undefined ? 2 : parsed.dailyRequestLimit
  };
}
