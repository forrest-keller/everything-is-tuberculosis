import { test, expect } from "@playwright/test";
import { MIDDLE_TITLE, RANDOM_START_TITLE, TARGET_TITLE } from "./fixtures/wiki-fixtures.mjs";

test("daily challenge: play through to a win and see the leaderboard update", async ({ page }) => {
  await page.goto("/daily");

  await expect(page.getByRole("heading", { name: "Daily Challenge" })).toBeVisible();
  await expect(page.getByText("No results yet")).toBeVisible();

  await page.getByLabel("Your name").fill("Ada Lovelace");
  await page.getByRole("button", { name: "Start Today's Challenge" }).click();

  await expect(page.getByRole("heading", { level: 1, name: RANDOM_START_TITLE })).toBeVisible();

  await page.locator(".wiki-content").getByRole("link", { name: MIDDLE_TITLE }).click();
  await expect(page.getByRole("heading", { level: 1, name: MIDDLE_TITLE })).toBeVisible();

  await page.locator(".wiki-content").getByRole("link", { name: TARGET_TITLE }).click();

  await expect(page.getByRole("heading", { name: "Nice work, Ada Lovelace!" })).toBeVisible();
  await expect(page.getByText(/2 clicks/)).toBeVisible();
  await expect(page.getByText(/rank #1 today/)).toBeVisible();

  // The server-authoritative score is reflected in the shared leaderboard.
  const row = page.getByRole("row").filter({ hasText: "Ada Lovelace" });
  await expect(row).toContainText("2");
  await expect(row).toContainText("(you)");
});

test("daily challenge: a second player sees the same start article and the first player's score", async ({
  browser,
}) => {
  // A fresh browser context = a fresh anonymous player identity (localStorage
  // is per-context), simulating a different person visiting the same day.
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/daily");
  await expect(page.getByRole("cell", { name: "Ada Lovelace" })).toBeVisible();

  await page.getByLabel("Your name").fill("Grace Hopper");
  await page.getByRole("button", { name: "Start Today's Challenge" }).click();

  // Same shared daily challenge → same fixed start article.
  await expect(page.getByRole("heading", { level: 1, name: RANDOM_START_TITLE })).toBeVisible();

  await context.close();
});
