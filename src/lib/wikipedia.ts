import * as cheerio from "cheerio";
import sanitizeHtml from "sanitize-html";

const WIKI_ORIGIN = "https://en.wikipedia.org";
const TARGET_TITLE = "Tuberculosis";

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
      ".sidebar"
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
      relTokens.includes("mw:WikiLink") &&
      (href.startsWith("./") || href.startsWith("/wiki/"));

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
      "p", "a", "span", "div", "section", "b", "i", "em", "strong", "u", "s",
      "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "td", "th",
      "img", "sup", "sub", "br", "h1", "h2", "h3", "h4", "h5", "h6",
      "blockquote", "figure", "figcaption", "cite", "small", "abbr", "code",
      "pre", "dl", "dt", "dd", "hr", "caption",
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

const USER_AGENT = "EverythingIsTuberculosisGame/1.0 (Next.js hobby project)";

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT },
    });
    const shouldRetry = (res.status === 429 || res.status >= 500) && attempt < retries;
    if (!shouldRetry) return res;
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new WikipediaError(`Wikipedia API request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchRandomTitle(): Promise<string> {
  const data = await fetchJson<{ title?: string }>(
    `${WIKI_ORIGIN}/api/rest_v1/page/random/summary`
  );
  if (!data.title) {
    throw new WikipediaError("Wikipedia did not return a random article title");
  }
  return data.title;
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
  const encodedTitle = encodeURIComponent(title.replace(/ /g, "_"));
  const url = `${WIKI_ORIGIN}/api/rest_v1/page/html/${encodedTitle}`;
  const res = await fetchWithRetry(url);

  if (!res.ok) {
    throw new WikipediaError(`Could not load "${title}" from Wikipedia (${res.status})`);
  }

  let canonicalTitle = title;
  try {
    const finalUrl = new URL(res.url);
    const marker = "/page/html/";
    const idx = finalUrl.pathname.indexOf(marker);
    if (idx !== -1) {
      const rawTitle = finalUrl.pathname.slice(idx + marker.length);
      canonicalTitle = decodeParsoidTitle(rawTitle);
    }
  } catch {
    // fall back to the requested title if the response URL is unusable
  }

  const rawHtml = await res.text();
  const html = processArticleHtml(rawHtml);

  return {
    title: canonicalTitle,
    html,
    isTarget: canonicalTitle.trim().toLowerCase() === TARGET_TITLE.toLowerCase(),
  };
}

export { TARGET_TITLE };
