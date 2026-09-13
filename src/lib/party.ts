import { getSupabaseClient } from "@/lib/supabase";
import type { WikiArticleResponse } from "@/lib/wiki-client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type PartyStatus = "lobby" | "playing" | "round_results" | "finished";

export interface PartySession {
  id: string;
  code: string;
  status: PartyStatus;
  roundNumber: number;
  currentStartTitle: string | null;
  hostPlayerId: string;
}

export interface PartyPlayer {
  id: string;
  sessionId: string;
  name: string;
  isReady: boolean;
  joinedAt: string;
}

export interface PartyRoundResult {
  id: string;
  sessionId: string;
  roundNumber: number;
  playerId: string;
  status: "in_progress" | "finished";
  clicks: number;
  durationMs: number;
  path: string[];
  finishedAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSession(row: any): PartySession {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    roundNumber: row.round_number,
    currentStartTitle: row.current_start_title,
    hostPlayerId: row.host_player_id,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPlayer(row: any): PartyPlayer {
  return {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    isReady: row.is_ready,
    joinedAt: row.joined_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapResult(row: any): PartyRoundResult {
  return {
    id: row.id,
    sessionId: row.session_id,
    roundNumber: row.round_number,
    playerId: row.player_id,
    status: row.status,
    clicks: row.clicks,
    durationMs: row.duration_ms,
    path: row.path ?? [],
    finishedAt: row.finished_at,
  };
}

async function readJsonOrThrow(res: Response) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

export async function createPartySession(
  hostName: string,
  hostPlayerId: string,
): Promise<PartySession> {
  const res = await fetch("/api/party/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hostName, hostPlayerId }),
  });
  const data = await readJsonOrThrow(res);
  return mapSession(data.session);
}

export async function fetchPartySessionByCode(code: string): Promise<PartySession | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("party_sessions")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapSession(data) : null;
}

export async function joinPartySession(
  code: string,
  playerId: string,
  name: string,
): Promise<PartyPlayer> {
  const res = await fetch(`/api/party/${code}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, name }),
  });
  const data = await readJsonOrThrow(res);
  return mapPlayer(data.player);
}

export async function fetchPartyPlayers(sessionId: string): Promise<PartyPlayer[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("party_players")
    .select("*")
    .eq("session_id", sessionId)
    .order("joined_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapPlayer);
}

export async function fetchPartyRoundResults(
  sessionId: string,
  roundNumber: number,
): Promise<PartyRoundResult[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("party_round_results")
    .select("*")
    .eq("session_id", sessionId)
    .eq("round_number", roundNumber)
    .eq("status", "finished")
    .order("clicks", { ascending: true })
    .order("duration_ms", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapResult);
}

export async function setPlayerReady(
  code: string,
  playerId: string,
  isReady: boolean,
): Promise<void> {
  const res = await fetch(`/api/party/${code}/ready`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, isReady }),
  });
  await readJsonOrThrow(res);
}

export interface PartyAttempt {
  roundNumber: number;
  article: WikiArticleResponse;
}

export interface PartyNavigateResult extends WikiArticleResponse {
  clicks: number;
  elapsedMs?: number;
}

/**
 * Starts (or restarts, if called again before finishing) a server-tracked
 * attempt at the session's current round. The server records the start time
 * itself; every subsequent click goes through `navigatePartyAttempt`.
 */
export async function createPartyAttempt(code: string, playerId: string): Promise<PartyAttempt> {
  const res = await fetch(`/api/party/${code}/attempt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId }),
  });
  const data = await readJsonOrThrow(res);
  return {
    roundNumber: data.roundNumber,
    article: { title: data.title, html: data.html, isTarget: data.isTarget },
  };
}

/**
 * Proxies one click through the server, which fetches the article itself,
 * increments the attempt's click count, and — if it's the target — stamps
 * the authoritative duration. Clicks and timing are never taken from the
 * client.
 */
export async function navigatePartyAttempt(
  code: string,
  playerId: string,
  roundNumber: number,
  title: string,
): Promise<PartyNavigateResult> {
  const res = await fetch(`/api/party/${code}/attempt/navigate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, roundNumber, title }),
  });
  return readJsonOrThrow(res);
}

/** Flips a session from "playing" to "round_results" once every current
 * player has submitted a result for the round. Safe to call redundantly. */
export async function completeRoundIfDone(code: string, roundNumber: number): Promise<void> {
  const res = await fetch(`/api/party/${code}/complete-round`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roundNumber }),
  });
  await readJsonOrThrow(res);
}

export async function advancePartyRound(code: string, playerId: string): Promise<PartySession> {
  const res = await fetch(`/api/party/${code}/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId }),
  });
  const data = await readJsonOrThrow(res);
  return mapSession(data);
}

/**
 * A single row change from a postgres_changes event, already mapped to our
 * camelCase shape. `row` is the new row for INSERT/UPDATE; for DELETE only
 * the id is reliably available (Postgres only sends the primary key for
 * deletes unless REPLICA IDENTITY FULL is set), so `row` is null and callers
 * should filter the deleted id out of their local list instead.
 */
export interface RealtimeRowChange<T> {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  id: string;
  row: T | null;
}

/** Applies one row change to a locally-held list without refetching. */
export function applyRealtimeChange<T extends { id: string }>(
  list: T[],
  change: RealtimeRowChange<T>,
): T[] {
  if (change.eventType === "DELETE") {
    return list.filter((item) => item.id !== change.id);
  }
  if (!change.row) return list;
  const exists = list.some((item) => item.id === change.row!.id);
  return exists
    ? list.map((item) => (item.id === change.row!.id ? change.row! : item))
    : [...list, change.row];
}

export function subscribeToPartySession(
  sessionId: string,
  handlers: {
    onSessionChange?: (session: PartySession) => void;
    onPlayerChange?: (change: RealtimeRowChange<PartyPlayer>) => void;
    onResultChange?: (change: RealtimeRowChange<PartyRoundResult>) => void;
    /** Fired when the socket resubscribes after a drop, so the caller can
     * do a one-time refetch to patch over whatever events were missed. */
    onResync?: () => void;
  },
): RealtimeChannel {
  const supabase = getSupabaseClient();
  let hasSubscribedBefore = false;

  return supabase
    .channel(`party-session-${sessionId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "party_sessions", filter: `id=eq.${sessionId}` },
      (payload) => {
        if (payload.new && "id" in payload.new) handlers.onSessionChange?.(mapSession(payload.new));
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "party_players",
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        const eventType = payload.eventType as RealtimeRowChange<PartyPlayer>["eventType"];
        const oldRow = payload.old as Record<string, unknown>;
        const newRow = payload.new as Record<string, unknown>;
        const id = (eventType === "DELETE" ? oldRow.id : newRow.id) as string | undefined;
        if (!id) return;
        handlers.onPlayerChange?.({
          eventType,
          id,
          row: eventType === "DELETE" ? null : mapPlayer(newRow),
        });
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "party_round_results",
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        const eventType = payload.eventType as RealtimeRowChange<PartyRoundResult>["eventType"];
        const oldRow = payload.old as Record<string, unknown>;
        const newRow = payload.new as Record<string, unknown>;
        const id = (eventType === "DELETE" ? oldRow.id : newRow.id) as string | undefined;
        if (!id) return;
        handlers.onResultChange?.({
          eventType,
          id,
          row: eventType === "DELETE" ? null : mapResult(newRow),
        });
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (hasSubscribedBefore) handlers.onResync?.();
        hasSubscribedBefore = true;
      }
    });
}
