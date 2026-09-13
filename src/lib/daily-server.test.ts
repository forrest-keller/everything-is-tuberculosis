import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupFixtures, getTestServiceClient, insertDailyChallenge } from "@/test/db";

// fetchRandomStartArticle hits real Wikipedia/Wikimedia Enterprise over the
// network — that's mocked here regardless of the Supabase question. Every
// database interaction in this file runs against the real local Supabase
// instance started by vitest.global-setup.ts.
const { fetchRandomStartArticle } = vi.hoisted(() => ({ fetchRandomStartArticle: vi.fn() }));
vi.mock("@/lib/wikipedia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wikipedia")>();
  return { ...actual, fetchRandomStartArticle };
});

import { getOrCreateTodayChallenge } from "./daily-server";

const TODAY = new Date().toISOString().slice(0, 10);

describe("getOrCreateTodayChallenge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupFixtures();
    // Belt-and-suspenders: every test in this file contends for the same
    // "today" row, so make sure it's gone even if a test created it outside
    // the insertDailyChallenge helper (which is the only thing that
    // auto-registers cleanup). Deleting a row that isn't there is a no-op.
    await getTestServiceClient().from("daily_challenges").delete().eq("challenge_date", TODAY);
  });

  it("returns today's row without hitting Wikipedia if it already exists", async () => {
    await insertDailyChallenge({ start_title: "Existing Article" });

    const result = await getOrCreateTodayChallenge();

    expect(result.challenge_date).toBe(TODAY);
    expect(result.start_title).toBe("Existing Article");
    expect(fetchRandomStartArticle).not.toHaveBeenCalled();
  });

  it("creates and returns a new row when none exists yet", async () => {
    fetchRandomStartArticle.mockResolvedValue({
      title: "New Article",
      html: "<p/>",
      isTarget: false,
    });

    const result = await getOrCreateTodayChallenge();

    expect(result.challenge_date).toBe(TODAY);
    expect(result.start_title).toBe("New Article");
    expect(fetchRandomStartArticle).toHaveBeenCalledOnce();
  });

  it("resolves concurrent callers on the same day to the same row via the real unique constraint", async () => {
    fetchRandomStartArticle
      .mockResolvedValueOnce({ title: "Article A", html: "<p/>", isTarget: false })
      .mockResolvedValueOnce({ title: "Article B", html: "<p/>", isTarget: false });

    // Two genuinely concurrent callers race the real `daily_challenges`
    // primary key on challenge_date — one insert wins, the other must fall
    // back to reading the winner's row rather than erroring.
    const [a, b] = await Promise.all([getOrCreateTodayChallenge(), getOrCreateTodayChallenge()]);

    expect(a).toEqual(b);
    expect(["Article A", "Article B"]).toContain(a.start_title);
  });

  it("throws when the insert fails for a reason other than a same-day race", async () => {
    // A null title violates daily_challenges' real NOT NULL constraint on
    // start_title — a genuine insert failure that isn't a unique-violation
    // race, so the fallback read (which finds nothing) should surface it.
    fetchRandomStartArticle.mockResolvedValue({ title: null, html: "<p/>", isTarget: false });

    await expect(getOrCreateTodayChallenge()).rejects.toThrow(
      "Failed to create today's challenge.",
    );
  });
});
