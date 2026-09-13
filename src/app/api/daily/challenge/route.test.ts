import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupFixtures, getTestServiceClient, insertDailyChallenge } from "@/test/db";

const { isRateLimited } = vi.hoisted(() => ({ isRateLimited: vi.fn(() => false) }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, isRateLimited };
});

// getOrCreateTodayChallenge itself runs for real against the local Supabase
// instance (see daily-server.test.ts) — only the Wikipedia network call it
// falls back to when today's row doesn't exist yet is mocked here.
const { fetchRandomStartArticle } = vi.hoisted(() => ({ fetchRandomStartArticle: vi.fn() }));
vi.mock("@/lib/wikipedia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wikipedia")>();
  return { ...actual, fetchRandomStartArticle };
});

import { WikipediaError } from "@/lib/wikipedia";
import { GET } from "./route";

const TODAY = new Date().toISOString().slice(0, 10);

describe("GET /api/daily/challenge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRateLimited.mockReturnValue(false);
  });

  afterEach(async () => {
    await cleanupFixtures();
    await getTestServiceClient().from("daily_challenges").delete().eq("challenge_date", TODAY);
  });

  it("returns 429 when rate limited", async () => {
    isRateLimited.mockReturnValue(true);
    const res = await GET(new NextRequest("http://localhost/api/daily/challenge"));
    expect(res.status).toBe(429);
  });

  it("returns today's challenge when it already exists", async () => {
    await insertDailyChallenge({ start_title: "Existing Article" });

    const res = await GET(new NextRequest("http://localhost/api/daily/challenge"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ challenge_date: TODAY, start_title: "Existing Article" });
    expect(fetchRandomStartArticle).not.toHaveBeenCalled();
  });

  it("creates today's challenge on first request", async () => {
    fetchRandomStartArticle.mockResolvedValue({
      title: "Fresh Article",
      html: "<p/>",
      isTarget: false,
    });

    const res = await GET(new NextRequest("http://localhost/api/daily/challenge"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ challenge_date: TODAY, start_title: "Fresh Article" });
  });

  it("returns 502 on a WikipediaError", async () => {
    fetchRandomStartArticle.mockRejectedValue(new WikipediaError("Wikipedia is down"));
    const res = await GET(new NextRequest("http://localhost/api/daily/challenge"));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "Wikipedia is down" });
  });

  it("returns 500 with the error message on an unexpected failure", async () => {
    fetchRandomStartArticle.mockRejectedValue(new Error("boom"));
    const res = await GET(new NextRequest("http://localhost/api/daily/challenge"));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "boom" });
  });

  it("returns a default 500 message when something other than an Error is thrown", async () => {
    fetchRandomStartArticle.mockRejectedValue("not an Error instance");
    const res = await GET(new NextRequest("http://localhost/api/daily/challenge"));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to load today's challenge." });
  });
});
