import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PartyRoom } from "./party-room";
import * as party from "@/lib/party";
import type { RealtimeRowChange } from "@/lib/party";

vi.mock("@/lib/party", async () => {
  const actual = await vi.importActual<typeof import("@/lib/party")>("@/lib/party");
  return {
    ...actual,
    fetchPartySessionByCode: vi.fn(),
    fetchPartyPlayers: vi.fn(),
    fetchPartyRoundResults: vi.fn(),
    joinPartySession: vi.fn(),
    setPlayerReady: vi.fn(),
    createPartyAttempt: vi.fn(),
    navigatePartyAttempt: vi.fn(),
    completeRoundIfDone: vi.fn(),
    advancePartyRound: vi.fn(),
    subscribeToPartySession: vi.fn(),
  };
});

vi.mock("@/lib/player-identity", () => ({
  getOrCreatePlayerId: vi.fn(() => "player-1"),
  getSavedPlayerName: vi.fn(() => ""),
  savePlayerName: vi.fn(),
}));

// GameHeader (rendered for real once a round is active) calls useRouter(),
// which throws outside a mounted Next.js app router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mocked = vi.mocked(party);

interface RealtimeHandlers {
  onSessionChange?: (session: party.PartySession) => void;
  onPlayerChange?: (change: RealtimeRowChange<party.PartyPlayer>) => void;
  onResultChange?: (change: RealtimeRowChange<party.PartyRoundResult>) => void;
  onResync?: () => void;
}

let capturedHandlers: RealtimeHandlers = {};
const unsubscribe = vi.fn();

function session(overrides: Partial<party.PartySession> = {}): party.PartySession {
  return {
    id: "s1",
    code: "ABCDEF",
    status: "lobby",
    roundNumber: 0,
    currentStartTitle: null,
    hostPlayerId: "player-1",
    ...overrides,
  };
}

function player(overrides: Partial<party.PartyPlayer> = {}): party.PartyPlayer {
  return {
    id: "player-1",
    sessionId: "s1",
    name: "Me",
    isReady: false,
    joinedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  capturedHandlers = {};
  mocked.fetchPartyPlayers.mockResolvedValue([]);
  mocked.fetchPartyRoundResults.mockResolvedValue([]);
  mocked.subscribeToPartySession.mockImplementation((_sessionId, handlers) => {
    capturedHandlers = handlers;
    return { unsubscribe } as unknown as ReturnType<typeof party.subscribeToPartySession>;
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PartyRoom", () => {
  it("shows a not-found message for an unknown code", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(null);
    render(<PartyRoom code="NOPE00" />);
    expect(await screen.findByText("No session found for code “NOPE00”.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Play with Friends" })).toBeInTheDocument();
  });

  it("shows a load error when the session lookup rejects", async () => {
    mocked.fetchPartySessionByCode.mockRejectedValue(new Error("network down"));
    render(<PartyRoom code="ABCDEF" />);
    expect(await screen.findByText("network down")).toBeInTheDocument();
  });

  it("shows a default load-error message when something other than an Error is thrown", async () => {
    mocked.fetchPartySessionByCode.mockRejectedValue("not an Error instance");
    render(<PartyRoom code="ABCDEF" />);
    expect(await screen.findByText("Failed to load session.")).toBeInTheDocument();
  });

  it("shows the join form for a visitor who hasn't joined yet", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(session());
    mocked.fetchPartyPlayers.mockResolvedValue([player({ id: "someone-else", name: "Alice" })]);
    render(<PartyRoom code="ABCDEF" />);

    expect(await screen.findByText("Join the session")).toBeInTheDocument();
    expect(screen.getByText("1 player has already joined.")).toBeInTheDocument();

    mocked.joinPartySession.mockResolvedValue(player({ name: "Bob" }));
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Bob" } });
    fireEvent.click(screen.getByRole("button", { name: "Join Session" }));

    await waitFor(() =>
      expect(mocked.joinPartySession).toHaveBeenCalledWith("ABCDEF", "player-1", "Bob"),
    );
  });

  it("shows the join error message when joining fails", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(session());
    mocked.joinPartySession.mockRejectedValue(new Error("session full"));
    render(<PartyRoom code="ABCDEF" />);

    fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: "Bob" } });
    fireEvent.click(screen.getByRole("button", { name: "Join Session" }));

    expect(await screen.findByText("session full")).toBeInTheDocument();
  });

  it("shows a default join-error message when something other than an Error is thrown", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(session());
    mocked.joinPartySession.mockRejectedValue("not an Error instance");
    render(<PartyRoom code="ABCDEF" />);

    fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: "Bob" } });
    fireEvent.click(screen.getByRole("button", { name: "Join Session" }));

    expect(await screen.findByText("Failed to join the session.")).toBeInTheDocument();
  });

  it("pluralizes the already-joined count", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(session());
    mocked.fetchPartyPlayers.mockResolvedValue([
      player({ id: "p2", name: "Alice" }),
      player({ id: "p3", name: "Bob" }),
    ]);
    render(<PartyRoom code="ABCDEF" />);
    expect(await screen.findByText("2 players have already joined.")).toBeInTheDocument();
  });

  it("shows host controls in the lobby and starts the game", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(session());
    mocked.fetchPartyPlayers.mockResolvedValue([player()]);
    mocked.advancePartyRound.mockResolvedValue(session({ status: "playing", roundNumber: 1 }));
    render(<PartyRoom code="ABCDEF" />);

    expect(await screen.findByText("Start whenever everyone's in.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start Game" }));
    await waitFor(() =>
      expect(mocked.advancePartyRound).toHaveBeenCalledWith("ABCDEF", "player-1"),
    );
  });

  it("shows a waiting message for a non-host in the lobby", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(session({ hostPlayerId: "someone-else" }));
    mocked.fetchPartyPlayers.mockResolvedValue([
      player(),
      player({ id: "someone-else", name: "Host" }),
    ]);
    render(<PartyRoom code="ABCDEF" />);

    expect(await screen.findByText("Waiting for the host to start the game.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start Game" })).not.toBeInTheDocument();
  });

  it("shows round results and lets the player ready up", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(
      session({ status: "round_results", roundNumber: 1 }),
    );
    mocked.fetchPartyPlayers.mockResolvedValue([
      player(),
      player({ id: "p2", name: "Alice", isReady: true }),
    ]);
    mocked.fetchPartyRoundResults.mockResolvedValue([
      {
        id: "r1",
        sessionId: "s1",
        roundNumber: 1,
        playerId: "p2",
        status: "finished",
        clicks: 3,
        durationMs: 4000,
        path: [],
        finishedAt: "",
      },
    ]);
    mocked.setPlayerReady.mockResolvedValue(undefined);
    render(<PartyRoom code="ABCDEF" />);

    expect(await screen.findByText("Round 1 results")).toBeInTheDocument();
    expect(screen.getAllByText("Alice").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Ready for next round" }));
    await waitFor(() =>
      expect(mocked.setPlayerReady).toHaveBeenCalledWith("ABCDEF", "player-1", true),
    );
  });

  it("shows a disabled waiting button once this player is ready", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(
      session({ status: "round_results", roundNumber: 1 }),
    );
    mocked.fetchPartyPlayers.mockResolvedValue([player({ isReady: true })]);
    render(<PartyRoom code="ABCDEF" />);

    expect(await screen.findByRole("button", { name: /Waiting for others/ })).toBeDisabled();
  });

  it("shows a finished message once the session has ended", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(session({ status: "finished" }));
    mocked.fetchPartyPlayers.mockResolvedValue([player()]);
    render(<PartyRoom code="ABCDEF" />);
    expect(await screen.findByText("This session has ended.")).toBeInTheDocument();
  });

  it("copies the invite link from the party code banner", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    mocked.fetchPartySessionByCode.mockResolvedValue(session());
    mocked.fetchPartyPlayers.mockResolvedValue([player()]);
    render(<PartyRoom code="ABCDEF" />);

    fireEvent.click(await screen.findByRole("button", { name: "Copy invite link" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/party/ABCDEF")),
    );
    expect(await screen.findByText("Copied!")).toBeInTheDocument();
  });

  it("plays a round end to end and reports the win", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(
      session({ status: "playing", roundNumber: 1, currentStartTitle: "Bacteria" }),
    );
    mocked.fetchPartyPlayers.mockResolvedValue([player()]);
    mocked.createPartyAttempt.mockResolvedValue({
      roundNumber: 1,
      article: {
        title: "Bacteria",
        html: '<a class="wiki-link" data-title="Tuberculosis">TB</a>',
        isTarget: false,
      },
    });
    mocked.navigatePartyAttempt.mockResolvedValue({
      title: "Tuberculosis",
      html: "<p>done</p>",
      isTarget: true,
      clicks: 1,
      elapsedMs: 4200,
    });
    mocked.completeRoundIfDone.mockResolvedValue(undefined);

    render(<PartyRoom code="ABCDEF" />);

    fireEvent.click(await screen.findByText("TB"));

    expect(await screen.findByText("You made it!")).toBeInTheDocument();
    expect(screen.getByText(/1 click ·/)).toBeInTheDocument();
    await waitFor(() => expect(mocked.completeRoundIfDone).toHaveBeenCalledWith("ABCDEF", 1));
  });

  it("falls back to the race hook's own clicks/time when the server result has no elapsedMs", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(
      session({ status: "playing", roundNumber: 1, currentStartTitle: "Bacteria" }),
    );
    mocked.fetchPartyPlayers.mockResolvedValue([player()]);
    mocked.createPartyAttempt.mockResolvedValue({
      roundNumber: 1,
      article: {
        title: "Bacteria",
        html: '<a class="wiki-link" data-title="Tuberculosis">TB</a>',
        isTarget: false,
      },
    });
    // No elapsedMs on the response means PartyRound's own finalResult is
    // never set, so the "won" view must fall back to the race hook's values.
    mocked.navigatePartyAttempt.mockResolvedValue({
      title: "Tuberculosis",
      html: "<p>done</p>",
      isTarget: true,
    });
    mocked.completeRoundIfDone.mockResolvedValue(undefined);

    render(<PartyRoom code="ABCDEF" />);
    fireEvent.click(await screen.findByText("TB"));

    expect(await screen.findByText("You made it!")).toBeInTheDocument();
    expect(screen.getByText(/1 click ·/)).toBeInTheDocument();
  });

  it("applies incremental realtime updates without refetching", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(session());
    mocked.fetchPartyPlayers.mockResolvedValue([player()]);
    render(<PartyRoom code="ABCDEF" />);

    expect(await screen.findByText("Lobby")).toBeInTheDocument();
    await waitFor(() => expect(capturedHandlers.onPlayerChange).toBeTruthy());

    capturedHandlers.onPlayerChange?.({
      eventType: "INSERT",
      id: "p2",
      row: player({ id: "p2", name: "Alice", joinedAt: "2026-01-02T00:00:00.000Z" }),
    });
    expect(await screen.findByText("Alice")).toBeInTheDocument();

    capturedHandlers.onResync?.();
    await waitFor(() => expect(mocked.fetchPartyPlayers).toHaveBeenCalledTimes(2));
  });

  it("resets results when the realtime session update advances the round", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(
      session({ status: "round_results", roundNumber: 1 }),
    );
    mocked.fetchPartyPlayers.mockResolvedValue([player()]);
    mocked.fetchPartyRoundResults.mockResolvedValue([
      {
        id: "r1",
        sessionId: "s1",
        roundNumber: 1,
        playerId: "player-1",
        status: "finished",
        clicks: 1,
        durationMs: 1,
        path: [],
        finishedAt: "",
      },
    ]);
    render(<PartyRoom code="ABCDEF" />);

    await waitFor(() => expect(capturedHandlers.onSessionChange).toBeTruthy());
    capturedHandlers.onSessionChange?.(
      session({ status: "playing", roundNumber: 2, currentStartTitle: "Bacteria" }),
    );

    await waitFor(() => expect(mocked.fetchPartyRoundResults).toHaveBeenCalledTimes(1));
  });

  it("ignores a realtime result change for a stale round or an unfinished attempt", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(
      session({ status: "round_results", roundNumber: 2 }),
    );
    mocked.fetchPartyPlayers.mockResolvedValue([player()]);
    render(<PartyRoom code="ABCDEF" />);
    await waitFor(() => expect(capturedHandlers.onResultChange).toBeTruthy());

    // Stray event for a round we've already moved past.
    capturedHandlers.onResultChange?.({
      eventType: "INSERT",
      id: "r-old",
      row: {
        id: "r-old",
        sessionId: "s1",
        roundNumber: 1,
        playerId: "player-1",
        status: "finished",
        clicks: 1,
        durationMs: 1,
        path: [],
        finishedAt: "",
      },
    });
    // In-progress attempts don't belong in the results list yet.
    capturedHandlers.onResultChange?.({
      eventType: "INSERT",
      id: "r-inprogress",
      row: {
        id: "r-inprogress",
        sessionId: "s1",
        roundNumber: 2,
        playerId: "player-1",
        status: "in_progress",
        clicks: 1,
        durationMs: 1,
        path: [],
        finishedAt: "",
      },
    });
    expect(screen.queryByText("(you)")).not.toBeInTheDocument();

    capturedHandlers.onResultChange?.({
      eventType: "INSERT",
      id: "r-real",
      row: {
        id: "r-real",
        sessionId: "s1",
        roundNumber: 2,
        playerId: "player-1",
        status: "finished",
        clicks: 2,
        durationMs: 500,
        path: [],
        finishedAt: "",
      },
    });
    expect(await screen.findByText("(you)")).toBeInTheDocument();

    // A second finished result tied on clicks forces the sort's durationMs
    // tiebreaker to actually run (not just the clicks comparison).
    capturedHandlers.onResultChange?.({
      eventType: "INSERT",
      id: "r-tied",
      row: {
        id: "r-tied",
        sessionId: "s1",
        roundNumber: 2,
        playerId: "someone-else",
        status: "finished",
        clicks: 2,
        durationMs: 100,
        path: [],
        finishedAt: "",
      },
    });
    expect(await screen.findByText("(you)")).toBeInTheDocument();
  });

  it("auto-completes the round once every player has a result", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(
      session({ status: "playing", roundNumber: 1 }),
    );
    mocked.fetchPartyPlayers.mockResolvedValue([player()]);
    mocked.fetchPartyRoundResults.mockResolvedValue([
      {
        id: "r1",
        sessionId: "s1",
        roundNumber: 1,
        playerId: "player-1",
        status: "finished",
        clicks: 1,
        durationMs: 1,
        path: [],
        finishedAt: "",
      },
    ]);
    mocked.completeRoundIfDone.mockResolvedValue(undefined);

    render(<PartyRoom code="ABCDEF" />);

    await waitFor(() => expect(mocked.completeRoundIfDone).toHaveBeenCalledWith("ABCDEF", 1));
  });

  it("auto-advances the round once every player is ready", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(
      session({ status: "round_results", roundNumber: 1 }),
    );
    mocked.fetchPartyPlayers.mockResolvedValue([player({ isReady: true })]);
    mocked.advancePartyRound.mockResolvedValue(session({ status: "playing", roundNumber: 2 }));

    render(<PartyRoom code="ABCDEF" />);

    await waitFor(() =>
      expect(mocked.advancePartyRound).toHaveBeenCalledWith("ABCDEF", "player-1"),
    );
  });

  it("retries auto-advancing the round after a failure, on the next players update", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(
      session({ status: "round_results", roundNumber: 1 }),
    );
    mocked.fetchPartyPlayers.mockResolvedValue([player({ isReady: true })]);
    mocked.advancePartyRound
      .mockRejectedValueOnce(new Error("not ready"))
      .mockResolvedValueOnce(session({ status: "playing", roundNumber: 2 }));

    render(<PartyRoom code="ABCDEF" />);
    await waitFor(() => expect(mocked.advancePartyRound).toHaveBeenCalledTimes(1));

    // The failed attempt clears the "already tried this round" ref, but the
    // effect only re-runs on a genuine players/session change — a realtime
    // update (even a no-op one) is what actually triggers the retry.
    await waitFor(() => expect(capturedHandlers.onPlayerChange).toBeTruthy());
    capturedHandlers.onPlayerChange?.({
      eventType: "UPDATE",
      id: "player-1",
      row: player({ isReady: true }),
    });

    await waitFor(() => expect(mocked.advancePartyRound).toHaveBeenCalledTimes(2));
  });

  it("shows an error when starting the game fails", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(session());
    mocked.fetchPartyPlayers.mockResolvedValue([player()]);
    mocked.advancePartyRound.mockRejectedValue(new Error("could not start"));
    render(<PartyRoom code="ABCDEF" />);

    fireEvent.click(await screen.findByRole("button", { name: "Start Game" }));
    expect(await screen.findByText("could not start")).toBeInTheDocument();
  });

  it("shows a default start-game error when something other than an Error is thrown", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(session());
    mocked.fetchPartyPlayers.mockResolvedValue([player()]);
    mocked.advancePartyRound.mockRejectedValue("not an Error instance");
    render(<PartyRoom code="ABCDEF" />);

    fireEvent.click(await screen.findByRole("button", { name: "Start Game" }));
    expect(await screen.findByText("Failed to start the game.")).toBeInTheDocument();
  });

  it("silently ignores a clipboard failure when copying the invite link", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    mocked.fetchPartySessionByCode.mockResolvedValue(session());
    mocked.fetchPartyPlayers.mockResolvedValue([player()]);
    render(<PartyRoom code="ABCDEF" />);

    fireEvent.click(await screen.findByRole("button", { name: "Copy invite link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
  });

  it("restarts and retries an in-progress round", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(
      session({ status: "playing", roundNumber: 1, currentStartTitle: "Bacteria" }),
    );
    mocked.fetchPartyPlayers.mockResolvedValue([player()]);
    mocked.createPartyAttempt.mockResolvedValue({
      roundNumber: 1,
      article: { title: "Bacteria", html: "<p>start</p>", isTarget: false },
    });

    render(<PartyRoom code="ABCDEF" />);
    await screen.findByRole("heading", { name: "Bacteria" });
    expect(mocked.createPartyAttempt).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(await screen.findByText("Restart this game?")).toBeInTheDocument();
    const restartButtons = screen.getAllByRole("button", { name: "Restart" });
    fireEvent.click(restartButtons[restartButtons.length - 1]);

    await waitFor(() => expect(mocked.createPartyAttempt).toHaveBeenCalledTimes(2));
  });

  it("retries loading the starting article after a failure", async () => {
    mocked.fetchPartySessionByCode.mockResolvedValue(
      session({ status: "playing", roundNumber: 1, currentStartTitle: "Bacteria" }),
    );
    mocked.fetchPartyPlayers.mockResolvedValue([player()]);
    mocked.createPartyAttempt
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({
        roundNumber: 1,
        article: { title: "Bacteria", html: "<p>start</p>", isTarget: false },
      });

    render(<PartyRoom code="ABCDEF" />);

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: "Bacteria" });
    expect(mocked.createPartyAttempt).toHaveBeenCalledTimes(2);
  });
});
