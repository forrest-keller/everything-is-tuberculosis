import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { clientIp, isRateLimited, rateLimitResponse } from "@/lib/rate-limit";
import { parseJsonBody, requiredNumber } from "@/lib/validation";

const completeRoundSchema = z.object({
  roundNumber: requiredNumber("Missing roundNumber."),
});

/**
 * Flips a session from "playing" to "round_results" once every current
 * player has submitted a result for the round. Safe to call redundantly —
 * every player's client calls this once per round, guarded by the status
 * filter on the update so a racing/duplicate call is a no-op. Goes through
 * this service-role route rather than a direct client write to party_sessions
 * (see the RLS policies in supabase/migrations/0001_initial_schema.sql).
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (isRateLimited(`party-complete-round:${clientIp(request)}`, 30)) return rateLimitResponse();

  const { code } = await params;
  const parsed = await parseJsonBody(request, completeRoundSchema);
  if (parsed.error) return parsed.error;
  const { roundNumber } = parsed.data;

  const supabase = getSupabaseServiceClient();
  const { data: session, error: sessionError } = await supabase
    .from("party_sessions")
    .select("id")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const [{ count: playerCount }, { count: resultCount }] = await Promise.all([
    supabase
      .from("party_players")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id),
    supabase
      .from("party_round_results")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id)
      .eq("round_number", roundNumber)
      .eq("status", "finished"),
  ]);

  if (playerCount && resultCount !== null && resultCount >= playerCount) {
    await supabase
      .from("party_sessions")
      .update({ status: "round_results" })
      .eq("id", session.id)
      .eq("status", "playing");
  }

  return NextResponse.json({ ok: true });
}
