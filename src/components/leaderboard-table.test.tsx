import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LeaderboardTable, type LeaderboardRow } from "./leaderboard-table";

const rows: LeaderboardRow[] = [
  { id: "1", name: "Alice", clicks: 3, durationMs: 65_000 },
  { id: "2", name: "Bob", clicks: 5, durationMs: 42_000, isSelf: true },
];

describe("LeaderboardTable", () => {
  it("shows the empty message when there are no rows", () => {
    render(<LeaderboardTable rows={[]} />);
    expect(screen.getByText("No results yet — be the first.")).toBeInTheDocument();
  });

  it("shows a custom empty message when provided", () => {
    render(<LeaderboardTable rows={[]} emptyMessage="Nobody yet." />);
    expect(screen.getByText("Nobody yet.")).toBeInTheDocument();
  });

  it("renders one row per entry, ranked and formatted", () => {
    render(<LeaderboardTable rows={rows} />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("01:05")).toBeInTheDocument();
    expect(screen.getByText("00:42")).toBeInTheDocument();

    const rowEls = screen.getAllByRole("row");
    expect(rowEls[1]).toHaveTextContent(/^1/);
    expect(rowEls[2]).toHaveTextContent(/^2/);
  });

  it("marks the current player's row", () => {
    render(<LeaderboardTable rows={rows} />);
    expect(screen.getByText("(you)")).toBeInTheDocument();
  });
});
