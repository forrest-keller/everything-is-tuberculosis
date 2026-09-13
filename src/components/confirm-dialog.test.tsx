import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={vi.fn()}
        title="Restart?"
        description="You'll lose progress."
        confirmLabel="Restart"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByText("Restart?")).not.toBeInTheDocument();
  });

  it("shows the title/description and confirms via onConfirm + closes", async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Restart this game?"
        description="You'll lose progress."
        confirmLabel="Restart"
        onConfirm={onConfirm}
      />,
    );

    expect(await screen.findByText("Restart this game?")).toBeInTheDocument();
    expect(screen.getByText("You'll lose progress.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).toHaveBeenCalled();
  });

  it("cancel closes without confirming", async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Leave?"
        description="Progress won't be saved."
        confirmLabel="Leave"
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
