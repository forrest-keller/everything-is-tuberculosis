import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HowToPlayDialog } from "./how-to-play-dialog";
import { RULES } from "@/lib/rules";

describe("HowToPlayDialog", () => {
  it("opens on trigger click and lists every rule", async () => {
    render(<HowToPlayDialog />);
    expect(screen.queryByText("How to play")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "How to play" }));

    for (const rule of RULES) {
      expect(await screen.findByText(rule.title)).toBeInTheDocument();
      // One rule's description happens to match the dialog's own subtitle
      // verbatim, so this can legitimately match more than one element.
      expect(screen.getAllByText(rule.description).length).toBeGreaterThan(0);
    }
  });
});
