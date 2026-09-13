import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { fetchArticle, WikipediaError } from "@/lib/wikipedia";
import { clientIp, isRateLimited, rateLimitResponse } from "@/lib/rate-limit";
import { parseJsonBody, requiredString } from "@/lib/validation";

// Generous enough that no real player will ever hit it (Wikipedia's link-distance
// to any article is small), but bounds worst-case storage and upstream API cost
// for an attempt an attacker or script keeps alive indefinitely.
const MAX_CLICKS_PER_ATTEMPT = 300;

const MISSING_FIELDS_MSG = "Missing playerId or title.";
const dailyNavigateSchema = z.object({
  playerId: requiredString(MISSING_FIELDS_MSG),
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

  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
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
      error instanceof WikipediaError
        ? error.message
        : "Something went wrong talking to Wikipedia.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
