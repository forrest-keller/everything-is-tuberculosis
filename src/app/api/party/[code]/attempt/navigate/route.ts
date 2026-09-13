import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { WikipediaError } from "@/lib/wikipedia";
import { buildNavigationClickResponse, computeNavigationClick } from "@/lib/navigate-attempt";
import { clientIp, isRateLimited, rateLimitResponse } from "@/lib/rate-limit";
import { parseJsonBody, requiredNumber, requiredString, requiredUuid } from "@/lib/validation";

const MISSING_FIELDS_MSG = "Missing playerId, roundNumber, or title.";
const navigateSchema = z.object({
  playerId: requiredUuid(MISSING_FIELDS_MSG),
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
    const { article, update } = await computeNavigationClick(title, {
      clicks: attempt.clicks,
      path: attempt.path as string[],
      startedAt: attempt.started_at,
    });

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

    return NextResponse.json(buildNavigationClickResponse(article, updated));
  } catch (error) {
    console.error("[/api/party/[code]/attempt/navigate] failed:", error);
    const message =
      error instanceof WikipediaError
        ? error.message
        : "Something went wrong talking to Wikipedia.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
