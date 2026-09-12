import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { fetchArticle, WikipediaError } from "@/lib/wikipedia";
import { clientIp, isRateLimited, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  if (isRateLimited(`party-navigate:${clientIp(request)}`, 60)) return rateLimitResponse();

  const { code } = await params;
  const body = await request.json().catch(() => null);
  const playerId = typeof body?.playerId === "string" ? body.playerId : "";
  const roundNumber = typeof body?.roundNumber === "number" ? body.roundNumber : NaN;
  const title = typeof body?.title === "string" ? body.title : "";

  if (!playerId || !title || Number.isNaN(roundNumber)) {
    return NextResponse.json({ error: "Missing playerId, roundNumber, or title." }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  const { data: session, error: sessionError } = await supabase
    .from("party_sessions")
    .select("id")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const { data: attempt, error: loadError } = await supabase
    .from("party_round_results")
    .select("status, started_at, clicks, path")
    .eq("session_id", session.id)
    .eq("round_number", roundNumber)
    .eq("player_id", playerId)
    .maybeSingle();

  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!attempt) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "This attempt has already finished." }, { status: 409 });
  }

  try {
    const article = await fetchArticle(title);
    const clicks = attempt.clicks + 1;
    const path = [...(attempt.path as string[]), article.title];

    const update = article.isTarget
      ? {
          clicks,
          path,
          status: "finished",
          duration_ms: Date.now() - new Date(attempt.started_at).getTime(),
        }
      : { clicks, path };

    const { data: updated, error: updateError } = await supabase
      .from("party_round_results")
      .update(update)
      .eq("session_id", session.id)
      .eq("round_number", roundNumber)
      .eq("player_id", playerId)
      .eq("status", "in_progress")
      .select("clicks, duration_ms")
      .maybeSingle();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    if (!updated) {
      return NextResponse.json({ error: "This attempt has already finished." }, { status: 409 });
    }

    return NextResponse.json({
      title: article.title,
      html: article.html,
      isTarget: article.isTarget,
      clicks: updated.clicks,
      elapsedMs: article.isTarget ? updated.duration_ms : undefined,
    });
  } catch (error) {
    console.error("[/api/party/[code]/attempt/navigate] failed:", error);
    const message =
      error instanceof WikipediaError ? error.message : "Something went wrong talking to Wikipedia.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
