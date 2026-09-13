import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupFixtures,
  getTestServiceClient,
  insertDailyChallenge,
  insertDailyScore,
} from "@/test/db";

const { isRateLimited } = vi.hoisted(() => ({ isRateLimited: vi.fn(() => false) }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, isRateLimited };
});

const { fetchArticle } = vi.hoisted(() => ({ fetchArticle: vi.fn() }));
vi.mock("@/lib/wikipedia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wikipedia")>();
  return { ...actual, fetchArticle };
});

import { WikipediaError } from "@/lib/wikipedia";
import { POST } from "./route";

const TODAY = new Date().toISOString().slice(0, 10);

function call(id: string, body: unknown) {
  return POST(
    new Request(`http://localhost/api/daily/attempt/${id}/navigate`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

/** Seeds today's challenge (FK target) plus one in-progress attempt. */
async function setUpInProgressAttempt() {
  await insertDailyChallenge({ start_title: "Bacteria" });
  const playerId = crypto.randomUUID();
  const attempt = await insertDailyScore({
    challengeDate: TODAY,
    playerId,
    status: "in_progress",
    clicks: 1,
    path: ["Bacteria"],
  });
  return { attempt, playerId };
}

describe("POST /api/daily/attempt/[id]/navigate", () => {
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
    const res = await call(crypto.randomUUID(), { playerId: crypto.randomUUID(), title: "X" });
    expect(res.status).toBe(429);
  });

  it("returns 400 when playerId or title is missing", async () => {
    const res = await call(crypto.randomUUID(), { playerId: crypto.randomUUID() });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the attempt doesn't exist", async () => {
    const res = await call(crypto.randomUUID(), { playerId: crypto.randomUUID(), title: "X" });
    expect(res.status).toBe(404);
  });

  it("returns 500 when the id isn't a valid uuid", async () => {
    const res = await call("not-a-uuid", { playerId: crypto.randomUUID(), title: "X" });
    expect(res.status).toBe(500);
  });

  it("returns 403 when the attempt belongs to someone else", async () => {
    const { attempt } = await setUpInProgressAttempt();
    const res = await call(attempt.id, { playerId: crypto.randomUUID(), title: "X" });
    expect(res.status).toBe(403);
  });

  it("returns 409 when the attempt has already finished", async () => {
    const { attempt, playerId } = await setUpInProgressAttempt();
    await getTestServiceClient()
      .from("daily_scores")
      .update({ status: "finished" })
      .eq("id", attempt.id);

    const res = await call(attempt.id, { playerId, title: "X" });
    expect(res.status).toBe(409);
    expect(fetchArticle).not.toHaveBeenCalled();
  });

  it("returns 409 once the attempt has reached the max click cap", async () => {
    const { attempt, playerId } = await setUpInProgressAttempt();
    await getTestServiceClient().from("daily_scores").update({ clicks: 300 }).eq("id", attempt.id);

    const res = await call(attempt.id, { playerId, title: "X" });
    expect(res.status).toBe(409);
    expect(fetchArticle).not.toHaveBeenCalled();
  });

  it("increments clicks and appends to the path on a non-winning click", async () => {
    fetchArticle.mockResolvedValue({ title: "Next Article", html: "<p/>", isTarget: false });
    const { attempt, playerId } = await setUpInProgressAttempt();

    const res = await call(attempt.id, { playerId, title: "Next Article" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      title: "Next Article",
      html: "<p/>",
      isTarget: false,
      clicks: 2,
      elapsedMs: undefined,
    });

    const db = getTestServiceClient();
    const { data } = await db
      .from("daily_scores")
      .select("clicks, path, status")
      .eq("id", attempt.id)
      .single();
    expect(data).toMatchObject({
      clicks: 2,
      path: ["Bacteria", "Next Article"],
      status: "in_progress",
    });
  });

  it("marks the attempt finished and returns elapsedMs when the target is reached", async () => {
    fetchArticle.mockResolvedValue({ title: "Tuberculosis", html: "<p/>", isTarget: true });
    const { attempt, playerId } = await setUpInProgressAttempt();

    const res = await call(attempt.id, { playerId, title: "Tuberculosis" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ title: "Tuberculosis", isTarget: true, clicks: 2 });
    expect(typeof body.elapsedMs).toBe("number");
    expect(body.elapsedMs).toBeGreaterThan(0);

    const db = getTestServiceClient();
    const { data } = await db.from("daily_scores").select("status").eq("id", attempt.id).single();
    expect(data?.status).toBe("finished");
  });

  it("only lets one of two concurrent winning clicks actually finish the attempt", async () => {
    fetchArticle.mockResolvedValue({ title: "Tuberculosis", html: "<p/>", isTarget: true });
    const { attempt, playerId } = await setUpInProgressAttempt();

    const [a, b] = await Promise.all([
      call(attempt.id, { playerId, title: "Tuberculosis" }),
      call(attempt.id, { playerId, title: "Tuberculosis" }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it("returns 502 when the article fetch fails", async () => {
    fetchArticle.mockRejectedValue(new WikipediaError("Could not load it"));
    const { attempt, playerId } = await setUpInProgressAttempt();

    const res = await call(attempt.id, { playerId, title: "X" });
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "Could not load it" });
  });

  it("returns a default 502 message when something other than a WikipediaError is thrown", async () => {
    fetchArticle.mockRejectedValue("not an Error instance");
    const { attempt, playerId } = await setUpInProgressAttempt();

    const res = await call(attempt.id, { playerId, title: "X" });
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: "Something went wrong talking to Wikipedia.",
    });
  });
});
