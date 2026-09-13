import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupFixtures, insertDailyChallenge, insertDailyScore } from "@/test/db";
import {
  createDailyAttempt,
  fetchDailyLeaderboard,
  fetchTodayChallenge,
  getTodayDateString,
  navigateDailyAttempt,
} from "./daily";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanupFixtures();
});

describe("getTodayDateString", () => {
  it("returns today's date as YYYY-MM-DD", () => {
    expect(getTodayDateString()).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe("fetchTodayChallenge", () => {
  it("returns the challenge date and start title", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ challenge_date: "2026-01-01", start_title: "Bacteria" })),
    );
    await expect(fetchTodayChallenge()).resolves.toEqual({
      challengeDate: "2026-01-01",
      startTitle: "Bacteria",
    });
  });

  it("throws the server's error message on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "down" }, 500)));
    await expect(fetchTodayChallenge()).rejects.toThrow("down");
  });

  it("throws a default message when the error body has no error field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    await expect(fetchTodayChallenge()).rejects.toThrow("Failed to load today's challenge.");
  });
});

describe("createDailyAttempt", () => {
  it("posts the player info and returns the attempt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        attemptId: "attempt-1",
        title: "Bacteria",
        html: "<p>hi</p>",
        isTarget: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const attempt = await createDailyAttempt({ playerId: "p1", playerName: "Alice" });
    expect(attempt).toEqual({
      attemptId: "attempt-1",
      article: { title: "Bacteria", html: "<p>hi</p>", isTarget: false },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/daily/attempt",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws the server's error message on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, 400)));
    await expect(createDailyAttempt({ playerId: "p1", playerName: "Alice" })).rejects.toThrow(
      "nope",
    );
  });

  it("throws a default message when the error body has no error field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    await expect(createDailyAttempt({ playerId: "p1", playerName: "Alice" })).rejects.toThrow(
      "Failed to start today's attempt.",
    );
  });
});

describe("navigateDailyAttempt", () => {
  it("posts the click and returns the navigation result", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ title: "Tuberculosis", html: "<p>TB</p>", isTarget: true, clicks: 3 }),
        ),
    );
    await expect(navigateDailyAttempt("attempt-1", "p1", "Tuberculosis")).resolves.toEqual({
      title: "Tuberculosis",
      html: "<p>TB</p>",
      isTarget: true,
      clicks: 3,
    });
  });

  it("throws a title-specific default message on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    await expect(navigateDailyAttempt("attempt-1", "p1", "Some Title")).rejects.toThrow(
      'Failed to load "Some Title".',
    );
  });
});

describe("fetchDailyLeaderboard", () => {
  let challengeDate: string;

  beforeEach(async () => {
    const challenge = await insertDailyChallenge();
    challengeDate = challenge.challenge_date;
  });

  it("returns only finished scores for the date, ordered by clicks then duration", async () => {
    await insertDailyScore({
      challengeDate,
      playerName: "Slow",
      status: "finished",
      clicks: 5,
      durationMs: 1000,
    });
    await insertDailyScore({
      challengeDate,
      playerName: "Fast",
      status: "finished",
      clicks: 2,
      durationMs: 500,
    });
    await insertDailyScore({
      challengeDate,
      playerName: "Unfinished",
      status: "in_progress",
      clicks: 1,
    });

    const leaderboard = await fetchDailyLeaderboard(challengeDate);
    expect(leaderboard.map((row) => row.playerName)).toEqual(["Fast", "Slow"]);
    expect(leaderboard[0]).toMatchObject({ clicks: 2, durationMs: 500 });
  });

  it("respects the limit parameter", async () => {
    await insertDailyScore({ challengeDate, status: "finished", clicks: 1 });
    await insertDailyScore({ challengeDate, status: "finished", clicks: 2 });
    const leaderboard = await fetchDailyLeaderboard(challengeDate, 1);
    expect(leaderboard).toHaveLength(1);
  });

  it("throws when challengeDate isn't a valid date", async () => {
    await expect(fetchDailyLeaderboard("not-a-date")).rejects.toThrow();
  });
});
