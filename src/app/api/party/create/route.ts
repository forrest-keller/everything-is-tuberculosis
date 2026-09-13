import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { clientIp, isRateLimited, rateLimitResponse } from "@/lib/rate-limit";
import {
  dbErrorResponse,
  parseJsonBody,
  requiredString,
  requiredTrimmedString,
} from "@/lib/validation";

// Excludes visually-ambiguous characters (0/O, 1/I/L).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const createPartySchema = z.object({
  hostName: requiredTrimmedString("Enter a name between 1 and 32 characters.", 32),
  hostPlayerId: requiredString("Missing player id."),
});

function generateCode(length = 5): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export async function POST(request: Request) {
  if (isRateLimited(`party-create:${clientIp(request)}`, 10)) return rateLimitResponse();

  const parsed = await parseJsonBody(request, createPartySchema);
  if (parsed.error) return parsed.error;
  const { hostName, hostPlayerId } = parsed.data;

  const supabase = getSupabaseServiceClient();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { data: session, error: sessionError } = await supabase
      .from("party_sessions")
      .insert({ code, host_player_id: hostPlayerId })
      .select()
      .single();

    if (sessionError) {
      if (sessionError.code === "23505") continue; // code collision, try another
      return dbErrorResponse(sessionError, 500, "/api/party/create");
    }

    const { error: playerError } = await supabase
      .from("party_players")
      .insert({ id: hostPlayerId, session_id: session.id, name: hostName });

    if (playerError) {
      return dbErrorResponse(playerError, 500, "/api/party/create");
    }

    return NextResponse.json({ session });
  }

  return NextResponse.json(
    { error: "Could not generate a unique room code, please try again." },
    { status: 500 },
  );
}
