import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientIp, isRateLimited, rateLimitResponse } from "./rate-limit";

describe("isRateLimited", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    const key = `test-${crypto.randomUUID()}`;
    expect(isRateLimited(key, 3)).toBe(false);
    expect(isRateLimited(key, 3)).toBe(false);
    expect(isRateLimited(key, 3)).toBe(false);
  });

  it("blocks once the limit is exceeded within the window", () => {
    const key = `test-${crypto.randomUUID()}`;
    expect(isRateLimited(key, 2)).toBe(false);
    expect(isRateLimited(key, 2)).toBe(false);
    expect(isRateLimited(key, 2)).toBe(true);
  });

  it("tracks separate buckets per key", () => {
    const keyA = `test-a-${crypto.randomUUID()}`;
    const keyB = `test-b-${crypto.randomUUID()}`;
    expect(isRateLimited(keyA, 1)).toBe(false);
    expect(isRateLimited(keyA, 1)).toBe(true);
    expect(isRateLimited(keyB, 1)).toBe(false);
  });

  it("resets the bucket once the window elapses", () => {
    vi.useFakeTimers();
    const key = `test-${crypto.randomUUID()}`;
    expect(isRateLimited(key, 1, 1_000)).toBe(false);
    expect(isRateLimited(key, 1, 1_000)).toBe(true);
    vi.advanceTimersByTime(1_001);
    expect(isRateLimited(key, 1, 1_000)).toBe(false);
    vi.useRealTimers();
  });
});

describe("clientIp", () => {
  it("prefers the first x-forwarded-for entry", () => {
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(clientIp(request)).toBe("1.2.3.4");
  });

  it("trims whitespace around the first forwarded entry", () => {
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" },
    });
    expect(clientIp(request)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const request = new Request("https://example.com", {
      headers: { "x-real-ip": "9.9.9.9" },
    });
    expect(clientIp(request)).toBe("9.9.9.9");
  });

  it("falls back to 'unknown' when no proxy headers are set", () => {
    const request = new Request("https://example.com");
    expect(clientIp(request)).toBe("unknown");
  });
});

describe("rateLimitResponse", () => {
  it("returns a 429 with an error payload", async () => {
    const res = rateLimitResponse();
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ error: "Too many requests. Please slow down." });
  });
});
