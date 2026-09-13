import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { clientIp, isRateLimited, rateLimitResponse } from "@/lib/rate-limit";
import {
  dbErrorResponse,
  parseJsonBody,
  requiredTrimmedString,
  requiredUuid,
} from "@/lib/validation";

const joinSchema = z.object({
  playerId: requiredUuid("Missing player id."),
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

  // code is an arbitrary, unconstrained text lookup — no public input can
  // make this query itself fail (a nonexistent code is 0 rows, not an
  // error), so this branch has no realistic trigger for an integration test.
  /* v8 ignore next */
  if (sessionError) return dbErrorResponse(sessionError, 500, "/api/party/[code]/join");
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

  // playerId is validated as a UUID up front and name is length-capped to
  // match party_players' own check constraint, so this update has no
  // remaining public-input trigger short of a genuine infra-level Postgres
  // failure.
  /* v8 ignore next */
  if (updateError) return dbErrorResponse(updateError, 400, "/api/party/[code]/join");
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
    // playerId is validated as a UUID up front and name is length-capped to
    // match party_players' own check constraint; the one other realistic
    // failure (id already in use) is a 23505, handled above. No remaining
    // public-input trigger short of a genuine infra-level Postgres failure.
    /* v8 ignore next */
    return dbErrorResponse(insertError, 400, "/api/party/[code]/join");
  }

  return NextResponse.json({ player: inserted });
}
