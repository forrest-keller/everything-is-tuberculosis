import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupFixtures, clearRedirectCache, insertRedirectCache } from "@/test/db";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

/**
 * Returns each queued response in order, one per `fetch` call — but only for
 * calls to Wikipedia/Wikimedia Enterprise. `@/lib/supabase`'s client also
 * calls the global `fetch` (to reach the real local PostgREST instance for
 * the redirect_cache lookups fetchArticle makes), so those are passed
 * through to the real network instead of consuming the queue.
 */
function queueFetch(...responses: Response[]) {
  const realFetch = globalThis.fetch;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const queue = [...responses];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (supabaseUrl && url.startsWith(supabaseUrl)) return realFetch(input, init);
    const next = queue.shift();
    if (!next) throw new Error(`queueFetch: no more queued responses (called for ${url})`);
    return Promise.resolve(next);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const wmeLoginOk = () =>
  jsonResponse({ access_token: "token-1", refresh_token: "refresh-1", expires_in: 3600 });
const wmeArticle = (name: string, html: string) => jsonResponse([{ name, article_body: { html } }]);

let wikipedia: typeof import("./wikipedia");

beforeEach(async () => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.stubEnv("WIKIMEDIA_ENTERPRISE_USERNAME", "user");
  vi.stubEnv("WIKIMEDIA_ENTERPRISE_PASSWORD", "pass");
  vi.stubEnv("WIKI_USER_AGENT_CONTACT_URL", "https://example.com/test-bot");
  vi.stubEnv("WIKI_USER_AGENT_CONTACT_EMAIL", "test@example.com");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  // Note: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are left as
  // vitest.setup.ts loaded them (pointing at the real local Supabase
  // instance) — unstubAllEnvs only reverts vi.stubEnv calls, not those.
  // fetchArticle's redirect-cache writes are fire-and-forget in production
  // code, so a previous test can leak a row after its own cleanup already
  // ran; clear the table up front so every test starts from known state.
  await clearRedirectCache();
  wikipedia = await import("./wikipedia");
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await cleanupFixtures();
});

describe("fetchArticle", () => {
  it("sanitizes and rewrites article HTML on a direct hit", async () => {
    const rawHtml = `
      <p>See <a rel="mw:WikiLink" href="./Bacteria">Bacteria</a> and
      <a rel="mw:WikiLink" href="./Mission:_Impossible">Mission: Impossible</a>.</p>
      <p><a rel="mw:ExtLink" href="https://example.com">external</a>
      <a href="#cite_note-1">[1]</a></p>
      <p><a rel="mw:WikiLink" class="new" href="./Nonexistent_Page">Nonexistent</a>
      <a rel="mw:WikiLink" href="./Category:Bacteria">Category link</a></p>
      <script>alert('xss')</script>
      <table><tbody><tr><td>Cell</td></tr></tbody></table>
      <img src="//upload.wikimedia.org/thumb.png" style="width:100px" width="100">
    `;
    queueFetch(wmeLoginOk(), wmeArticle("Tuberculosis", rawHtml));

    const article = await wikipedia.fetchArticle("Tuberculosis");

    expect(article.title).toBe("Tuberculosis");
    expect(article.isTarget).toBe(true);
    expect(article.html).not.toContain("<script");
    expect(article.html).not.toContain("alert(");

    // Ordinary wiki link stays clickable.
    expect(article.html).toMatch(/<a[^>]*href="\/wiki\/Bacteria"[^>]*>Bacteria<\/a>/);
    expect(article.html).toMatch(
      /<a[^>]*class="wiki-link"[^>]*data-title="Bacteria"[^>]*>Bacteria<\/a>/,
    );

    // A colon in the title that isn't a namespace prefix is still a real article.
    expect(article.html).toMatch(/data-title="Mission: Impossible"/);
    expect(article.html).toMatch(/<a[^>]*class="wiki-link"[^>]*data-title="Mission: Impossible"/);

    // Non-wiki (external) links are disabled and stripped of href.
    expect(article.html).toMatch(/<a[^>]*class="wiki-link-disabled"[^>]*>external<\/a>/);

    // In-page anchors are left completely alone.
    expect(article.html).toContain('<a href="#cite_note-1">[1]</a>');

    // Redlinks are disabled even though they're real mw:WikiLink anchors
    // (the pre-existing "new" class is preserved alongside the disabled one).
    expect(article.html).toMatch(/<a[^>]*class="new wiki-link-disabled"[^>]*>Nonexistent<\/a>/);

    // Namespaced (non-article) targets are disabled.
    expect(article.html).toMatch(/<a[^>]*class="wiki-link-disabled"[^>]*>Category link<\/a>/);

    // Tables get a scroll wrapper.
    expect(article.html).toContain('<div class="wiki-table-scroll">');

    // Protocol-relative image URLs are fixed, and layout-affecting attrs stripped.
    expect(article.html).toContain('src="https://upload.wikimedia.org/thumb.png"');
    expect(article.html).toContain('loading="lazy"');
    expect(article.html).not.toContain("style=");
    expect(article.html).not.toContain('width="100"');
  });

  it("returns isTarget: false for non-target articles", async () => {
    queueFetch(wmeLoginOk(), wmeArticle("Bacteria", "<p>Not TB</p>"));
    const article = await wikipedia.fetchArticle("Bacteria");
    expect(article.isTarget).toBe(false);
  });

  it("falls back to redirect resolution when Enterprise 404s, then retries with the canonical title", async () => {
    queueFetch(
      wmeLoginOk(),
      new Response(null, { status: 404 }), // Enterprise doesn't know "Consumption (disease)"
      jsonResponse({ query: { pages: [{ title: "Tuberculosis" }] } }), // MediaWiki redirect lookup
      wmeArticle("Tuberculosis", "<p>TB</p>"), // retry against the canonical title succeeds
    );

    const article = await wikipedia.fetchArticle("Consumption (disease)");

    expect(article.title).toBe("Tuberculosis");
    expect(article.isTarget).toBe(true);
  });

  it("throws WikipediaError when the title doesn't exist anywhere", async () => {
    queueFetch(
      wmeLoginOk(),
      new Response(null, { status: 404 }),
      jsonResponse({ query: { pages: [{ title: "Made Up Title", missing: true }] } }),
    );

    await expect(wikipedia.fetchArticle("Made Up Title")).rejects.toThrow(wikipedia.WikipediaError);
  });

  it("throws WikipediaError when the redirect lookup itself errors and nothing is cached", async () => {
    // Distinct from the "doesn't exist anywhere" case above: there the
    // redirect lookup succeeds and reports the page missing. Here the lookup
    // request itself fails outright (e.g. MediaWiki API outage), and with no
    // cached mapping to fall back on there's nothing left to try.
    queueFetch(
      wmeLoginOk(),
      new Response(null, { status: 404 }), // raw title not found directly on Enterprise
      new Response(null, { status: 400 }), // MediaWiki redirect lookup request fails outright
    );

    await expect(wikipedia.fetchArticle("Some Broken Title")).rejects.toThrow(
      wikipedia.WikipediaError,
    );
  });

  it("re-authenticates and retries once on a 401 from Enterprise", async () => {
    queueFetch(
      wmeLoginOk(),
      new Response(null, { status: 401 }),
      jsonResponse({ access_token: "token-2", expires_in: 3600 }), // token refresh
      wmeArticle("Tuberculosis", "<p>TB</p>"),
    );

    const article = await wikipedia.fetchArticle("Tuberculosis");
    expect(article.title).toBe("Tuberculosis");
  });

  it("self-heals a stale cached redirect that no longer resolves on Enterprise", async () => {
    await insertRedirectCache("Some Old Title", "Old Canonical");
    queueFetch(
      wmeLoginOk(),
      new Response(null, { status: 404 }), // raw title miss
      new Response(null, { status: 404 }), // cached canonical title also now misses
      jsonResponse({ query: { pages: [{ title: "Fresh Canonical" }] } }), // live re-resolution
      wmeArticle("Fresh Canonical", "<p>TB</p>"),
    );

    const article = await wikipedia.fetchArticle("Some Old Title");
    expect(article.title).toBe("Fresh Canonical");
  });

  it("throws WikipediaError when Enterprise credentials are missing", async () => {
    vi.unstubAllEnvs();
    await expect(wikipedia.fetchArticle("Tuberculosis")).rejects.toThrow(wikipedia.WikipediaError);
  });
});

describe("fetchRandomTitle", () => {
  it("returns the title from the random-summary endpoint", async () => {
    queueFetch(jsonResponse({ title: "Some Article" }));
    await expect(wikipedia.fetchRandomTitle()).resolves.toBe("Some Article");
  });

  it("throws WikipediaError when no title comes back", async () => {
    queueFetch(jsonResponse({}));
    await expect(wikipedia.fetchRandomTitle()).rejects.toThrow(wikipedia.WikipediaError);
  });

  it("retries on a 5xx before succeeding", async () => {
    queueFetch(
      new Response("server exploded", { status: 503 }),
      jsonResponse({ title: "Recovered Article" }),
    );
    await expect(wikipedia.fetchRandomTitle()).resolves.toBe("Recovered Article");
  }, 10_000);

  it("falls back to a random redirect_cache entry when the random-summary endpoint errors", async () => {
    await insertRedirectCache("Consumption (disease)", "Tuberculosis");
    queueFetch(new Response(null, { status: 404 })); // non-5xx/429, so no retries first
    await expect(wikipedia.fetchRandomTitle()).resolves.toBe("Tuberculosis");
  });

  it("still throws WikipediaError when the endpoint errors and the redirect cache is empty", async () => {
    queueFetch(new Response(null, { status: 404 }));
    await expect(wikipedia.fetchRandomTitle()).rejects.toThrow(wikipedia.WikipediaError);
  });
});

describe("fetchRandomStartArticle", () => {
  it("re-rolls when the random pick is already the target", async () => {
    queueFetch(
      jsonResponse({ title: "Tuberculosis" }),
      wmeLoginOk(),
      wmeArticle("Tuberculosis", "<p>TB</p>"),
      jsonResponse({ title: "Other Article" }),
      wmeArticle("Other Article", "<p>Not TB</p>"),
    );

    const article = await wikipedia.fetchRandomStartArticle();
    expect(article.title).toBe("Other Article");
    expect(article.isTarget).toBe(false);
  });
});
