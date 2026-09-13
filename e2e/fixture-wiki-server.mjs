// A minimal stand-in for the real Wikipedia REST API + Wikimedia Enterprise
// API (see src/lib/wikipedia.ts), serving the fixed link graph from
// fixtures/wiki-fixtures.mjs. The app's server-side code is pointed at this
// instead of the real APIs via WIKI_ORIGIN_OVERRIDE / WME_*_ORIGIN_OVERRIDE
// (see playwright.config.ts) so E2E runs are fast, deterministic, and don't
// need real Wikimedia Enterprise credentials.
import { createServer } from "node:http";
import { ARTICLES, RANDOM_START_TITLE } from "./fixtures/wiki-fixtures.mjs";

const PORT = Number(process.env.FIXTURE_WIKI_PORT || 4310);

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

function drainBody(req) {
  return new Promise((resolve) => {
    req.on("data", () => {});
    req.on("end", resolve);
  });
}

/** Parsoid-style hrefs are `./Title_With_Underscores`, percent-encoded. */
function pathToTitle(pathname, prefix) {
  return decodeURIComponent(pathname.slice(prefix.length)).replace(/_/g, " ");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname === "/__health") {
    return sendJson(res, 200, { ok: true });
  }

  // Public Wikipedia REST API: random article summary.
  if (url.pathname === "/api/rest_v1/page/random/summary") {
    return sendJson(res, 200, { title: RANDOM_START_TITLE });
  }

  // Public MediaWiki API: redirect resolution. No fixture title is ever a
  // redirect, so this just confirms whether a title is known.
  if (url.pathname === "/w/api.php") {
    const title = url.searchParams.get("titles") ?? "";
    const known = Object.prototype.hasOwnProperty.call(ARTICLES, title);
    return sendJson(res, 200, { query: { pages: [known ? { title } : { title, missing: true }] } });
  }

  // Wikimedia Enterprise auth — token contents don't matter, nothing here
  // ever validates them.
  if (
    req.method === "POST" &&
    (url.pathname === "/v1/login" || url.pathname === "/v1/token-refresh")
  ) {
    await drainBody(req);
    return sendJson(res, 200, {
      access_token: "fixture-token",
      refresh_token: "fixture-refresh",
      expires_in: 3600,
    });
  }

  // Wikimedia Enterprise article content.
  if (req.method === "POST" && url.pathname.startsWith("/v2/articles/")) {
    await drainBody(req);
    const title = pathToTitle(url.pathname, "/v2/articles/");
    const article = ARTICLES[title];
    if (!article) return sendJson(res, 404, undefined);
    return sendJson(res, 200, [{ name: article.name, article_body: { html: article.html } }]);
  }

  sendJson(res, 404, { error: "not found in fixture server", path: url.pathname });
});

server.listen(PORT, () => {
  console.log(`[fixture-wiki-server] listening on http://127.0.0.1:${PORT}`);
});
