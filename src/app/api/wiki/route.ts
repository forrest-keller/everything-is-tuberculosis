import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchArticle, fetchRandomStartArticle, WikipediaError } from "@/lib/wikipedia";
import { clientIp, isRateLimited, rateLimitResponse } from "@/lib/rate-limit";
import { parseQuery, requiredString } from "@/lib/validation";

const titleQuerySchema = z.object({
  title: requiredString("Missing required 'title' parameter"),
});

export async function GET(request: NextRequest) {
  if (isRateLimited(`wiki:${clientIp(request)}`, 30)) return rateLimitResponse();

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");

  try {
    if (mode === "random") {
      const article = await fetchRandomStartArticle();
      return NextResponse.json(article);
    }

    const parsed = parseQuery(searchParams, titleQuerySchema);
    if (parsed.error) return parsed.error;
    const { title } = parsed.data;

    const article = await fetchArticle(title);
    return NextResponse.json(article);
  } catch (error) {
    console.error("[/api/wiki] failed:", error);
    const message =
      error instanceof WikipediaError
        ? error.message
        : "Something went wrong talking to Wikipedia.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
