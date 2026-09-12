import { getSupabaseClient } from "@/lib/supabase";
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
  hostPlayerId: string
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
  sessionId: string,
  playerId: string,
  name: string
): Promise<PartyPlayer> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("party_players")
    .upsert({ id: playerId, session_id: sessionId, name }, { onConflict: "id" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapPlayer(data);
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
  roundNumber: number
): Promise<PartyRoundResult[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("party_round_results")
    .select("*")
    .eq("session_id", sessionId)
    .eq("round_number", roundNumber)
    .order("clicks", { ascending: true })
    .order("duration_ms", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapResult);
}

export async function setPlayerReady(playerId: string, isReady: boolean): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("party_players")
    .update({ is_ready: isReady })
    .eq("id", playerId);
  if (error) throw new Error(error.message);
}

export async function submitRoundResult(params: {
  sessionId: string;
  roundNumber: number;
  playerId: string;
  clicks: number;
  durationMs: number;
  path: string[];
}): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("party_round_results").upsert(
    {
      session_id: params.sessionId,
      round_number: params.roundNumber,
      player_id: params.playerId,
      clicks: params.clicks,
      duration_ms: params.durationMs,
      path: params.path,
    },
    { onConflict: "session_id,round_number,player_id" }
  );
  if (error) throw new Error(error.message);
}

/** Flips a session from "playing" to "round_results" once every current
 * player has submitted a result for the round. Safe to call redundantly. */
export async function completeRoundIfDone(
  sessionId: string,
  roundNumber: number
): Promise<void> {
  const supabase = getSupabaseClient();
  const [{ count: playerCount }, { count: resultCount }] = await Promise.all([
    supabase.from("party_players").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
    supabase
      .from("party_round_results")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("round_number", roundNumber),
  ]);

  if (playerCount && resultCount !== null && resultCount >= playerCount) {
    await supabase
      .from("party_sessions")
      .update({ status: "round_results" })
      .eq("id", sessionId)
      .eq("status", "playing");
  }
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

export function subscribeToPartySession(
  sessionId: string,
  handlers: {
    onSessionChange?: (session: PartySession) => void;
    onPlayersChange?: () => void;
    onResultsChange?: () => void;
  }
): RealtimeChannel {
  const supabase = getSupabaseClient();
  return supabase
    .channel(`party-session-${sessionId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "party_sessions", filter: `id=eq.${sessionId}` },
      (payload) => {
        if (payload.new && "id" in payload.new) handlers.onSessionChange?.(mapSession(payload.new));
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "party_players", filter: `session_id=eq.${sessionId}` },
      () => handlers.onPlayersChange?.()
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "party_round_results",
        filter: `session_id=eq.${sessionId}`,
      },
      () => handlers.onResultsChange?.()
    )
    .subscribe();
}
