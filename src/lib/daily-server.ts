import { getSupabaseClient } from "@/lib/supabase";
import { fetchRandomStartArticle } from "@/lib/wikipedia";

export interface DailyChallengeRow {
  challenge_date: string;
  start_title: string;
  created_at: string;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns today's challenge row, creating it if this is the first request of
 * the day. Shared by the challenge-lookup route and attempt creation so both
 * agree on what "today's start article" is.
 */
export async function getOrCreateTodayChallenge(): Promise<DailyChallengeRow> {
  const supabase = getSupabaseClient();
  const challengeDate = todayUtc();

  const { data: existing, error: selectError } = await supabase
    .from("daily_challenges")
    .select("*")
    .eq("challenge_date", challengeDate)
    .maybeSingle();

  if (selectError) throw new Error(selectError.message);
  if (existing) return existing as DailyChallengeRow;

  const article = await fetchRandomStartArticle();
  const { data: inserted, error: insertError } = await supabase
    .from("daily_challenges")
    .insert({ challenge_date: challengeDate, start_title: article.title })
    .select()
    .single();

  if (!insertError && inserted) return inserted as DailyChallengeRow;

  // Another request likely created today's row first (unique violation) —
  // read back whatever ended up stored instead of erroring.
  const { data: retry } = await supabase
    .from("daily_challenges")
    .select("*")
    .eq("challenge_date", challengeDate)
    .maybeSingle();
  if (retry) return retry as DailyChallengeRow;

  throw new Error(insertError?.message ?? "Failed to create today's challenge.");
}
