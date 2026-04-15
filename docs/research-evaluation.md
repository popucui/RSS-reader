# RSS-reader Research Evaluation

Last updated: 2026-04-15

## Goal

Build or adopt a tool that aggregates high-signal information from:

- X, formerly Twitter.
- Company websites and official blogs.
- Personal blogs.
- Topics: AI, games, single-cell biology, biopharma, medicine, and adjacent research/business news.

The important product problem is not just fetching feeds. It is source reliability, topic routing, deduplication, search, and later summarization or triage.

## Current Market Map

| Option | Fit | Strengths | Gaps / Risks | Verdict |
| --- | --- | --- | --- | --- |
| Feedly | Hosted reader | Polished UX, broad RSS discovery, AI/news workflows on paid tiers | Less suitable for custom local source adapters and owning data | Good benchmark, not ideal as a hackable base |
| Inoreader | Hosted reader | Mature RSS reader, rules/filters, web monitoring, newsletters | Custom X workflows and domain-specific pipelines are constrained by product limits | Strong off-the-shelf candidate if paid SaaS is acceptable |
| Feedbin | Hosted reader | Simple, stable, OPML import, newsletters, good API-oriented posture | X support depends on current platform constraints; limited domain-specific processing | Good reader, less ideal as a research pipeline |
| Readwise Reader | Hosted read-it-later + feeds | Excellent reading workflow, highlighting, newsletters | Not primarily an extensible ingestion system | Useful personal reading layer, not the core aggregator |
| FreshRSS | Self-hosted open-source | Mature self-hosted RSS reader, Docker-friendly, multi-user, API support | Native custom scoring/classification is limited; X still needs adapter | Best self-hosted base if adopting existing reader UI |
| Miniflux | Self-hosted open-source | Small, reliable, PostgreSQL-backed, good API, easy ops | Minimal UX and limited custom topic intelligence | Best simple backend if you want to extend around it |
| NewsBlur | Open-source + hosted | Open-source reader with training/intelligence concepts | Larger app surface; heavier to adapt | Worth studying, probably heavy as a base |
| RSSHub | Feed generation middleware | Converts many websites/services to RSS routes, self-hostable | Route availability varies; X routes can be fragile due to anti-bot/API changes | Strong companion service, not a full product |
| Folo | Newer RSSHub/RSS-focused reader | Modern reader direction, appears aligned with RSSHub ecosystem | Younger ecosystem; evaluate data ownership and extension points carefully | Interesting to watch, not first base choice yet |
| Huginn / n8n | Automation platforms | Flexible source polling and notification flows | Reader UX, archive, dedupe, search, and taxonomy need custom work | Good for glue jobs, not the primary reader |

Sources checked: [FreshRSS](https://freshrss.org/), [Miniflux](https://miniflux.app/), [RSSHub docs](https://docs.rsshub.app/), [Feedbin](https://feedbin.com/), [Inoreader](https://www.inoreader.com/), [NewsBlur](https://www.newsblur.com/), [Folo](https://folo.is/), [X API docs](https://docs.x.com/).

## X / Twitter Strategy

X is still the hardest source category, but paid official API access is acceptable for this project.

The official X API is a pay-per-use product with REST endpoints, filtered stream, full-archive search, usage/cost monitoring in the Developer Console, and official Python and TypeScript SDKs. This makes official API integration a realistic first-class path rather than only a future fallback.

Treat X ingestion as a replaceable adapter with three possible modes:

- Official API mode: most compliant and stable when budget allows.
- RSSHub or third-party route mode: practical for experiments but must be monitored.
- Manual/export fallback: useful for validation if credentials, rate limits, or costs block progress.

The first workable version should support the official API path if credentials are available. It should also include cost and quota guardrails:

- Per-source fetch interval.
- Daily request ceiling.
- User/account allowlist.
- Stored API usage notes in fetch logs.
- Clear error states for quota, auth, and rate-limit failures.

## Adoption Recommendation

There are two viable directions:

1. Use an existing reader as the main app:
   FreshRSS or Miniflux + RSSHub + a custom enrichment sidecar.

2. Build a small custom reader:
   TypeScript/Node.js or Python + SQLite/Postgres + RSS parser + scheduled jobs + simple web UI.

For this project, I recommend starting with a custom small reader instead of deeply modifying FreshRSS/Miniflux.

Reasoning:

- The domain value is topic intelligence, source curation, and source adapters.
- A first version can be small: feed registry, polling, item archive, tags, unread/read, search, source reliability status.
- Existing readers are excellent for generic reading, but custom classification and cross-domain workflows will likely become the center of gravity.
- FreshRSS/Miniflux can still be used as references or fallback import/export targets through OPML.

## Language / Stack Evaluation

The language is open. Existing local projects use Python, but that should not force this project.

| Stack | Strengths | Risks | Fit |
| --- | --- | --- | --- |
| TypeScript + Node.js + Hono/Fastify/Express | Strong full-stack consistency, official X TypeScript SDK, good RSS/HTML parsing libraries, easy later React/Next UI, type-safe app code | More decisions around migrations/jobs; Node background workers need discipline | Best default if X API and web UI are both first-class |
| Next.js full-stack | Fast UI development, API routes, React ecosystem, easy deployment path | Can become too framework-heavy for a local daemon/reader; scheduled polling needs separate worker or cron | Good if polished UI becomes central early |
| Python + Flask/FastAPI | Excellent scraping/parsing ecosystem, simple SQLite apps, strong data/LLM tooling, matches existing local projects | Frontend may stay more manual; official X Python SDK is available but UI ergonomics weaker than TS | Best if ingestion/data processing dominates |
| Go | Excellent single binary, concurrency, low ops burden | Slower UI iteration and fewer ready-made RSS/scraping conveniences | Good later if turning into a robust daemon |
| Rust | High reliability and performance | Too much implementation cost for FWV | Not recommended for FWV |

Recommended default now: TypeScript + Node.js.

Reasoning:

- Official X API has a TypeScript/JavaScript SDK.
- The project is a web reader, so TypeScript can cover backend APIs, source adapters, shared types, and a future richer frontend.
- RSS/Atom parsing, SQLite access, background jobs, and HTTP clients are mature enough in Node.
- Python remains useful for later enrichment jobs, notebook-style experiments, or LLM/data pipelines, but does not need to own the main app.

## Recommended Architecture Direction

Use a local-first, dependency-light TypeScript stack:

- Backend: Node.js 20+ with TypeScript. Prefer Fastify or Hono for typed HTTP routes; Express is acceptable if speed matters more than type ergonomics.
- Storage: SQLite for FWV; keep schema portable to PostgreSQL.
- Fetching: RSS parser library, `undici`/native `fetch`, HTML parser only when needed, optional Playwright only for difficult pages.
- X: official X TypeScript SDK or direct REST client, behind an adapter interface.
- Jobs: `node-cron`, `bree`, or a simple in-process scheduler for FWV.
- UI: React/Vite or server-rendered templates. Prefer React/Vite if TypeScript is chosen and filter/search interactions grow quickly.
- Search: SQLite FTS5 first; Meilisearch only after search becomes a bottleneck.
- AI layer: optional after archive quality is proven. Start with rule-based topic tags and source labels.

## First Workable Version Scope

FWV should prove that the system can reliably collect and triage sources without overbuilding.

Must have:

- Source registry: name, URL, source type, topic labels, enabled flag, fetch interval.
- RSS/Atom ingestion for company sites and blogs.
- Official X API source support for tracked accounts/lists/search queries when credentials are configured.
- RSSHub-compatible source support as a fallback or non-X feed adapter.
- Item archive with canonical URL, title, author, summary/content snippet, published time, fetched time, source id.
- Deduplication by canonical URL, GUID, and title/source fallback.
- Topic labels: AI, games, single-cell, biopharma, medicine, other.
- Inbox view: newest items, topic filters, source filters, unread/read, star/save.
- Full-text search over title + summary/content.
- Manual refresh and fetch logs visible in UI.
- OPML import/export.

Should defer:

- Multi-user accounts.
- Mobile app.
- Complex recommendation algorithms.
- LLM summaries for every item.
- Browser extension.
- Multi-account X auth flows beyond the owner-operated account/API app.

## Build / Buy Decision

No existing tool appears to meet the full requirement without meaningful customization. The closest low-code path is:

FreshRSS or Miniflux as reader + RSSHub as source adapter + custom external scripts for topic scoring.

The better product path is:

Custom RSS-reader FWV + official X API adapter + RSS/Atom ingestion + optional RSSHub fallback, while preserving OPML compatibility so migration remains cheap.
