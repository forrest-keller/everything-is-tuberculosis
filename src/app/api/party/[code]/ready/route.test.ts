import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupFixtures, getTestServiceClient, insertPartyPlayer, insertPartySession } from "@/test/db";

const { isRateLimited } = vi.hoisted(() => ({ isRateLimited: vi.fn(() => false) }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, isRateLimited };
});

import { POST } from "./route";

function makeRequest(code: string, body: unknown) {
  return new Request(`http://localhost/api/party/${code}/ready`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/party/[code]/ready", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRateLimited.mockReturnValue(false);
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  it("returns 429 when rate limited", async () => {
    isRateLimited.mockReturnValue(true);
    const res = await POST(makeRequest("abcde", { playerId: crypto.randomUUID(), isReady: true }), {
      params: Promise.resolve({ code: "abcde" }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 400 when playerId is missing", async () => {
    const res = await POST(makeRequest("abcde", { isReady: true }), {
      params: Promise.resolve({ code: "abcde" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when isReady isn't a boolean", async () => {
    const res = await POST(makeRequest("abcde", { playerId: crypto.randomUUID() }), {
      params: Promise.resolve({ code: "abcde" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the session doesn't exist", async () => {
    const code = "NOPE1";
    const res = await POST(makeRequest(code, { playerId: crypto.randomUUID(), isReady: true }), {
      params: Promise.resolve({ code }),
    });
    expect(res.status).toBe(404);
  });

  it("flips is_ready and persists it", async () => {
    const session = await insertPartySession();
    const player = await insertPartyPlayer(session.id, { is_ready: false });

    const res = await POST(makeRequest(session.code, { playerId: player.id, isReady: true }), {
      params: Promise.resolve({ code: session.code }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    const db = getTestServiceClient();
    const { data } = await db.from("party_players").select("is_ready").eq("id", player.id).single();
    expect(data?.is_ready).toBe(true);
  });

  it("is a no-op when the player belongs to a different session", async () => {
    const sessionA = await insertPartySession();
    const sessionB = await insertPartySession();
    const player = await insertPartyPlayer(sessionA.id, { is_ready: false });

    // Scoping the update by session_id means this can't touch a player who
    // actually belongs to a different session, even though the route still
    // reports ok:true (0 rows matched is not treated as an error).
    const res = await POST(makeRequest(sessionB.code, { playerId: player.id, isReady: true }), {
      params: Promise.resolve({ code: sessionB.code }),
    });
    expect(res.status).toBe(200);

    const db = getTestServiceClient();
    const { data } = await db.from("party_players").select("is_ready").eq("id", player.id).single();
    expect(data?.is_ready).toBe(false);
  });
});
