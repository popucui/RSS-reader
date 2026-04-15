# RSS-reader Development Plan

## Product Shape

`RSS-reader` is a local-first information cockpit for curated source monitoring. It should behave like a reader first and an intelligence pipeline second.

The initial goal is to collect, dedupe, search, and triage items across AI, games, single-cell biology, biopharma, and medicine sources.

## First Workable Version

### Core Data Model

- `sources`
  - `id`, `name`, `url`, `type`, `topics`, `enabled`, `fetch_interval_minutes`, `daily_request_limit`, `last_fetch_at`, `last_status`, `created_at`.
- `items`
  - `id`, `source_id`, `guid`, `canonical_url`, `title`, `author`, `summary`, `content_text`, `published_at`, `fetched_at`, `hash`, `read_at`, `starred`.
- `item_topics`
  - `item_id`, `topic`, `confidence`, `origin`.
- `fetch_runs`
  - `id`, `source_id`, `started_at`, `finished_at`, `status`, `item_count`, `new_count`, `request_count`, `error`.

### Backend

Use TypeScript + Node.js as the new default unless later implementation evidence points back to Python.

Reasoning:

- X can be accessed through the paid official API, and X provides an official TypeScript/JavaScript SDK.
- A reader is a web product; TypeScript can cover backend APIs, source adapter contracts, frontend types, and later richer UI.
- Node has mature RSS parsing, SQLite, HTTP, and scheduler libraries.
- Python remains a good companion for later enrichment or analysis jobs, but does not need to own the core app.

Suggested modules:

- `src/server.ts`: HTTP server and route registration.
- `src/config.ts`: `.env` and defaults.
- `src/db/`: SQLite connection, schema, migrations, query helpers.
- `src/fetchers/rss.ts`: RSS/Atom ingestion.
- `src/fetchers/x.ts`: official X API ingestion.
- `src/fetchers/rsshub.ts`: RSSHub route ingestion, same output contract as RSS.
- `src/classifier.ts`: deterministic topic rules first.
- `src/scheduler.ts`: polling jobs.
- `src/types.ts`: shared source/item/fetch result contracts.
- `src/web/` or `frontend/`: UI code, depending on framework choice.

Candidate libraries:

- HTTP server: Fastify or Hono.
- SQLite: `better-sqlite3` for simplicity, or Drizzle ORM if typed schema/migrations are useful.
- RSS: `rss-parser`.
- Jobs: `node-cron` or a simple in-process scheduler first.
- X: official X TypeScript SDK or direct REST client behind `XFetcher`.
- UI: React + Vite if building a richer single-page inbox; server-rendered HTML is still acceptable for a very small FWV.

### UI

Pages:

- `/`: inbox timeline with topic/source filters.
- `/sources`: add/edit/disable sources and see last fetch status.
- `/items/<id>`: item detail with original link and extracted content.
- `/search`: full-text search.

APIs:

- `GET /api/items`
- `GET /api/sources`
- `POST /api/sources`
- `PUT /api/sources/<id>`
- `DELETE /api/sources/<id>` or soft-disable only
- `POST /api/sources/<id>/refresh`
- `POST /api/refresh`
- `POST /api/items/<id>/read`
- `POST /api/items/<id>/star`
- `GET /api/search`

### Topic Classification

FWV should use deterministic rules:

- Source-level default topics.
- Keyword rules per topic.
- Manual override allowed later.

LLM summarization/classification should wait until ingestion quality and source set are stable.

### Source Plan

Start with 20-40 curated sources:

- AI: OpenAI, Anthropic, Google DeepMind, Meta AI, research labs, high-signal personal blogs.
- Games: company blogs, engine/dev blogs, game business sources.
- Single-cell / bio: lab blogs, journal feeds, preprint feeds, company newsrooms.
- Biopharma / medicine: company newsrooms, FDA/EMA feeds, medical journals, biotech analysts with available RSS.
- X: if official API credentials are available, start with tracked users or lists through the official API. Keep RSSHub as fallback, not the primary path.

### Milestones

1. Project scaffold:
   TypeScript app, SQLite schema, source CRUD, item table, basic pages.

2. RSS ingestion:
   Add `rss-parser`, manual refresh, dedupe, fetch logs.

3. Inbox:
   Timeline, topic/source filters, read/star state.

4. Search and OPML:
   SQLite FTS5, OPML import/export.

5. Official X adapter:
   Add X API adapter, credentials config, request limits, and test a few tracked accounts/lists/search queries.

6. Enrichment:
   Keyword topic rules, basic scoring, saved views.

## Validation Strategy

Run during development:

```bash
npm run typecheck
npm test
npm run dev
```

When UI exists, run a temporary local server on a free port and verify:

- Add source.
- Refresh source.
- New item appears.
- Item dedupes on second refresh.
- Topic filter works.
- Search returns expected item.

## Open Decisions

- TypeScript framework: choose Fastify, Hono, or Next.js after scaffold decision. Default should be a simple Node API plus lightweight UI, not a heavy framework by reflex.
- SQLite vs Postgres: default SQLite for FWV; keep schema migration logic portable.
- Custom UI vs existing reader: default custom FWV; keep OPML compatibility.
- X access: official API is acceptable and should be treated as the primary path when credentials are available; RSSHub remains fallback.
