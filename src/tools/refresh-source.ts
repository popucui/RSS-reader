import { openDatabase } from '../db/schema.js';
import { Repository } from '../db/repository.js';
import { fetchSource } from '../fetchers/index.js';

const sourceId = Number(process.argv[2]);

if (!Number.isInteger(sourceId)) {
  console.error('Usage: tsx src/tools/refresh-source.ts <source-id>');
  process.exit(1);
}

const db = openDatabase();
const repo = new Repository(db);
const source = repo.getSource(sourceId);

if (!source) {
  console.error(`Source ${sourceId} not found`);
  process.exit(1);
}

const usedToday = repo.requestCountToday(source.id);
const intervalCheck = repo.shouldSkipForInterval(source);
if (intervalCheck.skip) {
  console.log(
    JSON.stringify(
      {
        sourceId: source.id,
        status: 'skipped',
        itemCount: 0,
        newCount: 0,
        requestCount: 0,
        error: intervalCheck.error
      },
      null,
      2
    )
  );
  process.exit(0);
}

if (source.dailyRequestLimit > 0 && usedToday >= source.dailyRequestLimit) {
  console.error(`Daily request limit reached (${usedToday}/${source.dailyRequestLimit})`);
  process.exit(2);
}

const runId = repo.startFetchRun(source.id);
const result = await fetchSource(source);
if (result.externalId) {
  repo.setSourceExternalId(source.id, result.externalId);
}
const newCount = result.status === 'ok' ? repo.saveItems(source, result.items, source.topics) : 0;
repo.finishFetchRun(runId, result.status, result.items.length, newCount, result.requestCount, result.error);
repo.updateSourceFetchStatus(source.id, result.status);

console.log(
  JSON.stringify(
    {
      sourceId: source.id,
      status: result.status,
      itemCount: result.items.length,
      newCount,
      requestCount: result.requestCount,
      error: result.error
    },
    null,
    2
  )
);
