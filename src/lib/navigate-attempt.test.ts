import { describe, expect, it, vi } from "vitest";

const { fetchArticle } = vi.hoisted(() => ({ fetchArticle: vi.fn() }));
vi.mock("@/lib/wikipedia", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wikipedia")>();
  return { ...actual, fetchArticle };
});

import { buildNavigationClickResponse, computeNavigationClick } from "./navigate-attempt";

describe("computeNavigationClick", () => {
  it("increments clicks and appends the article title to the path on a non-winning click", async () => {
    fetchArticle.mockResolvedValue({ title: "Next Article", html: "<p/>", isTarget: false });

    const { article, update } = await computeNavigationClick("Next Article", {
      clicks: 2,
      path: ["Bacteria"],
      startedAt: new Date().toISOString(),
    });

    expect(fetchArticle).toHaveBeenCalledWith("Next Article");
    expect(article).toEqual({ title: "Next Article", html: "<p/>", isTarget: false });
    expect(update).toEqual({ clicks: 3, path: ["Bacteria", "Next Article"] });
  });

  it("marks the attempt finished with an elapsed duration when the target is reached", async () => {
    fetchArticle.mockResolvedValue({ title: "Tuberculosis", html: "<p/>", isTarget: true });
    const startedAt = new Date(Date.now() - 1000).toISOString();

    const { update } = await computeNavigationClick("Tuberculosis", {
      clicks: 2,
      path: ["Bacteria"],
      startedAt,
    });

    expect(update.status).toBe("finished");
    expect(update.clicks).toBe(3);
    expect(update.path).toEqual(["Bacteria", "Tuberculosis"]);
    expect(update.duration_ms).toBeGreaterThanOrEqual(1000);
  });

  it("propagates a fetchArticle rejection to the caller", async () => {
    const error = new Error("boom");
    fetchArticle.mockRejectedValue(error);

    await expect(
      computeNavigationClick("X", { clicks: 0, path: [], startedAt: new Date().toISOString() }),
    ).rejects.toBe(error);
  });
});

describe("buildNavigationClickResponse", () => {
  it("omits elapsedMs for a non-winning click", () => {
    const article = { title: "Next Article", html: "<p/>", isTarget: false };

    const response = buildNavigationClickResponse(article, { clicks: 3, duration_ms: 0 });

    expect(response).toEqual({
      title: "Next Article",
      html: "<p/>",
      isTarget: false,
      clicks: 3,
      elapsedMs: undefined,
    });
  });

  it("includes elapsedMs from the post-update row for a winning click", () => {
    const article = { title: "Tuberculosis", html: "<p/>", isTarget: true };

    const response = buildNavigationClickResponse(article, { clicks: 5, duration_ms: 4200 });

    expect(response).toEqual({
      title: "Tuberculosis",
      html: "<p/>",
      isTarget: true,
      clicks: 5,
      elapsedMs: 4200,
    });
  });
});
