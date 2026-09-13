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

import { POST } from "./route";

function call(code: string, body: unknown) {
  return POST(
    new Request(`http://localhost/api/party/${code}/complete-round`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ code }) }
  );
}

describe("POST /api/party/[code]/complete-round", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRateLimited.mockReturnValue(false);
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  it("returns 429 when rate limited", async () => {
    isRateLimited.mockReturnValue(true);
    const res = await call("abcde", { roundNumber: 1 });
    expect(res.status).toBe(429);
  });

  it("returns 400 when roundNumber is missing or not a number", async () => {
    const res = await call("abcde", {});
    expect(res.status).toBe(400);
  });

  it("returns 404 when the session doesn't exist", async () => {
    const res = await call("NOPE1", { roundNumber: 1 });
    expect(res.status).toBe(404);
  });

  it("does not flip the session when not everyone has finished", async () => {
    const session = await insertPartySession({ status: "playing", round_number: 1 });
    const p1 = await insertPartyPlayer(session.id);
    await insertPartyPlayer(session.id); // p2 never submits a result
    await insertPartyRoundResult({
      sessionId: session.id,
      roundNumber: 1,
      playerId: p1.id,
      status: "finished",
    });

    const res = await call(session.code, { roundNumber: 1 });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    const db = getTestServiceClient();
    const { data } = await db.from("party_sessions").select("status").eq("id", session.id).single();
    expect(data?.status).toBe("playing");
  });

  it("flips the session to round_results once every player has finished", async () => {
    const session = await insertPartySession({ status: "playing", round_number: 1 });
    const p1 = await insertPartyPlayer(session.id);
    const p2 = await insertPartyPlayer(session.id);
    await insertPartyRoundResult({ sessionId: session.id, roundNumber: 1, playerId: p1.id, status: "finished" });
    await insertPartyRoundResult({ sessionId: session.id, roundNumber: 1, playerId: p2.id, status: "finished" });

    const res = await call(session.code, { roundNumber: 1 });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    const db = getTestServiceClient();
    const { data } = await db.from("party_sessions").select("status").eq("id", session.id).single();
    expect(data?.status).toBe("round_results");
  });

  it("ignores in-progress results when counting who has finished", async () => {
    const session = await insertPartySession({ status: "playing", round_number: 1 });
    const p1 = await insertPartyPlayer(session.id);
    const p2 = await insertPartyPlayer(session.id);
    await insertPartyRoundResult({ sessionId: session.id, roundNumber: 1, playerId: p1.id, status: "finished" });
    await insertPartyRoundResult({ sessionId: session.id, roundNumber: 1, playerId: p2.id, status: "in_progress" });

    await call(session.code, { roundNumber: 1 });

    const db = getTestServiceClient();
    const { data } = await db.from("party_sessions").select("status").eq("id", session.id).single();
    expect(data?.status).toBe("playing");
  });

  it("does nothing when there are no players yet", async () => {
    const session = await insertPartySession({ status: "playing", round_number: 1 });

    const res = await call(session.code, { roundNumber: 1 });
    expect(res.status).toBe(200);

    const db = getTestServiceClient();
    const { data } = await db.from("party_sessions").select("status").eq("id", session.id).single();
    expect(data?.status).toBe("playing");
  });
});
