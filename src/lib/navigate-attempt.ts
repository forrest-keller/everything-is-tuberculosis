import { fetchArticle, type WikiArticle } from "@/lib/wikipedia";

/**
 * The subset of an in-progress attempt row (party_round_results or
 * daily_scores — the two tables share this shape) needed to compute the
 * next click. Callers own the actual row fetch, since the two tables differ
 * in every other column and where-clause.
 */
export interface InProgressAttempt {
  clicks: number;
  path: string[];
  startedAt: string;
}

/** The DB patch for a click, shared verbatim by both attempt tables. */
export interface NavigationClickPatch {
  clicks: number;
  path: string[];
  status?: "finished";
  duration_ms?: number;
}

export interface NavigationClickResult {
  article: WikiArticle;
  update: NavigationClickPatch;
}

/**
 * Fetches the clicked article and computes the resulting clicks/path/status
 * patch. Does not touch the database: callers apply `update` with their own
 * `.update(...).eq(...)` (different table and where-clause per attempt kind)
 * and must read the post-update row back for the response — see
 * buildNavigationClickResponse — rather than using the values computed here,
 * so a concurrent click on the same attempt can't be double-counted.
 */
export async function computeNavigationClick(
  title: string,
  attempt: InProgressAttempt,
): Promise<NavigationClickResult> {
  const article = await fetchArticle(title);
  const clicks = attempt.clicks + 1;
  const path = [...attempt.path, article.title];

  const update: NavigationClickPatch = article.isTarget
    ? {
        clicks,
        path,
        status: "finished",
        duration_ms: Date.now() - new Date(attempt.startedAt).getTime(),
      }
    : { clicks, path };

  return { article, update };
}

/** The row shape read back from each table's post-`.update()` `.select()`. */
export interface UpdatedNavigationRow {
  clicks: number;
  duration_ms: number;
}

/**
 * Builds the navigate response from the article and the post-update row.
 * `updated` must come from the `.select()` that follows the caller's
 * `.update()` (the race-safe, authoritative values), not from the
 * pre-update attempt or the clicks/path computed above.
 */
export function buildNavigationClickResponse(article: WikiArticle, updated: UpdatedNavigationRow) {
  return {
    title: article.title,
    html: article.html,
    isTarget: article.isTarget,
    clicks: updated.clicks,
    elapsedMs: article.isTarget ? updated.duration_ms : undefined,
  };
}
