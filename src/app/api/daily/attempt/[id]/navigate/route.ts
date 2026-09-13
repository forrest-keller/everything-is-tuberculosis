import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { WikipediaError } from "@/lib/wikipedia";
import { buildNavigationClickResponse, computeNavigationClick } from "@/lib/navigate-attempt";
import { clientIp, isRateLimited, rateLimitResponse } from "@/lib/rate-limit";
import { dbErrorResponse, parseJsonBody, requiredString, requiredUuid } from "@/lib/validation";

// Generous enough that no real player will ever hit it (Wikipedia's link-distance
// to any article is small), but bounds worst-case storage and upstream API cost
// for an attempt an attacker or script keeps alive indefinitely.
const MAX_CLICKS_PER_ATTEMPT = 300;

const MISSING_FIELDS_MSG = "Missing playerId or title.";
const dailyNavigateSchema = z.object({
  playerId: requiredUuid(MISSING_FIELDS_MSG),
  title: requiredString(MISSING_FIELDS_MSG),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isRateLimited(`daily-navigate:${clientIp(request)}`, 60)) return rateLimitResponse();

  const { id } = await params;
  const parsed = await parseJsonBody(request, dailyNavigateSchema);
  if (parsed.error) return parsed.error;
  const { playerId, title } = parsed.data;

  const supabase = getSupabaseServiceClient();
  const { data: attempt, error: loadError } = await supabase
    .from("daily_scores")
    .select("id, player_id, status, started_at, clicks, path")
    .eq("id", id)
    .maybeSingle();

  if (loadError) return dbErrorResponse(loadError, 500, "/api/daily/attempt/[id]/navigate");
  if (!attempt) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  if (attempt.player_id !== playerId) {
    return NextResponse.json({ error: "This attempt doesn't belong to you." }, { status: 403 });
  }
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "This attempt has already finished." }, { status: 409 });
  }
  if (attempt.clicks >= MAX_CLICKS_PER_ATTEMPT) {
    return NextResponse.json(
      { error: "This attempt has reached the maximum number of moves." },
      { status: 409 },
    );
  }

  try {
    const { article, update } = await computeNavigationClick(title, {
      clicks: attempt.clicks,
      path: attempt.path as string[],
      startedAt: attempt.started_at,
    });

    const { data: updated, error: updateError } = await supabase
      .from("daily_scores")
      .update(update)
      .eq("id", id)
      .eq("status", "in_progress")
      .select("clicks, duration_ms")
      .maybeSingle();

    // id already succeeded in an identical lookup above, so this update has
    // no remaining trigger short of a genuine infra-level Postgres failure.
    /* v8 ignore next */
    if (updateError) return dbErrorResponse(updateError, 500, "/api/daily/attempt/[id]/navigate");
    if (!updated) {
      return NextResponse.json({ error: "This attempt has already finished." }, { status: 409 });
    }

    return NextResponse.json(buildNavigationClickResponse(article, updated));
  } catch (error) {
    console.error("[/api/daily/attempt/[id]/navigate] failed:", error);
    const message =
      error instanceof WikipediaError
        ? error.message
        : "Something went wrong talking to Wikipedia.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
