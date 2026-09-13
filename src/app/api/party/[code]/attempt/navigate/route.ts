import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { fetchArticle, WikipediaError } from "@/lib/wikipedia";
import { clientIp, isRateLimited, rateLimitResponse } from "@/lib/rate-limit";
import { dbErrorResponse, parseJsonBody, requiredNumber, requiredString } from "@/lib/validation";

const MISSING_FIELDS_MSG = "Missing playerId, roundNumber, or title.";
const navigateSchema = z.object({
  playerId: requiredString(MISSING_FIELDS_MSG),
  roundNumber: requiredNumber(MISSING_FIELDS_MSG),
  title: requiredString(MISSING_FIELDS_MSG),
});

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (isRateLimited(`party-navigate:${clientIp(request)}`, 60)) return rateLimitResponse();

  const { code } = await params;
  const parsed = await parseJsonBody(request, navigateSchema);
  if (parsed.error) return parsed.error;
  const { playerId, roundNumber, title } = parsed.data;

  const supabase = getSupabaseServiceClient();
  const { data: session, error: sessionError } = await supabase
    .from("party_sessions")
    .select("id")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (sessionError) return dbErrorResponse(sessionError, 500, "/api/party/[code]/attempt/navigate");
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const { data: attempt, error: loadError } = await supabase
    .from("party_round_results")
    .select("status, started_at, clicks, path")
    .eq("session_id", session.id)
    .eq("round_number", roundNumber)
    .eq("player_id", playerId)
    .maybeSingle();

  if (loadError) return dbErrorResponse(loadError, 500, "/api/party/[code]/attempt/navigate");
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

    if (updateError) return dbErrorResponse(updateError, 500, "/api/party/[code]/attempt/navigate");
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
      error instanceof WikipediaError
        ? error.message
        : "Something went wrong talking to Wikipedia.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
