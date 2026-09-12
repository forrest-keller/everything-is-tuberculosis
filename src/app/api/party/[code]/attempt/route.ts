import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { fetchArticle, WikipediaError } from "@/lib/wikipedia";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await request.json().catch(() => null);
  const playerId = typeof body?.playerId === "string" ? body.playerId : "";

  if (!playerId) {
    return NextResponse.json({ error: "Missing playerId." }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  const { data: session, error: sessionError } = await supabase
    .from("party_sessions")
    .select("id, status, round_number, current_start_title")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  if (session.status !== "playing" || !session.current_start_title) {
    return NextResponse.json({ error: "This round isn't active." }, { status: 409 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("party_round_results")
    .select("status")
    .eq("session_id", session.id)
    .eq("round_number", session.round_number)
    .eq("player_id", playerId)
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (existing?.status === "finished") {
    return NextResponse.json({ error: "You've already finished this round." }, { status: 409 });
  }

  try {
    const article = await fetchArticle(session.current_start_title);

    const { error: upsertError } = await supabase.from("party_round_results").upsert(
      {
        session_id: session.id,
        round_number: session.round_number,
        player_id: playerId,
        path: [article.title],
        status: "in_progress",
        clicks: 0,
        duration_ms: 0,
        started_at: new Date().toISOString(),
      },
      { onConflict: "session_id,round_number,player_id" }
    );

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 400 });

    return NextResponse.json({
      roundNumber: session.round_number,
      title: article.title,
      html: article.html,
      isTarget: article.isTarget,
    });
  } catch (error) {
    console.error("[/api/party/[code]/attempt] failed:", error);
    const message =
      error instanceof WikipediaError ? error.message : "Something went wrong talking to Wikipedia.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
