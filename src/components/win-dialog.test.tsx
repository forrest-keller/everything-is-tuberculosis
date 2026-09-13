import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WinDialog } from "./win-dialog";

describe("WinDialog", () => {
  it("shows clicks, time, and the path with a separator between entries", async () => {
    render(
      <WinDialog
        open
        onOpenChange={vi.fn()}
        clicks={1}
        elapsedMs={65_000}
        path={["Start", "Middle", "Tuberculosis"]}
        onPlayAgain={vi.fn()}
      />,
    );

    expect(await screen.findByText("Diagnosis confirmed: it was Tuberculosis")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("click")).toBeInTheDocument();
    expect(screen.getByText("01:05")).toBeInTheDocument();
    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(screen.getByText("Middle")).toBeInTheDocument();
    expect(screen.getByText("Tuberculosis")).toBeInTheDocument();
    expect(screen.getAllByText("→")).toHaveLength(2);
  });

  it("pluralizes clicks and calls onPlayAgain", async () => {
    const onPlayAgain = vi.fn();
    render(
      <WinDialog
        open
        onOpenChange={vi.fn()}
        clicks={3}
        elapsedMs={1000}
        path={["Tuberculosis"]}
        onPlayAgain={onPlayAgain}
      />,
    );

    expect(await screen.findByText("clicks")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    expect(onPlayAgain).toHaveBeenCalled();
  });

  it("links back home", async () => {
    render(
      <WinDialog
        open
        onOpenChange={vi.fn()}
        clicks={1}
        elapsedMs={1000}
        path={["Tuberculosis"]}
        onPlayAgain={vi.fn()}
      />,
    );
    expect(await screen.findByRole("button", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
