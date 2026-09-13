import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WikiArticle } from "./wiki-article";

const html = `
  <p>See <a class="wiki-link" data-title="Bacteria">Bacteria</a>.</p>
  <p><a class="wiki-link-disabled">Disabled</a></p>
  <p><a href="#cite_note-1">footnote</a></p>
  <p>Plain text with no anchor</p>
  <p><a class="wiki-link" id="no-title">No title</a></p>
  <img src="broken.png" alt="broken" />
`;

describe("WikiArticle", () => {
  it("renders the sanitized html and an attribution link to the source article", () => {
    render(<WikiArticle title="Tuberculosis" html={html} onNavigate={vi.fn()} />);
    expect(screen.getByText("Bacteria")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tuberculosis" })).toHaveAttribute(
      "href",
      "https://en.wikipedia.org/wiki/Tuberculosis",
    );
  });

  it("calls onNavigate with the article title when a wiki-link is clicked", () => {
    const onNavigate = vi.fn();
    render(<WikiArticle title="Tuberculosis" html={html} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("Bacteria"));
    expect(onNavigate).toHaveBeenCalledWith("Bacteria");
  });

  it("does not navigate for a disabled link", () => {
    const onNavigate = vi.fn();
    render(<WikiArticle title="Tuberculosis" html={html} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("Disabled"));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("does not navigate for an in-page footnote link", () => {
    const onNavigate = vi.fn();
    render(<WikiArticle title="Tuberculosis" html={html} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("footnote"));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("does not navigate when the click isn't on an anchor", () => {
    const onNavigate = vi.fn();
    render(<WikiArticle title="Tuberculosis" html={html} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("Plain text with no anchor"));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("hides an image that fails to load", () => {
    render(<WikiArticle title="Tuberculosis" html={html} onNavigate={vi.fn()} />);
    const img = screen.getByAltText("broken");
    fireEvent.error(img);
    expect(img.style.display).toBe("none");
  });

  it("ignores an error event from something other than an image", () => {
    render(<WikiArticle title="Tuberculosis" html={html} onNavigate={vi.fn()} />);
    const p = screen.getByText("Bacteria").closest("p")!;
    expect(() => fireEvent.error(p)).not.toThrow();
  });

  it("does not navigate for a wiki-link with no data-title", () => {
    const onNavigate = vi.fn();
    render(<WikiArticle title="Tuberculosis" html={html} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("No title"));
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
