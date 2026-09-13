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
    new Request(`http://localhost/api/party/${code}/attempt`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ code }) },
  );
}

describe("POST /api/party/[code]/attempt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRateLimited.mockReturnValue(false);
    fetchArticle.mockResolvedValue({ title: "Bacteria", html: "<p/>", isTarget: false });
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  it("returns 429 when rate limited", async () => {
    isRateLimited.mockReturnValue(true);
    const res = await call("abcde", { playerId: crypto.randomUUID() });
    expect(res.status).toBe(429);
  });

  it("returns 400 when playerId is missing", async () => {
    const res = await call("abcde", {});
    expect(res.status).toBe(400);
  });

  it("returns 404 when the session doesn't exist", async () => {
    const res = await call("NOPE1", { playerId: crypto.randomUUID() });
    expect(res.status).toBe(404);
  });

  it("returns 409 when the round isn't active", async () => {
    const session = await insertPartySession({ status: "lobby", current_start_title: "Bacteria" });
    const res = await call(session.code, { playerId: crypto.randomUUID() });
    expect(res.status).toBe(409);
  });

  it("returns 409 when there's no current start title", async () => {
    const session = await insertPartySession({ status: "playing", current_start_title: null });
    const res = await call(session.code, { playerId: crypto.randomUUID() });
    expect(res.status).toBe(409);
  });

  it("returns 500 when playerId isn't a valid uuid", async () => {
    const session = await insertPartySession({
      status: "playing",
      current_start_title: "Bacteria",
    });
    const res = await call(session.code, { playerId: "not-a-uuid" });
    expect(res.status).toBe(500);
  });

  it("returns 409 when the player already finished this round", async () => {
    const session = await insertPartySession({
      status: "playing",
      round_number: 2,
      current_start_title: "Bacteria",
    });
    const player = await insertPartyPlayer(session.id);
    await insertPartyRoundResult({
      sessionId: session.id,
      roundNumber: 2,
      playerId: player.id,
      status: "finished",
    });

    const res = await call(session.code, { playerId: player.id });
    expect(res.status).toBe(409);
    expect(fetchArticle).not.toHaveBeenCalled();
  });

  it("starts a fresh attempt and returns the round's article", async () => {
    const session = await insertPartySession({
      status: "playing",
      round_number: 2,
      current_start_title: "Bacteria",
    });
    const player = await insertPartyPlayer(session.id);

    const res = await call(session.code, { playerId: player.id });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      roundNumber: 2,
      title: "Bacteria",
      html: "<p/>",
      isTarget: false,
    });

    const db = getTestServiceClient();
    const { data } = await db
      .from("party_round_results")
      .select("*")
      .eq("session_id", session.id)
      .eq("round_number", 2)
      .eq("player_id", player.id)
      .single();
    expect(data).toMatchObject({ status: "in_progress", clicks: 0, path: ["Bacteria"] });
  });

  it("allows restarting an in-progress (not finished) attempt", async () => {
    const session = await insertPartySession({
      status: "playing",
      round_number: 2,
      current_start_title: "Bacteria",
    });
    const player = await insertPartyPlayer(session.id);
    await insertPartyRoundResult({
      sessionId: session.id,
      roundNumber: 2,
      playerId: player.id,
      status: "in_progress",
      clicks: 3,
    });

    const res = await call(session.code, { playerId: player.id });

    expect(res.status).toBe(200);
    const db = getTestServiceClient();
    const { data } = await db
      .from("party_round_results")
      .select("clicks")
      .eq("session_id", session.id)
      .eq("round_number", 2)
      .eq("player_id", player.id)
      .single();
    expect(data?.clicks).toBe(0); // the upsert resets it back to a fresh attempt
  });

  it("returns 400 when the upsert fails for real (player_id has no matching row)", async () => {
    // party_round_results.player_id has a real foreign key to party_players;
    // an id that was never inserted as a player is a genuine FK violation.
    const session = await insertPartySession({
      status: "playing",
      round_number: 2,
      current_start_title: "Bacteria",
    });

    const res = await call(session.code, { playerId: crypto.randomUUID() });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Something went wrong. Please try again.",
    });
  });

  it("returns 502 with the WikipediaError message when the article fetch fails", async () => {
    fetchArticle.mockRejectedValue(new WikipediaError("Could not load it"));
    const session = await insertPartySession({
      status: "playing",
      round_number: 2,
      current_start_title: "Bacteria",
    });
    const player = await insertPartyPlayer(session.id);

    const res = await call(session.code, { playerId: player.id });

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "Could not load it" });
  });

  it("returns a default 502 message when something other than a WikipediaError is thrown", async () => {
    fetchArticle.mockRejectedValue("not an Error instance");
    const session = await insertPartySession({
      status: "playing",
      round_number: 2,
      current_start_title: "Bacteria",
    });
    const player = await insertPartyPlayer(session.id);

    const res = await call(session.code, { playerId: player.id });

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: "Something went wrong talking to Wikipedia.",
    });
  });
});
