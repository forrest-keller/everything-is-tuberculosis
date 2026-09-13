import { NextResponse } from "next/server";
import { getOrCreateTodayChallenge } from "@/lib/daily-server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { fetchArticle, WikipediaError } from "@/lib/wikipedia";
import { clientIp, isRateLimited, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (isRateLimited(`daily-attempt:${clientIp(request)}`, 10)) return rateLimitResponse();

  const body = await request.json().catch(() => null);
  const playerId = typeof body?.playerId === "string" ? body.playerId : "";
  const playerName = typeof body?.playerName === "string" ? body.playerName : "";

  if (!playerId || !playerName) {
    return NextResponse.json({ error: "Missing playerId or playerName." }, { status: 400 });
  }

  try {
    const challenge = await getOrCreateTodayChallenge();
    const article = await fetchArticle(challenge.start_title);

    const supabase = getSupabaseServiceClient();
    const { data: attempt, error } = await supabase
      .from("daily_scores")
      .insert({
        challenge_date: challenge.challenge_date,
        player_id: playerId,
        player_name: playerName,
        path: [article.title],
        status: "in_progress",
      })
      .select("id")
      .single();

    if (error || !attempt) {
      return NextResponse.json(
        { error: error?.message ?? "Failed to start today's attempt." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      attemptId: attempt.id,
      title: article.title,
      html: article.html,
      isTarget: article.isTarget,
    });
  } catch (error) {
    console.error("[/api/daily/attempt] failed:", error);
    if (error instanceof WikipediaError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : "Failed to start today's attempt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
