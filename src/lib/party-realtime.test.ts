import { afterEach, describe, expect, it, vi } from "vitest";

// subscribeToPartySession's actual logic lives entirely in the callbacks it
// registers via channel.on(...) — exercising it for real would mean driving
// Postgres replication events through a live realtime socket. A fake channel
// that just records the registered callbacks lets us invoke them directly
// with synthetic payloads instead, matching how supabase-js's builder API
// shapes calls (channel(...).on(...).on(...).on(...).subscribe(cb)).
type Handler = (payload: unknown) => void;

function createFakeChannel() {
  const handlers: Handler[] = [];
  let subscribeCallback: ((status: string) => void) | undefined;
  const channel = {
    on: vi.fn((_event: string, _filter: unknown, handler: Handler) => {
      handlers.push(handler);
      return channel;
    }),
    subscribe: vi.fn((cb?: (status: string) => void) => {
      subscribeCallback = cb;
      return channel;
    }),
    unsubscribe: vi.fn(),
  };
  return {
    channel,
    handlers,
    fireSubscribed: () => subscribeCallback?.("SUBSCRIBED"),
    fireStatus: (status: string) => subscribeCallback?.(status),
  };
}

const fake = createFakeChannel();

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: () => ({
    channel: vi.fn(() => fake.channel),
  }),
}));

afterEach(() => {
  vi.clearAllMocks();
  fake.handlers.length = 0;
});

describe("subscribeToPartySession", () => {
  it("maps a session-change payload and forwards it", async () => {
    const { subscribeToPartySession } = await import("./party");
    const onSessionChange = vi.fn();
    subscribeToPartySession("s1", { onSessionChange });

    const [sessionHandler] = fake.handlers;
    sessionHandler({
      new: {
        id: "s1",
        code: "ABCDEF",
        status: "playing",
        round_number: 1,
        current_start_title: "Bacteria",
        host_player_id: "p1",
      },
    });

    expect(onSessionChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "s1", status: "playing", roundNumber: 1 }),
    );
  });

  it("ignores a session payload with no new row", async () => {
    const { subscribeToPartySession } = await import("./party");
    const onSessionChange = vi.fn();
    subscribeToPartySession("s1", { onSessionChange });
    fake.handlers[0]({ new: null });
    expect(onSessionChange).not.toHaveBeenCalled();
  });

  it("maps a player INSERT/UPDATE and a DELETE (which carries only the old id)", async () => {
    const { subscribeToPartySession } = await import("./party");
    const onPlayerChange = vi.fn();
    subscribeToPartySession("s1", { onPlayerChange });
    const [, playerHandler] = fake.handlers;

    playerHandler({
      eventType: "INSERT",
      new: { id: "p1", session_id: "s1", name: "Alice", is_ready: false, joined_at: "t1" },
      old: {},
    });
    expect(onPlayerChange).toHaveBeenCalledWith({
      eventType: "INSERT",
      id: "p1",
      row: { id: "p1", sessionId: "s1", name: "Alice", isReady: false, joinedAt: "t1" },
    });

    playerHandler({ eventType: "DELETE", new: {}, old: { id: "p1" } });
    expect(onPlayerChange).toHaveBeenCalledWith({ eventType: "DELETE", id: "p1", row: null });
  });

  it("ignores a player change with no resolvable id", async () => {
    const { subscribeToPartySession } = await import("./party");
    const onPlayerChange = vi.fn();
    subscribeToPartySession("s1", { onPlayerChange });
    fake.handlers[1]({ eventType: "DELETE", new: {}, old: {} });
    expect(onPlayerChange).not.toHaveBeenCalled();
  });

  it("maps a result change", async () => {
    const { subscribeToPartySession } = await import("./party");
    const onResultChange = vi.fn();
    subscribeToPartySession("s1", { onResultChange });
    const [, , resultHandler] = fake.handlers;

    resultHandler({
      eventType: "UPDATE",
      new: {
        id: "r1",
        session_id: "s1",
        round_number: 1,
        player_id: "p1",
        status: "finished",
        clicks: 3,
        duration_ms: 4000,
        path: ["A", "B"],
        finished_at: "t2",
      },
      old: { id: "r1" },
    });

    expect(onResultChange).toHaveBeenCalledWith({
      eventType: "UPDATE",
      id: "r1",
      row: expect.objectContaining({ id: "r1", clicks: 3, path: ["A", "B"] }),
    });
  });

  it("defaults a result's path to an empty array when the payload has none", async () => {
    const { subscribeToPartySession } = await import("./party");
    const onResultChange = vi.fn();
    subscribeToPartySession("s1", { onResultChange });
    const [, , resultHandler] = fake.handlers;

    resultHandler({
      eventType: "INSERT",
      new: {
        id: "r2",
        session_id: "s1",
        round_number: 1,
        player_id: "p1",
        status: "finished",
        clicks: 0,
        duration_ms: 0,
        finished_at: "t1",
      },
      old: {},
    });

    expect(onResultChange).toHaveBeenCalledWith({
      eventType: "INSERT",
      id: "r2",
      row: expect.objectContaining({ path: [] }),
    });
  });

  it("maps a result DELETE using the old row's id, with a null row", async () => {
    const { subscribeToPartySession } = await import("./party");
    const onResultChange = vi.fn();
    subscribeToPartySession("s1", { onResultChange });
    const [, , resultHandler] = fake.handlers;

    resultHandler({ eventType: "DELETE", new: {}, old: { id: "r1" } });
    expect(onResultChange).toHaveBeenCalledWith({ eventType: "DELETE", id: "r1", row: null });
  });

  it("ignores a result change with no resolvable id", async () => {
    const { subscribeToPartySession } = await import("./party");
    const onResultChange = vi.fn();
    subscribeToPartySession("s1", { onResultChange });
    fake.handlers[2]({ eventType: "DELETE", new: {}, old: {} });
    expect(onResultChange).not.toHaveBeenCalled();
  });

  it("fires onResync only on the second SUBSCRIBED status, not the first", async () => {
    const { subscribeToPartySession } = await import("./party");
    const onResync = vi.fn();
    subscribeToPartySession("s1", { onResync });

    fake.fireSubscribed();
    expect(onResync).not.toHaveBeenCalled();

    fake.fireSubscribed();
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it("ignores a non-SUBSCRIBED status", async () => {
    const { subscribeToPartySession } = await import("./party");
    const onResync = vi.fn();
    subscribeToPartySession("s1", { onResync });

    fake.fireStatus("CHANNEL_ERROR");
    fake.fireSubscribed();
    // A real first SUBSCRIBED still shouldn't resync — the earlier
    // non-SUBSCRIBED status must not have counted as "subscribed before".
    expect(onResync).not.toHaveBeenCalled();
  });

  it("unsubscribing the returned channel calls through to the real unsubscribe", async () => {
    const { subscribeToPartySession } = await import("./party");
    const channel = subscribeToPartySession("s1", {});
    channel.unsubscribe();
    expect(fake.channel.unsubscribe).toHaveBeenCalled();
  });
});
