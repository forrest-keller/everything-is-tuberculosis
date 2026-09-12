"use client";

import { useEffect, useRef } from "react";

interface WikiArticleProps {
  html: string;
  onNavigate: (title: string) => void;
}

export function WikiArticle({ html, onNavigate }: WikiArticleProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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
    <div
      ref={containerRef}
      onClick={handleClick}
      className="wiki-content prose prose-neutral dark:prose-invert max-w-none"
      // Content is sanitized server-side in lib/wikipedia.ts before it ever reaches the client.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
