# CLAUDE.md

This file gives Claude Code project context for `/home/cuijie/workspace/web_dev/RSS-reader`.

## Summary

`RSS-reader` is a working local-first reader for curated RSS/RSSHub/X/web-page sources. It currently uses TypeScript + Node.js for the backend, SQLite for local storage, and React + Vite for the frontend.

The app already runs locally and contains real user data in `data/rss-reader.sqlite3`. Preserve that data.

## Runtime

Use npm scripts from the project root:

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

Local dev ports:

- Frontend: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:4300`

Single-source refresh:

```bash
npm run refresh:source -- <source-id>
```

`.env` exists locally and contains `X_BEARER_TOKEN`. Never print, expose, overwrite, or commit it.

## GitHub Remote

Use SSH authentication for GitHub push/pull operations.

Remote:

```text
git@github.com:popucui/RSS-reader.git
```

Keep `origin` on the SSH URL. Do not switch it back to HTTPS unless explicitly requested.

Typical update flow:

```bash
git status --short
git add .
git commit -m "<message>"
git push
```

## Stack

- TypeScript + Node.js.
- Fastify.
- SQLite via `better-sqlite3`.
- RSS parsing via `rss-parser`.
- Lightweight official web-page link discovery for sites without RSS.
- X API through direct REST calls.
- Scheduling via `node-cron`.
- React + Vite frontend.
- Zod request validation.
- Vitest tests.

## Important Files

- `src/server.ts`: Fastify server, API setup, frontend static serving after build.
- `src/config.ts`: environment config.
- `src/db/schema.ts`: SQLite schema and migrations.
- `src/db/repository.ts`: database reads/writes and request-limit helpers.
- `src/fetchers/rss.ts`: RSS/RSSHub ingestion.
- `src/fetchers/webPage.ts`: same-domain news/research link discovery for official pages without feeds.
- `src/fetchers/x.ts`: X API ingestion.
- `src/fetchers/index.ts`: source dispatcher.
- `src/routes/api.ts`: REST endpoints and refresh logic.
- `src/routes/schemas.ts`: Zod schemas.
- `src/scheduler.ts`: background polling.
- `src/tools/refresh-source.ts`: CLI refresh helper.
- `src/classifier.ts`: rule-based topic classification.
- `frontend/src/App.tsx`: main UI behavior.
- `frontend/src/styles.css`: current reader UI styling.

## Current Features

- Source management for `rss`, `rsshub`, `web_page`, `x_user`, and `x_search`.
- Manual source refresh and refresh-all.
- RSS/RSSHub ingestion and dedupe.
- Web-page ingestion for official news/research index pages.
- Official X API ingestion with cost controls.
- SQLite archive and FTS5 search.
- Topic tags: `ai`, `games`, `single-cell`, `biopharma`, `medicine`, `other`.
- Inbox filtering by topic, source, unread state, and search query.
- Read/star item state.
- Clicking an item title opens the source link and marks the item read.
- Fetch log tab with request counts and errors.
- Independent scrolling for source management and main content.

## Current Local Sources

The local database currently includes:

- `OpenAI News`: `https://openai.com/news/rss.xml`, type `rss`.
- `Dash Huang`: `@DashHuang`, type `x_user`.
- `Anthropic News`: `https://rss.datuan.dev/anthropic/news`, type `rsshub`.
- `Anthropic Research`: `https://rss.datuan.dev/anthropic/research`, type `rsshub`.
- `MiniMax News`: `https://www.minimax.io/news`, type `web_page`.
- `Zhipu News`: `https://www.zhipuai.cn/en/news`, type `web_page`.
- `xAI News`: `https://x.ai/news`, type `web_page`, currently disabled because direct fetch returns HTTP 403.

These are not static fixtures. Query `/api/sources` for current truth.

MiniMax Chinese/English news pages are largely duplicate, and MiniMax research currently repeats the news listing. Zhipu Chinese/English news pages are largely duplicate, and the research pages currently expose no clear article links. Prefer the English news pages unless this changes.

## X API Cost Rules

Keep X usage conservative:

- X source defaults should remain `fetchIntervalMinutes=1440` and `dailyRequestLimit=2`.
- X fetches only request recent posts from the last 24 hours.
- Do not auto-paginate X responses.
- Cache resolved X user ids in `sources.external_id`.
- Both CLI and API refresh paths must respect fetch interval and daily request limit.
- Fetch logs should expose auth, quota, rate-limit, and credit errors.

The current implementation uses direct X API v2 REST calls. Do not introduce an SDK unless the package and version are verified installable.

## Web Page Source Rules

Use `web_page` only when there is no official RSS/feed route. Defaults should remain conservative: `fetchIntervalMinutes=1440`, `dailyRequestLimit=10`.

The adapter fetches one HTML index page, extracts same-origin `/news/` or `/research/` links, does not crawl detail pages, and dedupes by canonical URL. Disable a source if it repeatedly returns blocking errors such as HTTP 403.

MiniMax News is a special case. `https://www.minimax.io/news` renders a skeleton and mixes navigation links into static HTML, while the visible news cards come from `https://www.minimaxi.com/nezha/en/news?page=1`. Use that endpoint so ingested items match the web page. Expect 1 ordinary web request for one MiniMax refresh.

## Database

SQLite database path defaults to:

```text
./data/rss-reader.sqlite3
```

Tables:

- `sources`
- `items`
- `item_topics`
- `fetch_runs`
- `items_fts`

Keep migrations idempotent in `src/db/schema.ts`. Do not delete or recreate the database to solve schema problems unless explicitly asked.

## UI Rules

- Keep this as a reader/workbench, not a marketing page.
- Main view should prioritize reading density and source triage.
- Preserve source panel and content panel independent scrolling.
- Keep fetch log behind the tab.
- Preserve visible unread/read distinction.
- Avoid decorative changes that reduce scan speed.

## Validation

Before finishing code changes, run:

```bash
npm run typecheck
npm test
npm run build
```

For quick API checks:

```bash
curl -s http://127.0.0.1:4300/api/health
curl -s http://127.0.0.1:4300/api/sources
```

Use `npm run refresh:source -- <id>` carefully on X sources because successful non-skipped runs can spend X API credits.

## Rules

- Never commit `.env`.
- Never delete `data/rss-reader.sqlite3` or other local data unless explicitly requested.
- Avoid destructive git operations.
- Do not revert unrelated local changes.
- Preserve existing source adapters and data contracts unless the change requires otherwise.
- Prefer official feeds/APIs where available; RSSHub is acceptable but external and can fail.
- When Chinese and English official pages duplicate each other, prefer one source, usually English, to avoid duplicate inbox items.
