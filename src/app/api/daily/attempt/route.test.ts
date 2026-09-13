import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupFixtures, getTestServiceClient, insertDailyChallenge } from "@/test/db";

const { isRateLimited } = vi.hoisted(() => ({ isRateLimited: vi.fn(() => false) }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, isRateLimited };
});

// Only the Wikipedia network calls are mocked; getOrCreateTodayChallenge and
// the daily_scores insert both run for real against the local instance.
const { fetchArticle, fetchRandomStartArticle } = vi.hoisted(() => ({
  fetchArticle: vi.fn(),
  fetchRandomStartArticle: vi.fn(),
}));
vi.mock("@/lib/wikipedia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wikipedia")>();
  return { ...actual, fetchArticle, fetchRandomStartArticle };
});

import { WikipediaError } from "@/lib/wikipedia";
import { POST } from "./route";

const TODAY = new Date().toISOString().slice(0, 10);

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/daily/attempt", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/daily/attempt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRateLimited.mockReturnValue(false);
    fetchArticle.mockResolvedValue({ title: "Bacteria", html: "<p/>", isTarget: false });
  });

  afterEach(async () => {
    await cleanupFixtures();
    await getTestServiceClient().from("daily_challenges").delete().eq("challenge_date", TODAY);
  });

  it("returns 429 when rate limited", async () => {
    isRateLimited.mockReturnValue(true);
    const res = await POST(makeRequest({ playerId: crypto.randomUUID(), playerName: "Alice" }));
    expect(res.status).toBe(429);
  });

  it("returns 400 when playerId or playerName is missing", async () => {
    const res = await POST(makeRequest({ playerId: crypto.randomUUID() }));
    expect(res.status).toBe(400);
  });

  it("creates an attempt and returns the start article", async () => {
    await insertDailyChallenge({ start_title: "Bacteria" });
    const playerId = crypto.randomUUID();

    const res = await POST(makeRequest({ playerId, playerName: "Alice" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ title: "Bacteria", html: "<p/>", isTarget: false });
    expect(typeof body.attemptId).toBe("string");

    const db = getTestServiceClient();
    const { data } = await db.from("daily_scores").select("*").eq("id", body.attemptId).single();
    expect(data).toMatchObject({
      challenge_date: TODAY,
      player_id: playerId,
      player_name: "Alice",
      status: "in_progress",
      path: ["Bacteria"],
    });
  });

  it("returns 400 when the insert fails for real (invalid player id)", async () => {
    // player_id is a uuid column with no format validation upstream — a
    // non-UUID string is a genuine Postgres error, not a mocked one.
    await insertDailyChallenge({ start_title: "Bacteria" });

    const res = await POST(makeRequest({ playerId: "not-a-uuid", playerName: "Alice" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/uuid/i);
  });

  it("returns 502 when the article fetch fails with a WikipediaError", async () => {
    await insertDailyChallenge({ start_title: "Bacteria" });
    fetchArticle.mockRejectedValue(new WikipediaError("Wikipedia is down"));

    const res = await POST(makeRequest({ playerId: crypto.randomUUID(), playerName: "Alice" }));

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "Wikipedia is down" });
  });

  it("returns 500 with the real error message on an unexpected failure", async () => {
    // No pre-seeded challenge, and a null title violates daily_challenges'
    // real NOT NULL constraint — getOrCreateTodayChallenge throws for real.
    fetchRandomStartArticle.mockResolvedValue({ title: null, html: "<p/>", isTarget: false });

    const res = await POST(makeRequest({ playerId: crypto.randomUUID(), playerName: "Alice" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/null value|not-null/i);
  });
});
