import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { fetchRandomStartArticle, WikipediaError } from "@/lib/wikipedia";
import { clientIp, isRateLimited, rateLimitResponse } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/validation";

// playerId isn't required here — an absent/malformed one just fails the
// host/readiness checks below with their own status codes, same as before.
const advanceSchema = z.object({
  playerId: z.string().catch(""),
});

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (isRateLimited(`party-advance:${clientIp(request)}`, 10)) return rateLimitResponse();

  const { code } = await params;
  const parsed = await parseJsonBody(request, advanceSchema);
  if (parsed.error) return parsed.error;
  const { playerId } = parsed.data;

  const supabase = getSupabaseServiceClient();
  const { data: session, error: sessionError } = await supabase
    .from("party_sessions")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  if (session.status === "lobby") {
    if (session.host_player_id !== playerId) {
      return NextResponse.json({ error: "Only the host can start the game." }, { status: 403 });
    }
  } else if (session.status === "round_results") {
    const { data: players, error: playersError } = await supabase
      .from("party_players")
      .select("is_ready")
      .eq("session_id", session.id);
    if (playersError) return NextResponse.json({ error: playersError.message }, { status: 500 });
    if (!players?.length || !players.every((p) => p.is_ready)) {
      return NextResponse.json({ error: "Not everyone is ready yet." }, { status: 409 });
    }
  } else {
    return NextResponse.json(
      { error: `Can't start a new round from status "${session.status}".` },
      { status: 409 },
    );
  }

  let startTitle: string;
  try {
    startTitle = (await fetchRandomStartArticle()).title;
  } catch (error) {
    console.error("[/api/party/[code]/advance] failed:", error);
    const message =
      error instanceof WikipediaError
        ? error.message
        : "Something went wrong talking to Wikipedia.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Guarded by the status filter so a duplicate/racing call is a no-op.
  const { data: updated, error: updateError } = await supabase
    .from("party_sessions")
    .update({
      status: "playing",
      round_number: session.round_number + 1,
      current_start_title: startTitle,
    })
    .eq("id", session.id)
    .eq("status", session.status)
    .select()
    .maybeSingle();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!updated) {
    return NextResponse.json({ error: "Session already advanced." }, { status: 409 });
  }

  await supabase.from("party_players").update({ is_ready: false }).eq("session_id", session.id);

  return NextResponse.json(updated);
}
