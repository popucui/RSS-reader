import cron from 'node-cron';
import { config } from './config.js';
import type { Repository } from './db/repository.js';
import { fetchSource } from './fetchers/index.js';

export function startScheduler(repo: Repository): void {
  cron.schedule(`*/${config.fetchIntervalMinutes} * * * *`, async () => {
    const sources = repo.listSources().filter((source) => source.enabled);
    for (const source of sources) {
      if (repo.shouldSkipForInterval(source).skip) continue;

      const usedToday = repo.requestCountToday(source.id);
      if (source.dailyRequestLimit > 0 && usedToday >= source.dailyRequestLimit) continue;

      const runId = repo.startFetchRun(source.id);
      const result = await fetchSource(source);
      if (result.externalId) {
        repo.setSourceExternalId(source.id, result.externalId);
      }
      const newCount = result.status === 'ok' ? repo.saveItems(source, result.items, source.topics) : 0;
      repo.finishFetchRun(runId, result.status, result.items.length, newCount, result.requestCount, result.error);
      repo.updateSourceFetchStatus(source.id, result.status);
    }
  });
}
