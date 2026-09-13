import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { clientIp, isRateLimited, rateLimitResponse } from "@/lib/rate-limit";
import { parseJsonBody, requiredBoolean, requiredString } from "@/lib/validation";

const MISSING_FIELDS_MSG = "Missing playerId or isReady.";
const readySchema = z.object({
  playerId: requiredString(MISSING_FIELDS_MSG),
  isReady: requiredBoolean(MISSING_FIELDS_MSG),
});

// Writes to party_players go through this service-role route rather than
// directly from the browser (see the RLS policies in
// supabase/migrations/0001_initial_schema.sql).
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (isRateLimited(`party-ready:${clientIp(request)}`, 20)) return rateLimitResponse();

  const { code } = await params;
  const parsed = await parseJsonBody(request, readySchema);
  if (parsed.error) return parsed.error;
  const { playerId, isReady } = parsed.data;

  const supabase = getSupabaseServiceClient();
  const { data: session, error: sessionError } = await supabase
    .from("party_sessions")
    .select("id")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const { error: updateError } = await supabase
    .from("party_players")
    .update({ is_ready: isReady })
    .eq("id", playerId)
    .eq("session_id", session.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
