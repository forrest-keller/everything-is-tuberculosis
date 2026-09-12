import { getSupabaseClient } from "@/lib/supabase";
import type { WikiArticleResponse } from "@/lib/wiki-client";

export interface DailyChallenge {
  challengeDate: string;
  startTitle: string;
}

export interface DailyScore {
  id: string;
  playerId: string;
  playerName: string;
  clicks: number;
  durationMs: number;
  path: string[];
  createdAt: string;
}

export interface DailyAttempt {
  attemptId: string;
  article: WikiArticleResponse;
}

export interface DailyNavigateResult extends WikiArticleResponse {
  clicks: number;
  elapsedMs?: number;
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function fetchTodayChallenge(): Promise<DailyChallenge> {
  const res = await fetch("/api/daily/challenge");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to load today's challenge.");
  return { challengeDate: data.challenge_date, startTitle: data.start_title };
}

/**
 * Starts a new server-tracked attempt at today's challenge. The server
 * records the start time and the winning article itself; the returned
 * `attemptId` is passed to `navigateDailyAttempt` for every subsequent click.
 */
export async function createDailyAttempt(params: {
  playerId: string;
  playerName: string;
}): Promise<DailyAttempt> {
  const res = await fetch("/api/daily/attempt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to start today's attempt.");
  return {
    attemptId: data.attemptId,
    article: { title: data.title, html: data.html, isTarget: data.isTarget },
  };
}

/**
 * Proxies one click through the server, which fetches the article itself,
 * increments the attempt's click count, and — if it's the target — stamps
 * the authoritative duration. Clicks and timing are never taken from the
 * client.
 */
export async function navigateDailyAttempt(
  attemptId: string,
  playerId: string,
  title: string
): Promise<DailyNavigateResult> {
  const res = await fetch(`/api/daily/attempt/${attemptId}/navigate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, title }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Failed to load "${title}".`);
  return data;
}

export async function fetchDailyLeaderboard(
  challengeDate: string,
  limit = 20
): Promise<DailyScore[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("daily_scores")
    .select("id, player_id, player_name, clicks, duration_ms, path, created_at")
    .eq("challenge_date", challengeDate)
    .eq("status", "finished")
    .order("clicks", { ascending: true })
    .order("duration_ms", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    playerId: row.player_id as string,
    playerName: row.player_name as string,
    clicks: row.clicks as number,
    durationMs: row.duration_ms as number,
    path: (row.path as string[]) ?? [],
    createdAt: row.created_at as string,
  }));
}
