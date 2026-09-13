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

import { POST } from "./route";

function makeRequest(code: string, body: unknown) {
  return new Request(`http://localhost/api/party/${code}/join`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/party/[code]/join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRateLimited.mockReturnValue(false);
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  it("returns 429 when rate limited", async () => {
    isRateLimited.mockReturnValue(true);
    const res = await POST(makeRequest("abcde", { playerId: crypto.randomUUID(), name: "Alice" }), {
      params: Promise.resolve({ code: "abcde" }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 400 when playerId is missing", async () => {
    const res = await POST(makeRequest("abcde", { name: "Alice" }), {
      params: Promise.resolve({ code: "abcde" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is missing or too long", async () => {
    const params = Promise.resolve({ code: "abcde" });
    const tooLong = await POST(
      makeRequest("abcde", { playerId: crypto.randomUUID(), name: "x".repeat(33) }),
      { params },
    );
    expect(tooLong.status).toBe(400);

    const missing = await POST(makeRequest("abcde", { playerId: crypto.randomUUID() }), { params });
    expect(missing.status).toBe(400);
  });

  it("returns 404 when the session doesn't exist", async () => {
    const code = "NOPE1";
    const res = await POST(makeRequest(code, { playerId: crypto.randomUUID(), name: "Alice" }), {
      params: Promise.resolve({ code }),
    });
    expect(res.status).toBe(404);
  });

  it("upserts the player and returns it on success", async () => {
    const session = await insertPartySession();
    const playerId = crypto.randomUUID();

    const res = await POST(makeRequest(session.code, { playerId, name: "Alice" }), {
      params: Promise.resolve({ code: session.code }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.player).toMatchObject({ id: playerId, session_id: session.id, name: "Alice" });
  });

  it("looks up the session case-insensitively", async () => {
    const session = await insertPartySession(); // shortCode() already stores an uppercase code
    const playerId = crypto.randomUUID();

    const res = await POST(makeRequest(session.code.toLowerCase(), { playerId, name: "Alice" }), {
      params: Promise.resolve({ code: session.code.toLowerCase() }),
    });

    expect(res.status).toBe(200);
  });

  it("returns 400 when the player upsert fails for real", async () => {
    // playerId becomes party_players.id, a uuid column — an invalid UUID is
    // a genuine Postgres error rather than a mocked one.
    const session = await insertPartySession();

    const res = await POST(makeRequest(session.code, { playerId: "not-a-uuid", name: "Alice" }), {
      params: Promise.resolve({ code: session.code }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/uuid/i);
  });

  it("actually persists the player row", async () => {
    const session = await insertPartySession();
    const playerId = crypto.randomUUID();

    await POST(makeRequest(session.code, { playerId, name: "Alice" }), {
      params: Promise.resolve({ code: session.code }),
    });

    const db = getTestServiceClient();
    const { data } = await db.from("party_players").select("*").eq("id", playerId).single();
    expect(data).toMatchObject({ session_id: session.id, name: "Alice", is_ready: false });
  });

  it("lets an existing member of this session rejoin (name update)", async () => {
    const session = await insertPartySession();
    const player = await insertPartyPlayer(session.id, { name: "Alice" });

    const res = await POST(makeRequest(session.code, { playerId: player.id, name: "Alicia" }), {
      params: Promise.resolve({ code: session.code }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.player).toMatchObject({ id: player.id, session_id: session.id, name: "Alicia" });
  });

  it("returns 409 and leaves the row untouched when the playerId already belongs to a different session", async () => {
    const otherSession = await insertPartySession();
    const victim = await insertPartyPlayer(otherSession.id, { name: "Victim" });
    const attackersSession = await insertPartySession();

    const res = await POST(
      makeRequest(attackersSession.code, { playerId: victim.id, name: "Hijacked" }),
      { params: Promise.resolve({ code: attackersSession.code }) },
    );

    expect(res.status).toBe(409);

    const db = getTestServiceClient();
    const { data } = await db.from("party_players").select("*").eq("id", victim.id).single();
    expect(data).toMatchObject({ session_id: otherSession.id, name: "Victim" });
  });
});
