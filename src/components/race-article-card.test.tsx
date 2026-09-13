import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RaceArticleCard } from "./race-article-card";

describe("RaceArticleCard", () => {
  it("shows skeletons while loading", () => {
    const { container } = render(
      <RaceArticleCard
        race={{ status: "loading", title: "", html: "", errorMessage: null }}
        onNavigate={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it("shows the error state with a retry button", () => {
    const onRetry = vi.fn();
    render(
      <RaceArticleCard
        race={{ status: "error", title: "", html: "", errorMessage: "Network error" }}
        onNavigate={vi.fn()}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText("Couldn't load the article")).toBeInTheDocument();
    expect(screen.getByText("Network error")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("renders the article and forwards navigation clicks", () => {
    const onNavigate = vi.fn();
    render(
      <RaceArticleCard
        race={{
          status: "playing",
          title: "Bacteria",
          html: '<p><a class="wiki-link" data-title="Fungus">Fungus</a></p>',
          errorMessage: null,
        }}
        onNavigate={onNavigate}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Bacteria" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Fungus"));
    expect(onNavigate).toHaveBeenCalledWith("Fungus");
  });

  it("shows a loading overlay while navigating and an inline error banner", () => {
    render(
      <RaceArticleCard
        race={{
          status: "navigating",
          title: "Bacteria",
          html: "<p>content</p>",
          errorMessage: "That page doesn't exist",
        }}
        onNavigate={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("Loading next article…")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load that page")).toBeInTheDocument();
    expect(screen.getByText("That page doesn't exist")).toBeInTheDocument();
  });
});
