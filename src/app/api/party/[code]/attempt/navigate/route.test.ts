import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupFixtures,
  getTestServiceClient,
  insertPartyPlayer,
  insertPartyRoundResult,
  insertPartySession,
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

function call(code: string, body: unknown) {
  return POST(
    new Request(`http://localhost/api/party/${code}/attempt/navigate`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ code }) },
  );
}

/** Sets up a session + player with a real in-progress round_results row. */
async function setUpInProgressAttempt(roundNumber = 1) {
  const session = await insertPartySession({ status: "playing", round_number: roundNumber });
  const player = await insertPartyPlayer(session.id);
  await insertPartyRoundResult({
    sessionId: session.id,
    roundNumber,
    playerId: player.id,
    status: "in_progress",
    clicks: 2,
    path: ["Bacteria"],
  });
  return { session, player, roundNumber };
}

describe("POST /api/party/[code]/attempt/navigate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRateLimited.mockReturnValue(false);
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  it("returns 429 when rate limited", async () => {
    isRateLimited.mockReturnValue(true);
    const res = await call("abcde", { playerId: crypto.randomUUID(), roundNumber: 1, title: "X" });
    expect(res.status).toBe(429);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await call("abcde", { playerId: crypto.randomUUID(), title: "X" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the session doesn't exist", async () => {
    const res = await call("NOPE1", { playerId: crypto.randomUUID(), roundNumber: 1, title: "X" });
    expect(res.status).toBe(404);
  });

  it("returns 500 when playerId isn't a valid uuid", async () => {
    const session = await insertPartySession({ status: "playing" });
    const res = await call(session.code, { playerId: "not-a-uuid", roundNumber: 1, title: "X" });
    expect(res.status).toBe(500);
  });

  it("returns 404 when the attempt doesn't exist", async () => {
    const session = await insertPartySession({ status: "playing" });
    const res = await call(session.code, {
      playerId: crypto.randomUUID(),
      roundNumber: 1,
      title: "X",
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when the attempt has already finished", async () => {
    const { session, player, roundNumber } = await setUpInProgressAttempt();
    await getTestServiceClient()
      .from("party_round_results")
      .update({ status: "finished" })
      .eq("session_id", session.id)
      .eq("round_number", roundNumber)
      .eq("player_id", player.id);

    const res = await call(session.code, { playerId: player.id, roundNumber, title: "X" });
    expect(res.status).toBe(409);
    expect(fetchArticle).not.toHaveBeenCalled();
  });

  it("increments clicks and appends to the path on a non-winning click", async () => {
    fetchArticle.mockResolvedValue({ title: "Next Article", html: "<p/>", isTarget: false });
    const { session, player, roundNumber } = await setUpInProgressAttempt();

    const res = await call(session.code, {
      playerId: player.id,
      roundNumber,
      title: "Next Article",
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      title: "Next Article",
      html: "<p/>",
      isTarget: false,
      clicks: 3,
      elapsedMs: undefined,
    });

    const db = getTestServiceClient();
    const { data } = await db
      .from("party_round_results")
      .select("clicks, path, status")
      .eq("session_id", session.id)
      .eq("round_number", roundNumber)
      .eq("player_id", player.id)
      .single();
    expect(data).toMatchObject({
      clicks: 3,
      path: ["Bacteria", "Next Article"],
      status: "in_progress",
    });
  });

  it("marks the attempt finished and returns elapsedMs when the target is reached", async () => {
    fetchArticle.mockResolvedValue({ title: "Tuberculosis", html: "<p/>", isTarget: true });
    const { session, player, roundNumber } = await setUpInProgressAttempt();

    const res = await call(session.code, {
      playerId: player.id,
      roundNumber,
      title: "Tuberculosis",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ title: "Tuberculosis", isTarget: true, clicks: 3 });
    expect(typeof body.elapsedMs).toBe("number");
    expect(body.elapsedMs).toBeGreaterThan(0);

    const db = getTestServiceClient();
    const { data } = await db
      .from("party_round_results")
      .select("status")
      .eq("session_id", session.id)
      .eq("round_number", roundNumber)
      .eq("player_id", player.id)
      .single();
    expect(data?.status).toBe("finished");
  });

  it("only lets one of two concurrent winning clicks actually finish the attempt", async () => {
    fetchArticle.mockResolvedValue({ title: "Tuberculosis", html: "<p/>", isTarget: true });
    const { session, player, roundNumber } = await setUpInProgressAttempt();

    const [a, b] = await Promise.all([
      call(session.code, { playerId: player.id, roundNumber, title: "Tuberculosis" }),
      call(session.code, { playerId: player.id, roundNumber, title: "Tuberculosis" }),
    ]);

    // Whichever request's own SELECT lost the race either finds the row
    // already "finished" (409) or has its guarded UPDATE match no row
    // (409) — either way exactly one of the two actually wins.
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it("returns 502 when the article fetch fails", async () => {
    fetchArticle.mockRejectedValue(new WikipediaError("Could not load it"));
    const { session, player, roundNumber } = await setUpInProgressAttempt();

    const res = await call(session.code, { playerId: player.id, roundNumber, title: "X" });
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "Could not load it" });
  });

  it("returns a default 502 message when something other than a WikipediaError is thrown", async () => {
    fetchArticle.mockRejectedValue("not an Error instance");
    const { session, player, roundNumber } = await setUpInProgressAttempt();

    const res = await call(session.code, { playerId: player.id, roundNumber, title: "X" });
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: "Something went wrong talking to Wikipedia.",
    });
  });
});
