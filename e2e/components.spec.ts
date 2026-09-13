import { test, expect } from "@playwright/test";
import { MIDDLE_TITLE, RANDOM_START_TITLE } from "./fixtures/wiki-fixtures.mjs";

test.describe("HowToPlayDialog", () => {
  test("shows all four rules and closes", async ({ page }) => {
    await page.goto("/solo");
    await expect(page.getByRole("heading", { level: 1, name: RANDOM_START_TITLE })).toBeVisible();

    await page.getByRole("button", { name: "How to play" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "How to play" })).toBeVisible();
    await expect(dialog.getByText("You start somewhere random")).toBeVisible();
    await expect(dialog.getByText("Click your way there")).toBeVisible();
    await expect(dialog.getByText("Only real articles are clickable")).toBeVisible();
    await expect(dialog.getByText("The diagnosis is always the same")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });
});

test.describe("GameHeader", () => {
  test("click count and stopwatch update as the race progresses", async ({ page }) => {
    await page.goto("/solo");
    await expect(page.getByRole("heading", { level: 1, name: RANDOM_START_TITLE })).toBeVisible();

    await expect(page.getByText("0 clicks")).toBeVisible();
    await expect(page.getByText("00:00")).toBeVisible();

    // The stopwatch ticks up on its own once the race starts.
    await expect(page.getByText("00:00")).not.toBeVisible({ timeout: 3000 });

    await page.locator(".wiki-content").getByRole("link", { name: MIDDLE_TITLE }).click();
    await expect(page.getByText("1 click", { exact: true })).toBeVisible();
  });

  test("going home mid-race asks for confirmation before navigating away", async ({ page }) => {
    await page.goto("/solo");
    await expect(page.getByRole("heading", { level: 1, name: RANDOM_START_TITLE })).toBeVisible();

    await page.getByRole("link", { name: "Everything is Tuberculosis" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Leave this game?" })).toBeVisible();
    await expect(page).toHaveURL("/solo");

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL("/solo");

    await page.getByRole("link", { name: "Everything is Tuberculosis" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Leave" }).click();
    await expect(page).toHaveURL("/");
  });

  test("restarting mid-race asks for confirmation before starting over", async ({ page }) => {
    await page.goto("/solo");
    await expect(page.getByRole("heading", { level: 1, name: RANDOM_START_TITLE })).toBeVisible();

    await page.getByRole("button", { name: "Restart" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Restart this game?" })).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: RANDOM_START_TITLE })).toBeVisible();

    await page.getByRole("button", { name: "Restart" }).click();
    await dialog.getByRole("button", { name: "Restart" }).click();
    await expect(dialog).not.toBeVisible();
  });
});

test.describe("ThemeToggle", () => {
  test("switches between light and dark mode", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");

    await expect(html).not.toHaveClass(/dark/);
    await page.getByRole("button", { name: "Toggle dark mode" }).click();
    await expect(html).toHaveClass(/dark/);
    await page.getByRole("button", { name: "Toggle dark mode" }).click();
    await expect(html).not.toHaveClass(/dark/);
  });
});
