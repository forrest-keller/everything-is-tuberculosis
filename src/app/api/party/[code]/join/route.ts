import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { clientIp, isRateLimited, rateLimitResponse } from "@/lib/rate-limit";
import { parseJsonBody, requiredString, requiredTrimmedString } from "@/lib/validation";

const joinSchema = z.object({
  playerId: requiredString("Missing player id."),
  name: requiredTrimmedString("Enter a name between 1 and 32 characters.", 32),
});

// Writes to party_players go through this service-role route rather than
// directly from the browser (see the RLS policies in
// supabase/migrations/0001_initial_schema.sql). There's no auth beyond a
// client-generated playerId, so this route itself also has to make sure
// joining can't be used to hijack an arbitrary existing player's row (see
// the update-then-insert below).
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (isRateLimited(`party-join:${clientIp(request)}`, 20)) return rateLimitResponse();

  const { code } = await params;
  const parsed = await parseJsonBody(request, joinSchema);
  if (parsed.error) return parsed.error;
  const { playerId, name } = parsed.data;

  const supabase = getSupabaseServiceClient();
  const { data: session, error: sessionError } = await supabase
    .from("party_sessions")
    .select("id")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  // Update-then-insert rather than upsert-by-id: an upsert would let a
  // client claim any playerId — including one already seated in a different
  // session — and reassign that row here, kicking its real owner out of
  // their game. Filtering the update to this session means it only ever
  // touches a row that's already a member here (the legitimate resubmit
  // case); claiming an id that belongs elsewhere then falls through to the
  // insert below, which fails on the primary key instead of silently moving
  // it.
  const { data: updated, error: updateError } = await supabase
    .from("party_players")
    .update({ name })
    .eq("id", playerId)
    .eq("session_id", session.id)
    .select()
    .maybeSingle();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
  if (updated) return NextResponse.json({ player: updated });

  const { data: inserted, error: insertError } = await supabase
    .from("party_players")
    .insert({ id: playerId, session_id: session.id, name })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "That player is already in a different session." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ player: inserted });
}
