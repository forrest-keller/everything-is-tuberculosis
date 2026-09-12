import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { fetchRandomStartArticle, WikipediaError } from "@/lib/wikipedia";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  const supabase = getSupabaseClient();
  const challengeDate = todayUtc();

  const { data: existing, error: selectError } = await supabase
    .from("daily_challenges")
    .select("*")
    .eq("challenge_date", challengeDate)
    .maybeSingle();

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }
  if (existing) return NextResponse.json(existing);

  try {
    const article = await fetchRandomStartArticle();
    const { data: inserted, error: insertError } = await supabase
      .from("daily_challenges")
      .insert({ challenge_date: challengeDate, start_title: article.title })
      .select()
      .single();

    if (!insertError && inserted) return NextResponse.json(inserted);

    // Another request likely created today's row first (unique violation) —
    // read back whatever ended up stored instead of erroring.
    const { data: retry } = await supabase
      .from("daily_challenges")
      .select("*")
      .eq("challenge_date", challengeDate)
      .maybeSingle();
    if (retry) return NextResponse.json(retry);

    return NextResponse.json(
      { error: insertError?.message ?? "Failed to create today's challenge." },
      { status: 500 }
    );
  } catch (error) {
    console.error("[/api/daily/challenge] failed:", error);
    const message =
      error instanceof WikipediaError ? error.message : "Something went wrong talking to Wikipedia.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
