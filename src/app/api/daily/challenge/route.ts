import { NextRequest, NextResponse } from "next/server";
import { getOrCreateTodayChallenge } from "@/lib/daily-server";
import { WikipediaError } from "@/lib/wikipedia";
import { clientIp, isRateLimited, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  if (isRateLimited(`daily-challenge:${clientIp(request)}`, 60)) return rateLimitResponse();

  try {
    const challenge = await getOrCreateTodayChallenge();
    return NextResponse.json(challenge);
  } catch (error) {
    console.error("[/api/daily/challenge] failed:", error);
    if (error instanceof WikipediaError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : "Failed to load today's challenge.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
