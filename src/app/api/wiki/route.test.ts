import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { isRateLimited } = vi.hoisted(() => ({ isRateLimited: vi.fn(() => false) }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, isRateLimited };
});

const { fetchArticle, fetchRandomStartArticle } = vi.hoisted(() => ({
  fetchArticle: vi.fn(),
  fetchRandomStartArticle: vi.fn(),
}));
vi.mock("@/lib/wikipedia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wikipedia")>();
  return { ...actual, fetchArticle, fetchRandomStartArticle };
});

import { WikipediaError } from "@/lib/wikipedia";
import { GET } from "./route";

describe("GET /api/wiki", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRateLimited.mockReturnValue(false);
  });

  it("returns 429 when rate limited", async () => {
    isRateLimited.mockReturnValue(true);
    const res = await GET(new NextRequest("http://localhost/api/wiki?mode=random"));
    expect(res.status).toBe(429);
    expect(fetchRandomStartArticle).not.toHaveBeenCalled();
  });

  it("returns a random article when mode=random", async () => {
    const article = { title: "Random Page", html: "<p/>", isTarget: false };
    fetchRandomStartArticle.mockResolvedValue(article);

    const res = await GET(new NextRequest("http://localhost/api/wiki?mode=random"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(article);
  });

  it("returns the article for a given title", async () => {
    const article = { title: "Bacteria", html: "<p/>", isTarget: false };
    fetchArticle.mockResolvedValue(article);

    const res = await GET(new NextRequest("http://localhost/api/wiki?title=Bacteria"));

    expect(fetchArticle).toHaveBeenCalledWith("Bacteria");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(article);
  });

  it("returns 400 when neither mode=random nor title is given", async () => {
    const res = await GET(new NextRequest("http://localhost/api/wiki"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Missing required 'title' parameter" });
  });

  it("returns 502 with the WikipediaError message on a known failure", async () => {
    fetchArticle.mockRejectedValue(new WikipediaError("Could not load \"X\" from Wikipedia (404)"));

    const res = await GET(new NextRequest("http://localhost/api/wiki?title=X"));

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: 'Could not load "X" from Wikipedia (404)' });
  });

  it("returns a generic 502 message on an unexpected error", async () => {
    fetchArticle.mockRejectedValue(new Error("boom"));

    const res = await GET(new NextRequest("http://localhost/api/wiki?title=X"));

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: "Something went wrong talking to Wikipedia.",
    });
  });
});
