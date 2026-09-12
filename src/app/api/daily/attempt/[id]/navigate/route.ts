import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { fetchArticle, WikipediaError } from "@/lib/wikipedia";
import { clientIp, isRateLimited, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (isRateLimited(`daily-navigate:${clientIp(request)}`, 60)) return rateLimitResponse();

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const playerId = typeof body?.playerId === "string" ? body.playerId : "";
  const title = typeof body?.title === "string" ? body.title : "";

  if (!playerId || !title) {
    return NextResponse.json({ error: "Missing playerId or title." }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  const { data: attempt, error: loadError } = await supabase
    .from("daily_scores")
    .select("id, player_id, status, started_at, clicks, path")
    .eq("id", id)
    .maybeSingle();

  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!attempt) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  if (attempt.player_id !== playerId) {
    return NextResponse.json({ error: "This attempt doesn't belong to you." }, { status: 403 });
  }
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
      .from("daily_scores")
      .update(update)
      .eq("id", id)
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
    console.error("[/api/daily/attempt/[id]/navigate] failed:", error);
    const message =
      error instanceof WikipediaError ? error.message : "Something went wrong talking to Wikipedia.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
