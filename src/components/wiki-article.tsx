"use client";

import { useEffect, useRef } from "react";

interface WikiArticleProps {
  title: string;
  html: string;
  onNavigate: (title: string) => void;
}

/** Canonical Wikipedia URL for a given article title, for CC BY-SA attribution. */
function wikipediaArticleUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

export function WikiArticle({ title, html, onNavigate }: WikiArticleProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Land the reader at the top of the new article instead of wherever they
  // were scrolled to on the last one.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [title]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // <img> "error" events don't bubble, so listen in the capture phase to
    // hide broken images (e.g. interactive-map placeholders with no JS map
    // renderer) instead of showing a broken-image icon.
    function handleImageError(event: Event) {
      const target = event.target;
      if (target instanceof HTMLImageElement) {
        target.style.display = "none";
      }
    }

    container.addEventListener("error", handleImageError, true);
    return () => container.removeEventListener("error", handleImageError, true);
  }, [html]);

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor || !containerRef.current?.contains(anchor)) return;

    const href = anchor.getAttribute("href") ?? "";
    if (href.startsWith("#")) return; // let in-page footnote links scroll normally

    event.preventDefault();

    if (anchor.classList.contains("wiki-link")) {
      const title = anchor.dataset.title;
      if (title) onNavigate(title);
    }
  }

  return (
    <div>
      <div
        ref={containerRef}
        onClick={handleClick}
        className="wiki-content prose prose-neutral dark:prose-invert max-w-none"
        // Content is sanitized server-side in lib/wikipedia.ts before it ever reaches the client.
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {/* CC BY-SA 4.0 requires attribution + a link back to the source article. */}
      <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
        Adapted from the Wikipedia article{" "}
        <a
          href={wikipediaArticleUrl(title)}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {title}
        </a>
        , available under the{" "}
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          CC BY-SA 4.0
        </a>{" "}
        license.
      </p>
    </div>
  );
}
