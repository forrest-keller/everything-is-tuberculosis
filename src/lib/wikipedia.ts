import * as cheerio from "cheerio";
import sanitizeHtml from "sanitize-html";
import { getSupabaseServiceClient } from "@/lib/supabase";

// Overridable so Playwright's E2E suite can point this module at a small
// local fixture server instead of the real Wikipedia/Wikimedia Enterprise
// APIs (see e2e/fixture-wiki-server.mjs) — solo/daily/party mode all start
// from a genuinely random real article otherwise, which a browser test can't
// reliably click through to "Tuberculosis". Never set outside of E2E runs.
const WIKI_ORIGIN = process.env.WIKI_ORIGIN_OVERRIDE || "https://en.wikipedia.org";
const TARGET_TITLE = "Tuberculosis";

// Wikimedia Enterprise API: https://enterprise.wikimedia.com/docs/
// Used for article content. It has no random-article or redirect-lookup
// endpoint, so those two operations still go through the free public APIs
// above; only per-title content fetches move to Enterprise.
const WME_AUTH_ORIGIN =
  process.env.WME_AUTH_ORIGIN_OVERRIDE || "https://auth.enterprise.wikimedia.com";
const WME_API_ORIGIN =
  process.env.WME_API_ORIGIN_OVERRIDE || "https://api.enterprise.wikimedia.com";
const WME_PROJECT = "enwiki";

/**
 * Wikipedia namespace prefixes (lowercased). A link whose title starts with
 * one of these followed by ":" is not a main-namespace article, so it must
 * not be clickable in the game.
 */
const NAMESPACE_PREFIXES = new Set([
  "media",
  "special",
  "talk",
  "user",
  "user talk",
  "wikipedia",
  "wikipedia talk",
  "wp",
  "file",
  "file talk",
  "image",
  "image talk",
  "mediawiki",
  "mediawiki talk",
  "template",
  "template talk",
  "help",
  "help talk",
  "category",
  "category talk",
  "portal",
  "portal talk",
  "draft",
  "draft talk",
  "timedtext",
  "timedtext talk",
  "module",
  "module talk",
  "gadget",
  "gadget talk",
  "gadget definition",
  "gadget definition talk",
  "book",
  "book talk",
  "education program",
  "education program talk",
  "topic",
]);

export interface WikiArticle {
  /** Canonical article title, e.g. "Tuberculosis" */
  title: string;
  /** Sanitized, game-ready HTML for the article body */
  html: string;
  /** True if this article's canonical title is the game's target */
  isTarget: boolean;
}

export class WikipediaError extends Error {}

function decodeParsoidTitle(raw: string): string {
  // Strip any fragment, then percent-decode and turn underscores into spaces.
  const withoutFragment = raw.split("#")[0];
  let decoded = withoutFragment;
  try {
    decoded = decodeURIComponent(withoutFragment);
  } catch {
    // leave as-is if it isn't validly encoded
  }
  return decoded.replace(/_/g, " ");
}

function isNamespacedTitle(title: string): boolean {
  const colonIndex = title.indexOf(":");
  if (colonIndex === -1) return false;
  const prefix = title.slice(0, colonIndex).trim().toLowerCase();
  return NAMESPACE_PREFIXES.has(prefix);
}

/** Fix protocol-relative Wikimedia URLs ("//upload.wikimedia.org/...") */
function fixProtocolRelativeUrl(url: string): string {
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

function fixSrcset(srcset: string): string {
  return srcset
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      const spaceIndex = trimmed.indexOf(" ");
      const urlPart = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
      const rest = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex);
      return fixProtocolRelativeUrl(urlPart) + rest;
    })
    .join(", ");
}

function processArticleHtml(rawHtml: string): string {
  const $ = cheerio.load(rawHtml);

  // Drop anything that could inject uncontrolled styling/behavior, or is
  // pure Wikipedia housekeeping clutter we don't want in the game.
  $(
    "script, style, link, base, .mw-editsection, .navbox, .vertical-navbox, " +
      ".navbox-styles, .ambox, .hatnote, .dablink, .rellink, .sistersitebox, " +
      ".metadata, .noprint, table.mbox-small, .mw-empty-elt, .shortdescription, " +
      ".sidebar",
  ).remove();

  $("a").each((_, el) => {
    const anchor = $(el);
    const href = anchor.attr("href");
    if (!href) return;

    // Leave in-page anchors (references, footnotes) alone; they scroll
    // within the article and never leave the game.
    if (href.startsWith("#")) return;

    const rel = anchor.attr("rel") ?? "";
    const relTokens = rel.split(/\s+/);
    const isWikiLink =
      relTokens.includes("mw:WikiLink") && (href.startsWith("./") || href.startsWith("/wiki/"));

    if (!isWikiLink) {
      anchor.addClass("wiki-link-disabled");
      anchor.removeAttr("href");
      return;
    }

    const rawTitle = href.startsWith("./") ? href.slice(2) : href.slice("/wiki/".length);
    const title = decodeParsoidTitle(rawTitle);
    const isRedlink = anchor.hasClass("new");

    if (isNamespacedTitle(title) || isRedlink) {
      anchor.addClass("wiki-link-disabled");
      anchor.removeAttr("href");
      return;
    }

    anchor.addClass("wiki-link");
    anchor.attr("data-title", title);
    anchor.attr("href", `/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  });

  $("img").each((_, el) => {
    const img = $(el);
    const src = img.attr("src");
    if (src) img.attr("src", fixProtocolRelativeUrl(src));
    const srcset = img.attr("srcset");
    if (srcset) img.attr("srcset", fixSrcset(srcset));
    img.removeAttr("style").removeAttr("width").attr("loading", "lazy");
  });

  $("table, td, th, figure, span, div").removeAttr("style");

  // Wikipedia tables can be wider than the game's article column (many
  // columns, long unbroken cell content). Without a scroll container they
  // just bust out of the page instead of scrolling. Infoboxes are excluded
  // here — they get their own dedicated float wrapper below instead, since
  // this plain unfloated wrapper would break their sit-beside-the-text
  // layout (the wrapper would stack below the float instead of beside it).
  $("table").each((_, el) => {
    const table = $(el);
    if (table.hasClass("infobox") || table.parents(".infobox").length > 0) return;
    table.wrap('<div class="wiki-table-scroll"></div>');
  });

  // Infoboxes need their own wrapper too: CSS `overflow` doesn't reliably
  // clip/scroll a <table> element directly in Chromium/WebKit, so capping
  // an over-tall infobox (some run thousands of pixels, e.g. athlete medal
  // records) requires putting float + max-height + overflow on a wrapping
  // div rather than the table itself.
  $("table.infobox").each((_, el) => {
    const table = $(el);
    if (table.parents(".infobox").length > 0) return;
    table.wrap('<div class="infobox-wrap"></div>');
  });

  const bodyHtml = $("body").html() ?? "";

  return sanitizeHtml(bodyHtml, {
    allowedTags: [
      "p",
      "a",
      "span",
      "div",
      "section",
      "b",
      "i",
      "em",
      "strong",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "td",
      "th",
      "img",
      "sup",
      "sub",
      "br",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
      "figure",
      "figcaption",
      "cite",
      "small",
      "abbr",
      "code",
      "pre",
      "dl",
      "dt",
      "dd",
      "hr",
      "caption",
    ],
    allowedAttributes: {
      a: ["href", "class", "data-title", "title", "id"],
      img: ["src", "alt", "srcset", "class", "loading"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
      "*": ["class", "id", "lang", "dir"],
    },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        // Never let sanitize-html emit target="_blank" style takeovers.
        const rest = { ...attribs };
        delete rest.target;
        delete rest.onclick;
        return { tagName, attribs: rest };
      },
    },
  });
}

// Per https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy:
// identify the client, include the word "bot", and give real contact info —
// a generic/anonymous-looking UA can be deprioritized or blocked without notice.
const USER_AGENT =
  "EverythingIsTuberculosisBot/1.0 " +
  "(https://github.com/forrest-keller/everything-is-tuberculosis; forrestblackburnkeller@gmail.com) " +
  "Next.js/16.3.5";

const MAX_RETRY_AFTER_MS = 10_000;

function retryAfterMs(res: Response): number | null {
  const header = res.headers.get("Retry-After");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  const dateMs = Date.parse(header);
  if (Number.isNaN(dateMs)) return null;
  return Math.min(Math.max(dateMs - Date.now(), 0), MAX_RETRY_AFTER_MS);
}

async function fetchWithRetry(url: string, init: RequestInit = {}, retries = 2): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      redirect: "follow",
      ...init,
      headers: { "User-Agent": USER_AGENT, ...init.headers },
    });
    const shouldRetry = (res.status === 429 || res.status >= 500) && attempt < retries;
    if (!shouldRetry) return res;
    const delay = (res.status === 429 && retryAfterMs(res)) || 400 * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithRetry(url, init);
  if (!res.ok) {
    throw new WikipediaError(`Wikipedia API request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchRandomTitle(): Promise<string> {
  const data = await fetchJson<{ title?: string }>(
    `${WIKI_ORIGIN}/api/rest_v1/page/random/summary`,
  );
  if (!data.title) {
    throw new WikipediaError("Wikipedia did not return a random article title");
  }
  return data.title;
}

/**
 * A title clicked in-article may be a redirect (e.g. "Consumption
 * (disease)" -> "Tuberculosis"). Wikimedia Enterprise looks articles up by
 * their own name and doesn't resolve redirects, so this falls back to the
 * free MediaWiki API to find the canonical title before retrying it there.
 */
async function resolveRedirectTitle(title: string): Promise<string | null> {
  const url = `${WIKI_ORIGIN}/w/api.php?action=query&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(
    title,
  )}`;
  const data = await fetchJson<{
    query: { pages: { title: string; missing?: boolean }[] };
  }>(url);
  const page = data.query.pages[0];
  if (!page || page.missing) return null;
  return page.title;
}

// Redirect targets rarely change, but they aren't permanent (disambiguation
// cleanup, page moves/retargets), so a cache entry still needs a ceiling on
// how long it's trusted without checking upstream again.
const REDIRECT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface RedirectCacheRow {
  canonical_title: string;
  resolved_at: string;
}

/**
 * Cache reads/writes are a pure optimization on top of resolveRedirectTitle,
 * never load-bearing: any Supabase hiccup here should fall back to the live
 * public API rather than break article loading.
 */
async function getCachedRedirect(rawTitle: string): Promise<string | null> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("redirect_cache")
      .select("canonical_title, resolved_at")
      .eq("raw_title", rawTitle)
      .maybeSingle<RedirectCacheRow>();
    if (error || !data) return null;
    const age = Date.now() - new Date(data.resolved_at).getTime();
    if (age > REDIRECT_CACHE_TTL_MS) return null;
    return data.canonical_title;
  } catch (err) {
    console.error("[wikipedia] redirect cache read failed:", err);
    return null;
  }
}

async function putCachedRedirect(rawTitle: string, canonicalTitle: string): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("redirect_cache").upsert({
      raw_title: rawTitle,
      canonical_title: canonicalTitle,
      resolved_at: new Date().toISOString(),
    });
    if (error) console.error("[wikipedia] redirect cache write failed:", error.message);
  } catch (err) {
    console.error("[wikipedia] redirect cache write failed:", err);
  }
}

async function invalidateCachedRedirect(rawTitle: string): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    await supabase.from("redirect_cache").delete().eq("raw_title", rawTitle);
  } catch (err) {
    console.error("[wikipedia] redirect cache invalidation failed:", err);
  }
}

interface ResolvedRedirect {
  canonicalTitle: string;
  /** Whether this came from the cache (unverified) vs. a live lookup just now. */
  fromCache: boolean;
}

/**
 * Cache-first wrapper around resolveRedirectTitle. A cache hit is trusted
 * for content purposes too (see the self-healing check in fetchArticle):
 * fromCache just tells the caller whether it's still worth re-checking
 * upstream if the cached title turns out not to resolve after all.
 */
async function resolveCanonicalTitle(title: string): Promise<ResolvedRedirect | null> {
  const cached = await getCachedRedirect(title);
  if (cached) return { canonicalTitle: cached, fromCache: true };

  const resolved = await resolveRedirectTitle(title);
  if (!resolved) return null;
  void putCachedRedirect(title, resolved);
  return { canonicalTitle: resolved, fromCache: false };
}

interface WmeTokenState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

let wmeTokenState: WmeTokenState | null = null;
let wmeLoginPromise: Promise<WmeTokenState> | null = null;

function wmeCredentials(): { username: string; password: string } {
  const username = process.env.WIKIMEDIA_ENTERPRISE_USERNAME;
  const password = process.env.WIKIMEDIA_ENTERPRISE_PASSWORD;
  if (!username || !password) {
    throw new WikipediaError(
      "Wikimedia Enterprise credentials are not configured (WIKIMEDIA_ENTERPRISE_USERNAME / WIKIMEDIA_ENTERPRISE_PASSWORD)",
    );
  }
  return { username, password };
}

async function wmeLogin(): Promise<WmeTokenState> {
  const { username, password } = wmeCredentials();
  const res = await fetch(`${WME_AUTH_ORIGIN}/v1/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new WikipediaError(`Wikimedia Enterprise login failed (${res.status})`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function wmeRefresh(state: WmeTokenState): Promise<WmeTokenState> {
  const { username } = wmeCredentials();
  const res = await fetch(`${WME_AUTH_ORIGIN}/v1/token-refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, refresh_token: state.refreshToken }),
  });
  if (!res.ok) return wmeLogin();
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    refreshToken: state.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

const WME_TOKEN_EXPIRY_BUFFER_MS = 30_000;

async function wmeGetAccessToken(forceRefresh = false): Promise<string> {
  if (
    !forceRefresh &&
    wmeTokenState &&
    wmeTokenState.expiresAt - WME_TOKEN_EXPIRY_BUFFER_MS > Date.now()
  ) {
    return wmeTokenState.accessToken;
  }
  if (!wmeLoginPromise) {
    const current = wmeTokenState;
    wmeLoginPromise = (forceRefresh || !current ? wmeLogin() : wmeRefresh(current)).finally(() => {
      wmeLoginPromise = null;
    });
  }
  wmeTokenState = await wmeLoginPromise;
  return wmeTokenState.accessToken;
}

interface WmeArticle {
  name: string;
  article_body?: { html?: string };
}

async function wmeFetchArticle(title: string, retryOn401 = true): Promise<WmeArticle[]> {
  const accessToken = await wmeGetAccessToken();
  const encodedTitle = encodeURIComponent(title.replace(/ /g, "_"));
  const res = await fetchWithRetry(`${WME_API_ORIGIN}/v2/articles/${encodedTitle}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      filters: [{ field: "is_part_of.identifier", value: WME_PROJECT }],
      fields: ["name", "article_body"],
      limit: 1,
    }),
  });

  if (res.status === 401 && retryOn401) {
    await wmeGetAccessToken(true);
    return wmeFetchArticle(title, false);
  }
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new WikipediaError(`Wikimedia Enterprise request failed (${res.status})`);
  }
  return res.json() as Promise<WmeArticle[]>;
}

/**
 * Picks a random article and fetches it, retrying if it turns out to be the
 * target. Checked against the *canonical* (redirect-resolved) article rather
 * than the raw random-pick title, since a title like "Consumption (disease)"
 * can redirect straight to Tuberculosis without ever matching a literal
 * string check — that would otherwise start a game already "won".
 */
export async function fetchRandomStartArticle(): Promise<WikiArticle> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const title = await fetchRandomTitle();
    const article = await fetchArticle(title);
    if (!article.isTarget) return article;
  }
  throw new WikipediaError("Could not find a suitable random starting article");
}

export async function fetchArticle(title: string): Promise<WikiArticle> {
  let results = await wmeFetchArticle(title);
  let canonicalTitle = title;

  if (results.length === 0) {
    const resolved = await resolveCanonicalTitle(title);
    if (!resolved) {
      throw new WikipediaError(`Could not load "${title}" from Wikipedia (404)`);
    }
    canonicalTitle = resolved.canonicalTitle;
    results = await wmeFetchArticle(canonicalTitle);

    // A cached mapping's target came back empty from Enterprise — either
    // Enterprise never had it, or (the case that matters here) the redirect
    // was retargeted/renamed upstream since we cached it. Only a *fresh*
    // lookup distinguishes those, so re-resolve live once before concluding
    // 404; a live lookup that already failed this way is a genuine miss.
    if (results.length === 0 && resolved.fromCache) {
      await invalidateCachedRedirect(title);
      const fresh = await resolveRedirectTitle(title);
      if (fresh) {
        canonicalTitle = fresh;
        results = await wmeFetchArticle(canonicalTitle);
        if (results.length > 0) void putCachedRedirect(title, fresh);
      }
    }

    if (results.length === 0) {
      throw new WikipediaError(`Could not load "${canonicalTitle}" from Wikipedia (404)`);
    }
  } else {
    canonicalTitle = results[0].name;
  }

  const rawHtml = results[0].article_body?.html ?? "";
  const html = processArticleHtml(rawHtml);

  return {
    title: canonicalTitle,
    html,
    isTarget: canonicalTitle.trim().toLowerCase() === TARGET_TITLE.toLowerCase(),
  };
}

export { TARGET_TITLE };
