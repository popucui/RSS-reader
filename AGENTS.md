# RSS-reader Agent Guide

Use this file as shared operational context for Codex, Claude Code, and other coding agents working in `/home/cuijie/workspace/web_dev/RSS-reader`.

## Project Summary

`RSS-reader` is a local-first information reader for curated RSS/RSSHub/X/web-page sources. It currently aggregates AI-related sources and has a working TypeScript backend, SQLite persistence, and React/Vite frontend.

The project is no longer only planning. Treat it as a working scaffold with real local data in `data/rss-reader.sqlite3`.

## Runtime

Node is available locally. The project has been tested with Node v24 and npm 11.

Common commands:

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run refresh:source -- <source-id>
```

`npm run dev` starts:

- API: `http://127.0.0.1:4300`
- Frontend: `http://127.0.0.1:5173`

`.env` is used for runtime configuration and must not be committed. `X_BEARER_TOKEN` is present locally for official X API access.

## GitHub Remote

The repository is pushed to GitHub at:

```text
git@github.com:popucui/RSS-reader.git
```

Use SSH authentication for GitHub operations by default. The local `origin` remote should stay on the SSH URL, not the HTTPS URL.

Common update flow:

```bash
git status --short
git add .
git commit -m "<message>"
git push
```

## Architecture

- `src/server.ts`: Fastify server, API registration, optional static frontend serving after build.
- `src/config.ts`: `.env` loading and defaults.
- `src/db/schema.ts`: SQLite connection, schema creation, idempotent lightweight migrations.
- `src/db/repository.ts`: persistence methods for sources, items, topics, fetch runs, read/star state, request limits.
- `src/fetchers/rss.ts`: RSS/Atom/RSSHub feed ingestion through `rss-parser`.
- `src/fetchers/webPage.ts`: lightweight same-domain news/research link discovery for official pages that do not expose RSS.
- `src/fetchers/x.ts`: official X API v2 REST ingestion for `x_user` and `x_search`.
- `src/fetchers/index.ts`: source type dispatch.
- `src/routes/api.ts`: REST API routes and manual refresh logic.
- `src/routes/schemas.ts`: Zod validation schemas.
- `src/scheduler.ts`: `node-cron` polling, respecting per-source interval and daily request limits.
- `src/tools/refresh-source.ts`: CLI helper to refresh a single source without relying on the dev server.
- `src/classifier.ts`: deterministic topic rules.
- `frontend/src/App.tsx`: React UI for source management, inbox, filters, read/star actions, and fetch log tab.
- `frontend/src/styles.css`: reader-style visual system and independent scrolling layout.

## Implemented Features

- Source CRUD for `rss`, `rsshub`, `web_page`, `x_user`, and `x_search`.
- RSS/RSSHub ingestion with dedupe.
- Web-page ingestion for official news/research index pages that do not provide feeds.
- Official X API ingestion with cost controls.
- SQLite item archive with FTS5 search.
- Topic labels for `ai`, `games`, `single-cell`, `biopharma`, `medicine`, and `other`.
- Manual source refresh and refresh-all.
- Fetch logs with request counts and errors.
- Inbox filters by topic, source, unread state, and search query.
- Read/star state.
- Clicking an item title opens the original URL and marks it read.
- Unread/read visual states.
- Independent scrolling for the source panel and main content panel.
- Fetch log is a tab in the main content panel, not a bottom section.

## Current Local Sources

Current database sources include:

- `OpenAI News`: `https://openai.com/news/rss.xml`, type `rss`, topic `ai`.
- `Dash Huang`: `@DashHuang`, type `x_user`, topic `ai`.
- `Anthropic News`: `https://rss.datuan.dev/anthropic/news`, type `rsshub`, topic `ai`.
- `Anthropic Research`: `https://rss.datuan.dev/anthropic/research`, type `rsshub`, topic `ai`.
- `MiniMax News`: `https://www.minimax.io/news`, type `web_page`, topic `ai`.
- `Zhipu News`: `https://www.zhipuai.cn/en/news`, type `web_page`, topic `ai`.
- `xAI News`: `https://x.ai/news`, type `web_page`, topic `ai`, currently disabled because direct fetch returns HTTP 403.

Do not assume these are seed fixtures. They live in the local SQLite database and may change.

MiniMax Chinese/English news pages are largely duplicate, and MiniMax research currently repeats the news listing. Zhipu Chinese/English news pages are largely duplicate, and the research pages currently expose no clear article links. Prefer the English news pages unless this changes.

## X API Rules

X uses official API v2 through direct REST calls in `src/fetchers/x.ts`. The code does not currently depend on an X SDK because the documented package version was not installable when tested.

Cost-saving behavior is important:

- X sources default to `fetchIntervalMinutes=1440`.
- X sources default to `dailyRequestLimit=2`.
- X fetches use `start_time = now - 24h`.
- X fetches intentionally do not paginate, even if more posts are available.
- `external_id` exists on sources to cache resolved X user ids. After a successful cache, an `x_user` fetch should need only the timeline request.
- Manual refresh and scheduler refresh both respect fetch interval and daily request limits.

Do not bypass these limits casually. If a debug command must bypass them, make that explicit and avoid accidental API spend.

## Web Page Source Rules

`web_page` sources are for official pages without RSS. They default to `fetchIntervalMinutes=1440` and `dailyRequestLimit=10`.

The current adapter intentionally keeps scope narrow:

- Fetch one HTML page only.
- Extract same-origin links under `/news/` or `/research/`.
- Do not crawl detail pages.
- Dedupe by canonical URL.
- Disable a source if it repeatedly returns blocking errors such as HTTP 403.

MiniMax News is a special case. `https://www.minimax.io/news` renders a skeleton and mixes navigation links into static HTML, so the adapter reads MiniMax's public settings endpoints for `home_tech_list` and `research_list`, then enriches current top items from detail-page JSON-LD dates. Expect about 8 ordinary web requests for one MiniMax refresh.

## Database Notes

SQLite path defaults to `./data/rss-reader.sqlite3`.

Core tables:

- `sources`: includes `external_id`, default topics, source type, enabled flag, fetch interval, daily request limit, last status.
- `items`: normalized item records with read/star state and dedupe hash.
- `item_topics`: item-topic labels.
- `fetch_runs`: per-source fetch status, item counts, new counts, request counts, and errors.
- `items_fts`: FTS5 index backed by triggers.

Keep migrations idempotent in `src/db/schema.ts`. Preserve existing user data.

## UI Guidelines

The current UI is a functional reader, not a landing page:

- Keep the first screen as source management + inbox.
- Preserve independent scrolling between left sources and right content.
- Keep fetch log as a tab, not a bottom panel.
- Preserve click-title-to-mark-read behavior.
- Avoid heavy decorative styling that reduces reading density.
- Keep unread/read distinction obvious.

## Validation

Run before handing off code changes:

```bash
npm run typecheck
npm test
npm run build
```

For behavior checks:

```bash
curl -s http://127.0.0.1:4300/api/health
curl -s http://127.0.0.1:4300/api/sources
npm run refresh:source -- 3
```

Be careful with `refresh:source` on X sources because it may spend API credits unless interval/daily limits skip the run. Web-page sources also respect interval and daily limits, but do not use paid X credits.

## Development Rules

- Do not commit `.env`, `data/`, `dist/`, `node_modules/`, SQLite files, or generated caches.
- Do not overwrite or delete local database files unless explicitly requested.
- Do not run destructive git commands.
- Do not revert unrelated user changes.
- Prefer small, testable increments.
- Keep source adapters replaceable.
- Prefer official or stable sources over brittle scraping; RSSHub is acceptable but should be treated as an external dependency.
- When Chinese and English official pages duplicate each other, prefer one source, usually English, to avoid duplicate inbox items.
