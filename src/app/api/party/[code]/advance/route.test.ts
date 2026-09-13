import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupFixtures,
  getTestServiceClient,
  insertPartyPlayer,
  insertPartySession,
} from "@/test/db";

const { isRateLimited } = vi.hoisted(() => ({ isRateLimited: vi.fn(() => false) }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, isRateLimited };
});

const { fetchRandomStartArticle } = vi.hoisted(() => ({ fetchRandomStartArticle: vi.fn() }));
vi.mock("@/lib/wikipedia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wikipedia")>();
  return { ...actual, fetchRandomStartArticle };
});

import { WikipediaError } from "@/lib/wikipedia";
import { POST } from "./route";

function makeRequest(code: string, body: unknown) {
  return new Request(`http://localhost/api/party/${code}/advance`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function call(code: string, body: unknown) {
  return POST(makeRequest(code, body), { params: Promise.resolve({ code }) });
}

describe("POST /api/party/[code]/advance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRateLimited.mockReturnValue(false);
    fetchRandomStartArticle.mockResolvedValue({
      title: "New Article",
      html: "<p/>",
      isTarget: false,
    });
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  it("returns 429 when rate limited", async () => {
    isRateLimited.mockReturnValue(true);
    const res = await call("abcde", { playerId: "host1" });
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

  it("rejects a non-host trying to start from the lobby", async () => {
    const hostId = crypto.randomUUID();
    const session = await insertPartySession({ status: "lobby", host_player_id: hostId });

    const res = await call(session.code, { playerId: crypto.randomUUID() });

    expect(res.status).toBe(403);
    expect(fetchRandomStartArticle).not.toHaveBeenCalled();
  });

  it("lets the host start the game from the lobby", async () => {
    const hostId = crypto.randomUUID();
    const session = await insertPartySession({
      status: "lobby",
      host_player_id: hostId,
      round_number: 0,
    });

    const res = await call(session.code, { playerId: hostId });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "playing",
      round_number: 1,
      current_start_title: "New Article",
    });

    const db = getTestServiceClient();
    const { data } = await db.from("party_sessions").select("*").eq("id", session.id).single();
    expect(data).toMatchObject({ status: "playing", round_number: 1 });
  });

  it("rejects advancing from round_results when nobody is ready", async () => {
    const session = await insertPartySession({ status: "round_results" });

    const res = await call(session.code, { playerId: crypto.randomUUID() });

    expect(res.status).toBe(409);
    expect(fetchRandomStartArticle).not.toHaveBeenCalled();
  });

  it("rejects advancing from round_results when someone isn't ready", async () => {
    const session = await insertPartySession({ status: "round_results" });
    await insertPartyPlayer(session.id, { is_ready: true });
    await insertPartyPlayer(session.id, { is_ready: false });

    const res = await call(session.code, { playerId: crypto.randomUUID() });
    expect(res.status).toBe(409);
  });

  it("advances from round_results once everyone is ready, and resets readiness", async () => {
    const session = await insertPartySession({ status: "round_results", round_number: 1 });
    const p1 = await insertPartyPlayer(session.id, { is_ready: true });
    const p2 = await insertPartyPlayer(session.id, { is_ready: true });

    const res = await call(session.code, { playerId: crypto.randomUUID() });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "playing", round_number: 2 });

    const db = getTestServiceClient();
    const { data: players } = await db
      .from("party_players")
      .select("id, is_ready")
      .in("id", [p1.id, p2.id]);
    expect(players?.every((p) => p.is_ready === false)).toBe(true);
  });

  it("rejects advancing from any other status", async () => {
    const session = await insertPartySession({ status: "playing" });

    const res = await call(session.code, { playerId: crypto.randomUUID() });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('"playing"');
  });

  it("returns 502 when picking a random article fails with a WikipediaError", async () => {
    fetchRandomStartArticle.mockRejectedValue(new WikipediaError("Wikipedia is down"));
    const hostId = crypto.randomUUID();
    const session = await insertPartySession({ status: "lobby", host_player_id: hostId });

    const res = await call(session.code, { playerId: hostId });

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "Wikipedia is down" });
  });

  it("returns 502 with a generic message on an unexpected article-fetch error", async () => {
    fetchRandomStartArticle.mockRejectedValue(new Error("boom"));
    const hostId = crypto.randomUUID();
    const session = await insertPartySession({ status: "lobby", host_player_id: hostId });

    const res = await call(session.code, { playerId: hostId });

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: "Something went wrong talking to Wikipedia.",
    });
  });

  it("only lets one of two concurrent advance calls win the real status-guarded update", async () => {
    const hostId = crypto.randomUUID();
    const session = await insertPartySession({
      status: "lobby",
      host_player_id: hostId,
      round_number: 0,
    });

    const [a, b] = await Promise.all([
      call(session.code, { playerId: hostId }),
      call(session.code, { playerId: hostId }),
    ]);

    const statuses = [a.status, b.status].sort();
    // Whichever request's own SELECT lost the race sees either a still-"lobby"
    // snapshot whose guarded UPDATE then matches no row (409 "already
    // advanced"), or an already-"playing" snapshot outright (409 "can't
    // start ... from status \"playing\""). Either way, exactly one call wins.
    expect(statuses).toEqual([200, 409]);

    const db = getTestServiceClient();
    const { data } = await db
      .from("party_sessions")
      .select("round_number")
      .eq("id", session.id)
      .single();
    expect(data?.round_number).toBe(1);
  });
});
