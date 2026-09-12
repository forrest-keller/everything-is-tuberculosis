import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

// Excludes visually-ambiguous characters (0/O, 1/I/L).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateCode(length = 5): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const hostName = typeof body?.hostName === "string" ? body.hostName.trim() : "";
  const hostPlayerId = typeof body?.hostPlayerId === "string" ? body.hostPlayerId : "";

  if (!hostName || hostName.length > 32) {
    return NextResponse.json(
      { error: "Enter a name between 1 and 32 characters." },
      { status: 400 }
    );
  }
  if (!hostPlayerId) {
    return NextResponse.json({ error: "Missing player id." }, { status: 400 });
  }

  const supabase = getSupabaseClient();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { data: session, error: sessionError } = await supabase
      .from("party_sessions")
      .insert({ code, host_player_id: hostPlayerId })
      .select()
      .single();

    if (sessionError) {
      if (sessionError.code === "23505") continue; // code collision, try another
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }

    const { error: playerError } = await supabase
      .from("party_players")
      .insert({ id: hostPlayerId, session_id: session.id, name: hostName });

    if (playerError) {
      return NextResponse.json({ error: playerError.message }, { status: 500 });
    }

    return NextResponse.json({ session });
  }

  return NextResponse.json(
    { error: "Could not generate a unique room code, please try again." },
    { status: 500 }
  );
}
