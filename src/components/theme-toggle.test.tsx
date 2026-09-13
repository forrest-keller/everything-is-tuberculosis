import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { describe, expect, it } from "vitest";
import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  it("toggles from light to dark on click", async () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <ThemeToggle />
      </ThemeProvider>,
    );

    const button = screen.getByRole("button", { name: "Toggle dark mode" });
    fireEvent.click(button);

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
  });

  it("toggles from dark to light on click", async () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <ThemeToggle />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle dark mode" }));

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(false));
  });
});
