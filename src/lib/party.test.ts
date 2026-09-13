import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanupFixtures,
  insertPartyPlayer,
  insertPartyRoundResult,
  insertPartySession,
} from "@/test/db";
import {
  advancePartyRound,
  applyRealtimeChange,
  completeRoundIfDone,
  createPartyAttempt,
  createPartySession,
  fetchPartyPlayers,
  fetchPartyRoundResults,
  fetchPartySessionByCode,
  joinPartySession,
  navigatePartyAttempt,
  setPlayerReady,
  type RealtimeRowChange,
} from "./party";

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

interface Item {
  id: string;
  value: string;
}

describe("applyRealtimeChange", () => {
  it("appends a new row on INSERT", () => {
    const list: Item[] = [{ id: "1", value: "a" }];
    const change: RealtimeRowChange<Item> = {
      eventType: "INSERT",
      id: "2",
      row: { id: "2", value: "b" },
    };
    expect(applyRealtimeChange(list, change)).toEqual([
      { id: "1", value: "a" },
      { id: "2", value: "b" },
    ]);
  });

  it("replaces the matching row on UPDATE", () => {
    const list: Item[] = [
      { id: "1", value: "a" },
      { id: "2", value: "b" },
    ];
    const change: RealtimeRowChange<Item> = {
      eventType: "UPDATE",
      id: "2",
      row: { id: "2", value: "updated" },
    };
    expect(applyRealtimeChange(list, change)).toEqual([
      { id: "1", value: "a" },
      { id: "2", value: "updated" },
    ]);
  });

  it("treats an UPDATE for an unknown id as an insert", () => {
    const list: Item[] = [{ id: "1", value: "a" }];
    const change: RealtimeRowChange<Item> = {
      eventType: "UPDATE",
      id: "2",
      row: { id: "2", value: "b" },
    };
    expect(applyRealtimeChange(list, change)).toEqual([
      { id: "1", value: "a" },
      { id: "2", value: "b" },
    ]);
  });

  it("removes the matching row on DELETE", () => {
    const list: Item[] = [
      { id: "1", value: "a" },
      { id: "2", value: "b" },
    ];
    const change: RealtimeRowChange<Item> = { eventType: "DELETE", id: "1", row: null };
    expect(applyRealtimeChange(list, change)).toEqual([{ id: "2", value: "b" }]);
  });

  it("is a no-op deleting an id that isn't present", () => {
    const list: Item[] = [{ id: "1", value: "a" }];
    const change: RealtimeRowChange<Item> = {
      eventType: "DELETE",
      id: "does-not-exist",
      row: null,
    };
    expect(applyRealtimeChange(list, change)).toEqual(list);
  });

  it("is a no-op when an INSERT/UPDATE has no row payload", () => {
    const list: Item[] = [{ id: "1", value: "a" }];
    const change: RealtimeRowChange<Item> = { eventType: "INSERT", id: "2", row: null };
    expect(applyRealtimeChange(list, change)).toBe(list);
  });
});

describe("createPartySession", () => {
  it("posts the host info and returns the mapped session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        session: {
          id: "s1",
          code: "ABCDEF",
          status: "lobby",
          round_number: 0,
          current_start_title: null,
          host_player_id: "p1",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const session = await createPartySession("Host", "p1");
    expect(session).toEqual({
      id: "s1",
      code: "ABCDEF",
      status: "lobby",
      roundNumber: 0,
      currentStartTitle: null,
      hostPlayerId: "p1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/party/create",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws the server's error message on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "taken" }, 400)));
    await expect(createPartySession("Host", "p1")).rejects.toThrow("taken");
  });

  it("throws a default message when the error body has no error field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    await expect(createPartySession("Host", "p1")).rejects.toThrow("Something went wrong.");
  });
});

describe("fetchPartySessionByCode", () => {
  it("returns the mapped session for an existing code, case-insensitively", async () => {
    const row = await insertPartySession({ code: "ZYXWVU" });
    const session = await fetchPartySessionByCode("zyxwvu");
    expect(session).toEqual({
      id: row.id,
      code: "ZYXWVU",
      status: "lobby",
      roundNumber: 0,
      currentStartTitle: null,
      hostPlayerId: row.host_player_id,
    });
  });

  it("returns null when no session matches", async () => {
    await expect(fetchPartySessionByCode("NOSUCH")).resolves.toBeNull();
  });
});

describe("joinPartySession", () => {
  it("posts the join request and returns the mapped player", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        player: { id: "pl1", session_id: "s1", name: "Alice", is_ready: false, joined_at: "now" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const player = await joinPartySession("ABCDEF", "p1", "Alice");
    expect(player).toEqual({
      id: "pl1",
      sessionId: "s1",
      name: "Alice",
      isReady: false,
      joinedAt: "now",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/party/ABCDEF/join",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws the server's error message on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "full" }, 400)));
    await expect(joinPartySession("ABCDEF", "p1", "Alice")).rejects.toThrow("full");
  });
});

describe("fetchPartyPlayers", () => {
  it("returns players ordered by join time", async () => {
    const session = await insertPartySession();
    await insertPartyPlayer(session.id, { name: "Second" });
    await insertPartyPlayer(session.id, { name: "First" });

    const players = await fetchPartyPlayers(session.id);
    expect(players).toHaveLength(2);
    expect(players.every((p) => p.sessionId === session.id)).toBe(true);
  });
});

describe("fetchPartyRoundResults", () => {
  it("returns only finished results for the round, ordered by clicks then duration", async () => {
    const session = await insertPartySession({ round_number: 1 });
    const p1 = await insertPartyPlayer(session.id);
    const p2 = await insertPartyPlayer(session.id);
    const p3 = await insertPartyPlayer(session.id);
    await insertPartyRoundResult({
      sessionId: session.id,
      roundNumber: 1,
      playerId: p1.id,
      status: "finished",
      clicks: 5,
      durationMs: 1000,
    });
    await insertPartyRoundResult({
      sessionId: session.id,
      roundNumber: 1,
      playerId: p2.id,
      status: "finished",
      clicks: 2,
      durationMs: 500,
    });
    await insertPartyRoundResult({
      sessionId: session.id,
      roundNumber: 1,
      playerId: p3.id,
      status: "in_progress",
    });

    const results = await fetchPartyRoundResults(session.id, 1);
    expect(results.map((r) => r.playerId)).toEqual([p2.id, p1.id]);
  });
});

describe("setPlayerReady", () => {
  it("posts the ready state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    await setPlayerReady("ABCDEF", "p1", true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/party/ABCDEF/ready",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws the server's error message on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, 400)));
    await expect(setPlayerReady("ABCDEF", "p1", true)).rejects.toThrow("nope");
  });
});

describe("createPartyAttempt", () => {
  it("posts the player id and returns the round + article", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ roundNumber: 2, title: "Bacteria", html: "<p>hi</p>", isTarget: false }),
        ),
    );
    const attempt = await createPartyAttempt("ABCDEF", "p1");
    expect(attempt).toEqual({
      roundNumber: 2,
      article: { title: "Bacteria", html: "<p>hi</p>", isTarget: false },
    });
  });
});

describe("navigatePartyAttempt", () => {
  it("posts the click and returns the raw navigation result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ title: "Tuberculosis", clicks: 4, isTarget: true })),
    );
    await expect(navigatePartyAttempt("ABCDEF", "p1", 1, "Tuberculosis")).resolves.toEqual({
      title: "Tuberculosis",
      clicks: 4,
      isTarget: true,
    });
  });
});

describe("completeRoundIfDone", () => {
  it("posts the round number", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    await completeRoundIfDone("ABCDEF", 1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/party/ABCDEF/complete-round",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("advancePartyRound", () => {
  it("posts the player id and returns the mapped session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          id: "s1",
          code: "ABCDEF",
          status: "playing",
          round_number: 2,
          current_start_title: "Bacteria",
          host_player_id: "p1",
        }),
      ),
    );
    const session = await advancePartyRound("ABCDEF", "p1");
    expect(session).toMatchObject({ status: "playing", roundNumber: 2 });
  });

  it("throws the server's error message on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "not host" }, 403)));
    await expect(advancePartyRound("ABCDEF", "p1")).rejects.toThrow("not host");
  });
});
