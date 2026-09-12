export interface WikiArticleResponse {
  title: string;
  html: string;
  isTarget: boolean;
}

interface WikiErrorResponse {
  error: string;
}

async function handleResponse(res: Response): Promise<WikiArticleResponse> {
  const data = (await res.json()) as WikiArticleResponse | WikiErrorResponse;
  if (!res.ok || "error" in data) {
    throw new Error("error" in data ? data.error : "Failed to load article");
  }
  return data;
}

export async function fetchRandomArticle(): Promise<WikiArticleResponse> {
  const res = await fetch("/api/wiki?mode=random");
  return handleResponse(res);
}

export async function fetchArticleByTitle(title: string): Promise<WikiArticleResponse> {
  const res = await fetch(`/api/wiki?title=${encodeURIComponent(title)}`);
  return handleResponse(res);
}
