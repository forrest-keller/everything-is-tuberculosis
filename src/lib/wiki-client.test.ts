import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchArticleByTitle, fetchRandomArticle } from "./wiki-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchRandomArticle", () => {
  it("requests the random-mode endpoint and returns the article", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ title: "Bacteria", html: "<p>hi</p>", isTarget: false }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRandomArticle()).resolves.toEqual({
      title: "Bacteria",
      html: "<p>hi</p>",
      isTarget: false,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/wiki?mode=random");
  });

  it("throws the server's error message on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "boom" }, 500)));
    await expect(fetchRandomArticle()).rejects.toThrow("boom");
  });
});

describe("fetchArticleByTitle", () => {
  it("requests the title-mode endpoint with the title encoded", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ title: "Tuberculosis", html: "<p>TB</p>", isTarget: true }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchArticleByTitle("Mission: Impossible")).resolves.toEqual({
      title: "Tuberculosis",
      html: "<p>TB</p>",
      isTarget: true,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/wiki?title=Mission%3A%20Impossible");
  });

  it("throws a default message when the error body has no error field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 404)));
    await expect(fetchArticleByTitle("Nope")).rejects.toThrow("Failed to load article");
  });
});
