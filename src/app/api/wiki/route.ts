import { NextRequest, NextResponse } from "next/server";
import { fetchArticle, fetchRandomStartArticle, WikipediaError } from "@/lib/wikipedia";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");

  try {
    if (mode === "random") {
      const article = await fetchRandomStartArticle();
      return NextResponse.json(article);
    }

    const title = searchParams.get("title");
    if (!title) {
      return NextResponse.json(
        { error: "Missing required 'title' parameter" },
        { status: 400 }
      );
    }

    const article = await fetchArticle(title);
    return NextResponse.json(article);
  } catch (error) {
    console.error("[/api/wiki] failed:", error);
    const message = error instanceof WikipediaError
      ? error.message
      : "Something went wrong talking to Wikipedia.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
