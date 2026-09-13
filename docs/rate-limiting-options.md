# Shared-store rate limiting: options

[src/lib/rate-limit.ts](../src/lib/rate-limit.ts) implements per-IP rate
limiting as a per-process in-memory `Map` (added in c8a692a to guard the
Wikimedia-backed routes against quota exhaustion and general spam). It says
so itself in its top comment: this holds up on one long-lived server process,
but not on a horizontally-scaled or serverless host, where concurrent
requests can land on different instances that each have their own empty
counter. This documents the options for replacing it with a shared store,
to work from when that hardening is actually needed — not a decision made
yet.

## Current state

- 11 call sites across the API routes (`src/app/api/**/route.ts`), each
  calling `isRateLimited(`\<route-key\>:${clientIp(request)}`, limit)` with a
  route-specific limit (10–60) and the default 60s window.
- All are synchronous, in-process `Map` reads/writes — no network round trip,
  effectively free.
- `clientIp()` and `rateLimitResponse()` are host-agnostic and don't need to
  change under any of the options below.

## Why this doesn't hold up under horizontal scaling

- A burst of concurrent requests from one IP gets spread across however many
  instances are running at that moment — each instance's `Map` starts empty,
  so the effective limit is roughly `configured limit × concurrent instance
count`, not the configured limit.
- On a host that scales to zero when idle (common for low/hobby traffic),
  even non-concurrent, slow-and-steady abuse can keep hitting fresh cold
  starts with an empty counter.
- This is exactly the failure mode that matters: a script deliberately
  hammering a route to exhaust the Wikimedia Enterprise quota (50k
  req/month, see
  [wikimedia-enterprise-scaling-plan.md](wikimedia-enterprise-scaling-plan.md))
  is a burst/concurrent pattern, not a single-threaded trickle.
- It still incidentally throttles the laziest case — one script making
  requests sequentially against a single warm instance — so it's not a pure
  no-op today. It just isn't something to call "hardened."

## Options

### A. Upstash Redis

The standard pairing for a Next.js app that already isn't tied to one
long-lived server: `@upstash/ratelimit` + `@upstash/redis`. Talks to Redis
over HTTP (REST), so it works from any serverless/edge runtime without
holding a persistent connection.

- Ships sliding-window, fixed-window, and token-bucket limiters out of the
  box — no need to hand-roll the bucket logic currently in `rate-limit.ts`.
- Free tier: 500k commands/month, which comfortably covers 11 routes at
  hobby-project traffic (each check is ~1-2 Redis commands).
- Adds a new vendor and an env-var pair (`UPSTASH_REDIS_REST_URL`,
  `UPSTASH_REDIS_REST_TOKEN`).
- `isRateLimited` becomes `async` (one network round trip per check) — all
  11 call sites need `await` added; they're already inside `async` route
  handlers, so that's a one-line change per site.

### B. Supabase-backed counter (Postgres)

Reuse the Postgres database already in this stack instead of adding a
vendor. A table like `rate_limit_buckets(key text primary key, count int,
reset_at timestamptz)`, updated with a single atomic upsert (`INSERT ...
ON CONFLICT (key) DO UPDATE ...` or a small `plpgsql` function to keep the
check-and-increment atomic under concurrent requests).

- No new vendor, no new env vars — same Supabase project already configured.
- Adds real latency (a DB round trip on every rate-limited request, on top
  of whatever that route was already doing) and load on the same database
  that's serving actual app data — 11 call sites' worth of writes, some
  windowed as low as 60 req/min (`daily-challenge`, `party-navigate`,
  `daily-navigate`).
- No built-in TTL: expired buckets need either a periodic cleanup (e.g. a
  `pg_cron` job, mirroring `sweepExpired()`'s job today) or a windowed key
  design (`key:${Math.floor(now / windowMs)}`) that lets old rows just age
  out unqueried, at the cost of an unbounded row count without that cleanup.
- Same `async` migration shape as option A.

### C. Platform-level rate limiting (edge/WAF)

Some hosts offer rate limiting as an infrastructure feature — e.g. edge
middleware or a firewall/WAF rate-limiting rule — that applies before a
request reaches app code, sidestepping the per-instance problem entirely
because the limiting happens at the shared edge layer, not in each compute
instance.

- No app code changes, no new vendor if the current host already offers it
  on the plan in use.
- Coarser-grained: typically one rule shape (path pattern + threshold)
  rather than the current per-route limits (10 vs 60, keyed by route name).
  Replicating today's 11 distinct route/limit pairs may not map cleanly
  onto what the platform's rule UI/config supports.
- Ties the mitigation to a specific host's product tier rather than to
  portable application code — worth weighing against how likely a host
  change is.

## Comparison

|                      | New vendor?          | Extra latency/request | Extra infra load       | Per-route granularity  | Migration effort                                                  |
| -------------------- | -------------------- | --------------------- | ---------------------- | ---------------------- | ----------------------------------------------------------------- |
| A. Upstash Redis     | Yes                  | ~1 Redis round trip   | None (dedicated store) | Full (same as today)   | Low — swap internals, add `await`                                 |
| B. Supabase counter  | No                   | 1 DB round trip       | Yes, on existing DB    | Full (same as today)   | Low — swap internals, add `await`, need a migration + cleanup job |
| C. Platform edge/WAF | Depends on host/plan | ~None (edge-side)     | None                   | Coarse, host-dependent | Varies — no app code, but config-only and host-specific           |

## Recommendation

Option A (Upstash Redis) is the lowest-effort correct fix if adding one more
managed dependency is acceptable — it's purpose-built for this exact
problem, keeps the current per-route granularity, and its serverless
(HTTP-based) design matches whatever runtime actually hosts this app.
Option B is the fallback if minimizing vendor count outweighs the added DB
latency/load. Option C is worth a quick check of the actual deploy target's
feature set before building either A or B, since "no app code at all" beats
both if the host already covers it.

## Open decisions

- **What host is this actually deployed to?** Not pinned down in
  [README.md](../README.md) today ("whatever platform runs the app") —
  determines whether option C is available at all, and whether it's even
  worth building A/B if C already covers it.
- **Is Redis an acceptable new dependency**, or should vendor count stay
  minimal (favoring option B)?
- **Traffic volume** — at genuinely hobby-project scale, is this worth doing
  before something else on
  [wikimedia-enterprise-scaling-plan.md](wikimedia-enterprise-scaling-plan.md)
  (e.g. Phase 1's article cache), or does it matter now because the app is
  about to be exposed publicly regardless of traffic level?
