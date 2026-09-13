# Wikimedia Enterprise scaling plan

This documents what would need to change in the Wikimedia Enterprise
integration ([src/lib/wikipedia.ts](../src/lib/wikipedia.ts)) as traffic grows
beyond hobby-project levels, and in what order. It's a plan to work from when
scale actually demands it, not a to-do list to implement today.

## Current state

- Article content: `POST /v2/articles/{name}` (Wikimedia Enterprise on-demand
  API), authenticated via a username/password login that's cached and
  refreshed in-process.
- Random start article: the free public
  `en.wikipedia.org/api/rest_v1/page/random/summary` endpoint (Enterprise has
  no discovery/random endpoint).
- Redirect resolution (a clicked link's title turns out to be a redirect):
  the free public MediaWiki `action=query&redirects=1` endpoint (Enterprise
  has no forward redirect lookup — its `redirects` field only lists incoming
  redirects on the canonical article, not the reverse).
- No caching layer: every article fetch, including repeats of the same
  popular page, hits the on-demand API live and re-runs sanitization.
- Token state lives in one process's memory, so every server instance logs
  in and refreshes independently.

## Why this won't hold up at scale

1. **On-demand API quota.** The free tier is 50,000 requests/month. Without
   caching, every view of every article — including the "Tuberculosis" target
   itself and any commonly-linked hub article — counts separately, every
   time, for every player. This is the first thing that will run out.
2. **Per-instance token handling.** In-memory caching works for one
   long-lived process. On serverless/multi-instance deployments, each cold
   instance logs in independently, multiplying login calls and adding
   latency to whichever request draws the short straw.
3. **Public API dependency.** Random-pick and redirect-resolution both still
   depend on Wikipedia's public endpoints. Wikimedia's rate limit (200
   req/min for unauthenticated traffic with a descriptive `User-Agent`) is
   generous at hobby scale but is a shared, best-effort service — not
   something to build a scaled product on, and it doesn't satisfy a
   requirement to avoid public APIs entirely.
4. **No content cache.** Repeated fetches of identical articles mean
   repeated network round-trips _and_ repeated cheerio/sanitize-html work
   for output that hasn't changed. This cost scales linearly with traffic
   for no reason.
5. **Storage/cost cliff if the public API is dropped entirely.** Replacing
   the public-API calls means ingesting Wikimedia Enterprise's Snapshot data
   locally (see Phase 4) — multi-gigabyte database footprint, a real
   monthly hosting cost, and a new pipeline to maintain.

## Phased plan

### Phase 1 — cache fetched article content (do this first, regardless of traffic)

Cache sanitized article HTML by canonical title (e.g. a Supabase table
`article_cache(title, html, fetched_at)` with a TTL on the order of a day —
Wikipedia content changes far less often than game traffic repeats it).

This is the highest-value, lowest-effort change available: a handful of
articles (the target, common hub pages, whatever's currently viral) will
account for a disproportionate share of requests, so caching them cuts
on-demand API usage — and repeated sanitization CPU cost — dramatically.
Do this well before quota is a problem, not after.

### Phase 2 — centralize token management

Move the Wikimedia Enterprise access/refresh token out of per-process memory
into a shared store (a Supabase table, or a small KV/Redis) with a
single-flight lock, so every server instance shares one token lifecycle
instead of logging in independently. Only matters once the deployment is
genuinely multi-instance/serverless at scale; a single long-lived dev/small
prod server doesn't need this yet.

### Phase 3 — usage observability

Track monthly on-demand request counts (a simple counter, incremented per
`fetchArticle` call that isn't a cache hit) against the 50,000/month
free-tier ceiling, with an alert well before it's reached. This is what
tells you _when_ Phase 4 is actually necessary, instead of guessing.

### Phase 4 — remove the public API dependency

Build a local title + redirect index from Wikimedia Enterprise's Snapshot
API, and stop calling any public Wikipedia endpoint:

- Ingest `enwiki_namespace_0` via `GET /v2/snapshots/enwiki_namespace_0/chunks`
  and `GET /v2/snapshots/enwiki_namespace_0/chunks/{chunk_id}/download`,
  field-filtered to just `name` and `redirects` (not `article_body` — that's
  still fetched live from the on-demand API per Phase 1's cache).
- Store the canonical title list and an inverted `redirect name → canonical
name` map in Supabase.
- `fetchRandomTitle()` becomes a local random-row query; redirect resolution
  becomes a local table lookup.

**Do this only when Phase 3's numbers say it's needed, or when "no public
API at all" is a hard, permanent requirement** rather than an
implementation detail — it trades a live dependency for a real recurring
cost and a new pipeline to operate:

- **Storage:** roughly 2–3 GB for 7.24M titles + 11.8M redirects (name data
  only, no article bodies) — see the estimate breakdown below.
- **Supabase plan:** exceeds the free tier's 500 MB, so this requires at
  least Pro ($25/month, 8 GB included).
- **Snapshot free-tier quota:** capped at 30 requests / 1,500 chunks per
  month, and this is a count of chunk-download calls, not a byte quota.
  Chunk boundaries (`enwiki_namespace_0_chunk_0`, `_chunk_1`, ...) appear to
  be fixed at snapshot-generation time based on the _full_ corpus (enwiki's
  full snapshot, with article bodies, is reportedly over a terabyte) —
  filtering `fields` down to `name`/`redirects` shrinks the bytes in each
  chunk but almost certainly does **not** reduce how many chunks
  `enwiki_namespace_0` is split into. So field-filtering helps the storage
  estimate below, but doesn't by itself tell us whether a monthly refresh
  fits under the 1,500-chunk cap. That can only be confirmed by calling
  `GET /v2/snapshots/enwiki_namespace_0/chunks` with real credentials and
  counting the result — if it doesn't fit, a paid Snapshot tier is also
  required.
- **Staleness window:** the free Snapshot tier updates monthly, so articles
  and redirects created since the last sync won't resolve until the next
  one (paid tiers get daily updates).

### Phase 5 — keep the index fresh continuously

If Phase 4 is done and monthly staleness starts causing visible problems
(broken links to newly-created redirects, missing new articles), move from
monthly Snapshot re-syncs to Wikimedia Enterprise's Realtime Updates API to
apply incremental changes continuously. Only worth the added complexity once
Phase 4's monthly cadence is demonstrably not good enough.

## Storage estimate detail (Phase 4)

Using current English Wikipedia counts (7,238,931 articles, 11.8M redirects
— [Wikipedia:Statistics](https://en.wikipedia.org/wiki/Wikipedia:Statistics)):

| Table     | Rows  | Est. bytes/row (data + indexes) | Est. size   |
| --------- | ----- | ------------------------------- | ----------- |
| Titles    | 7.24M | ~115                            | ~0.85 GB    |
| Redirects | 11.8M | ~100                            | ~1.2 GB     |
| **Total** |       |                                 | **~2–3 GB** |

This is names and an integer link between them, not article content — full
HTML dumps of Wikipedia run 50–100+ GB, which is exactly what filtering the
Snapshot's `fields` to `name`/`redirects` avoids.

## Open decisions that change this plan

- **Is "no public API" permanent or a placeholder?** If it's a hard
  requirement regardless of traffic, Phase 4 isn't optional and should be
  scheduled on its own timeline rather than waiting on Phase 3's quota
  alarms.
- **What traffic/scale is actually being planned for?** This sizes Phase 1's
  cache TTL and Phase 3's alert thresholds.
- **Budget tolerance for recurring cost.** Phase 4 implies Supabase Pro
  ($25/month minimum) plus, potentially, a paid Wikimedia Enterprise tier
  (custom pricing — contact sales) if free-tier Snapshot or on-demand quotas
  don't cover actual usage.

## Reference

- On-demand API: `POST https://api.enterprise.wikimedia.com/v2/articles/{name}`
  — free tier: 50,000 requests/month.
- Snapshot API: `GET /v2/snapshots/{identifier}/chunks`,
  `GET /v2/snapshots/{identifier}/chunks/{chunk_id}/download` — free tier:
  30 requests / 1,500 chunks per month, monthly update cadence (daily on
  paid plans).
- Auth: `POST https://auth.enterprise.wikimedia.com/v1/login` and
  `/v1/token-refresh` — token lifetime comes from the response's
  `expires_in`, already handled dynamically in
  [src/lib/wikipedia.ts](../src/lib/wikipedia.ts) rather than hardcoded.
- Public Wikipedia REST/Action API rate limit (relevant until Phase 4):
  200 req/min for unauthenticated requests with a descriptive `User-Agent`.
- Supabase pricing: free tier 500 MB database storage; Pro plan $25/month
  including 8 GB.
