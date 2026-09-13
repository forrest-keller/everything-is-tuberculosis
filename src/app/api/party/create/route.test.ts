import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupFixtures,
  getTestServiceClient,
  insertPartyPlayer,
  insertPartySession,
  trackRowForCleanup,
} from "@/test/db";

const { isRateLimited } = vi.hoisted(() => ({ isRateLimited: vi.fn(() => false) }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, isRateLimited };
});

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/party/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// generateCode() picks each of its 5 characters via
// `CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]`, and
// CODE_ALPHABET's first character is "A" — so forcing Math.random() to 0
// deterministically produces the code "AAAAA", letting us set up a real
// unique-constraint collision instead of mocking one.
const FORCED_CODE = "AAAAA";

describe("POST /api/party/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRateLimited.mockReturnValue(false);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupFixtures();
  });

  it("returns 429 when rate limited", async () => {
    isRateLimited.mockReturnValue(true);
    const res = await POST(makeRequest({ hostName: "Alice", hostPlayerId: crypto.randomUUID() }));
    expect(res.status).toBe(429);
  });

  it("returns 400 when hostName is missing", async () => {
    const res = await POST(makeRequest({ hostPlayerId: crypto.randomUUID() }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when hostName is too long", async () => {
    const res = await POST(
      makeRequest({ hostName: "x".repeat(33), hostPlayerId: crypto.randomUUID() }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when hostPlayerId is missing", async () => {
    const res = await POST(makeRequest({ hostName: "Alice" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the body isn't valid JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/party/create", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
  });

  it("creates a session and host player on success", async () => {
    const hostPlayerId = crypto.randomUUID();

    const res = await POST(makeRequest({ hostName: "Alice", hostPlayerId }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.session.host_player_id).toBe(hostPlayerId);
    expect(body.session.code).toMatch(/^[A-Z0-9]{5}$/);
    trackRowForCleanup("party_sessions", "id", body.session.id);

    const db = getTestServiceClient();
    const { data: player } = await db
      .from("party_players")
      .select("*")
      .eq("id", hostPlayerId)
      .single();
    expect(player).toMatchObject({ session_id: body.session.id, name: "Alice" });
  });

  it("retries with a new code on a real collision, then succeeds", async () => {
    const existing = await insertPartySession({ code: FORCED_CODE });
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0) // 1st generateCode() call: collides with `existing`
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(0.5); // every subsequent character: a different code

    const res = await POST(makeRequest({ hostName: "Alice", hostPlayerId: crypto.randomUUID() }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session.code).not.toBe(existing.code);
    trackRowForCleanup("party_sessions", "id", body.session.id);
  });

  it("gives up after repeatedly colliding", async () => {
    await insertPartySession({ code: FORCED_CODE });
    vi.spyOn(Math, "random").mockReturnValue(0); // every attempt generates "AAAAA"

    const res = await POST(makeRequest({ hostName: "Alice", hostPlayerId: crypto.randomUUID() }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Could not generate a unique room code, please try again.",
    });
  });

  it("returns 500 on a genuine (non-collision) session insert error", async () => {
    // host_player_id is a uuid column; a non-UUID string is a real Postgres
    // error distinct from the 23505 collision path above.
    const res = await POST(makeRequest({ hostName: "Alice", hostPlayerId: "not-a-uuid" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/uuid/i);
  });

  it("returns 500 when the host player insert fails", async () => {
    // party_players.id is a uuid primary key: reusing an id that already
    // belongs to another player is a genuine unique-violation on the
    // player insert specifically, once the (new) session insert has already
    // succeeded. That orphaned session row is harmless local-dev cruft —
    // cleared by the next `supabase db reset` — since the 500 response
    // never surfaces its id for us to delete directly.
    const otherSession = await insertPartySession();
    const existingPlayer = await insertPartyPlayer(otherSession.id);

    const res = await POST(makeRequest({ hostName: "Alice", hostPlayerId: existingPlayer.id }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/duplicate key|already exists/i);
  });
});
