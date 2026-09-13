import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameHeader } from "./game-header";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

afterEach(() => {
  push.mockClear();
});

describe("GameHeader", () => {
  it("shows the click count (singular/plural) and formatted duration", () => {
    const { rerender } = render(
      <GameHeader clicks={1} elapsedMs={5_000} isRunning onRestart={vi.fn()} />,
    );
    expect(screen.getByText(/1 click$/)).toBeInTheDocument();
    expect(screen.getByText("00:05")).toBeInTheDocument();

    rerender(<GameHeader clicks={2} elapsedMs={5_000} isRunning onRestart={vi.fn()} />);
    expect(screen.getByText(/2 clicks$/)).toBeInTheDocument();
  });

  it("restarts immediately when not running", () => {
    const onRestart = vi.fn();
    render(<GameHeader clicks={0} elapsedMs={0} isRunning={false} onRestart={onRestart} />);
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(onRestart).toHaveBeenCalled();
  });

  it("confirms before restarting while running", async () => {
    const onRestart = vi.fn();
    render(<GameHeader clicks={0} elapsedMs={0} isRunning onRestart={onRestart} />);
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(onRestart).not.toHaveBeenCalled();

    expect(await screen.findByText("Restart this game?")).toBeInTheDocument();
    const restartButtons = screen.getAllByRole("button", { name: "Restart" });
    fireEvent.click(restartButtons[restartButtons.length - 1]);
    expect(onRestart).toHaveBeenCalled();
  });

  it("navigating the wordmark while running asks for confirmation instead of leaving immediately", async () => {
    render(<GameHeader clicks={0} elapsedMs={0} isRunning onRestart={vi.fn()} />);
    fireEvent.click(screen.getByRole("link", { name: "Everything is Tuberculosis" }));
    expect(await screen.findByText("Leave this game?")).toBeInTheDocument();
  });

  it("lets the wordmark navigate normally when not running", () => {
    render(<GameHeader clicks={0} elapsedMs={0} isRunning={false} onRestart={vi.fn()} />);
    fireEvent.click(screen.getByRole("link", { name: "Everything is Tuberculosis" }));
    expect(screen.queryByText("Leave this game?")).not.toBeInTheDocument();
  });

  it("lets a modified click on the wordmark through without confirming", () => {
    render(<GameHeader clicks={0} elapsedMs={0} isRunning onRestart={vi.fn()} />);
    fireEvent.click(screen.getByRole("link", { name: "Everything is Tuberculosis" }), {
      metaKey: true,
    });
    expect(screen.queryByText("Leave this game?")).not.toBeInTheDocument();
  });

  it("confirming leave navigates home", async () => {
    render(<GameHeader clicks={0} elapsedMs={0} isRunning onRestart={vi.fn()} />);
    fireEvent.click(screen.getByRole("link", { name: "Everything is Tuberculosis" }));
    expect(await screen.findByText("Leave this game?")).toBeInTheDocument();

    const dialogs = screen.getAllByRole("button", { name: "Leave" });
    fireEvent.click(dialogs[dialogs.length - 1]);
    expect(push).toHaveBeenCalledWith("/");
  });
});
