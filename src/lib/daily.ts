import { getSupabaseClient } from "@/lib/supabase";

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

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function fetchTodayChallenge(): Promise<DailyChallenge> {
  const res = await fetch("/api/daily/challenge");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to load today's challenge.");
  return { challengeDate: data.challenge_date, startTitle: data.start_title };
}

export async function submitDailyScore(params: {
  challengeDate: string;
  playerId: string;
  playerName: string;
  clicks: number;
  durationMs: number;
  path: string[];
}): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("daily_scores").insert({
    challenge_date: params.challengeDate,
    player_id: params.playerId,
    player_name: params.playerName,
    clicks: params.clicks,
    duration_ms: params.durationMs,
    path: params.path,
  });
  if (error) throw new Error(error.message);
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
