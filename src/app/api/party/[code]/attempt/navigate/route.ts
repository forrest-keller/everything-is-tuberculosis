import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { WikipediaError } from "@/lib/wikipedia";
import { buildNavigationClickResponse, computeNavigationClick } from "@/lib/navigate-attempt";
import { clientIp, isRateLimited, rateLimitResponse } from "@/lib/rate-limit";
import {
  dbErrorResponse,
  parseJsonBody,
  requiredNumber,
  requiredString,
  requiredUuid,
} from "@/lib/validation";

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

  // code is an arbitrary, unconstrained text lookup — no public input can
  // make this query itself fail (a nonexistent code is 0 rows, not an
  // error), so this branch has no realistic trigger for an integration test.
  /* v8 ignore next */
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

    // session.id, roundNumber, and playerId already succeeded in an
    // identical lookup above, so this update has no remaining trigger short
    // of a genuine infra-level Postgres failure.
    /* v8 ignore next */
    if (updateError) return dbErrorResponse(updateError, 500, "/api/party/[code]/attempt/navigate");
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
