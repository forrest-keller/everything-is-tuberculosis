/**
 * Best-effort, per-process in-memory rate limiting. Fine for blunting casual
 * abuse (a script hammering the Wikimedia-backed routes) on a single small
 * server, but a multi-instance/serverless deployment won't share this state
 * across instances — see docs/wikimedia-enterprise-scaling-plan.md for the
 * caching layer this should eventually sit alongside.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60_000;

/** Drops expired buckets periodically so long-lived processes don't
 * accumulate one entry per distinct IP forever. */
function sweepExpired(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

/** Returns true if `key` has exceeded `limit` requests within `windowMs`. */
export function isRateLimited(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  sweepExpired(now);

  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (bucket.count >= limit) return true;
  bucket.count++;
  return false;
}

/** Best-effort caller IP from proxy headers; falls back to "unknown" (which
 * still rate-limits, just as one shared bucket) when nothing is set. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function rateLimitResponse(): Response {
  return Response.json({ error: "Too many requests. Please slow down." }, { status: 429 });
}
