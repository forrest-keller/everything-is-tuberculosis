import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { clientIp, isRateLimited, rateLimitResponse } from "@/lib/rate-limit";

// Writes to party_players go through this service-role route rather than
// directly from the browser (see the RLS policies in
// supabase/migrations/0001_initial_schema.sql) so joining can't be used to
// overwrite an arbitrary existing player's row via direct PostgREST access.
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (isRateLimited(`party-join:${clientIp(request)}`, 20)) return rateLimitResponse();

  const { code } = await params;
  const body = await request.json().catch(() => null);
  const playerId = typeof body?.playerId === "string" ? body.playerId : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!playerId) {
    return NextResponse.json({ error: "Missing player id." }, { status: 400 });
  }
  if (!name || name.length > 32) {
    return NextResponse.json(
      { error: "Enter a name between 1 and 32 characters." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServiceClient();
  const { data: session, error: sessionError } = await supabase
    .from("party_sessions")
    .select("id")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const { data: player, error: playerError } = await supabase
    .from("party_players")
    .upsert({ id: playerId, session_id: session.id, name }, { onConflict: "id" })
    .select()
    .single();

  if (playerError) return NextResponse.json({ error: playerError.message }, { status: 400 });

  return NextResponse.json({ player });
}
