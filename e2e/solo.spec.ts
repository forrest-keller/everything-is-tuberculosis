import { test, expect } from "@playwright/test";
import { MIDDLE_TITLE, RANDOM_START_TITLE, TARGET_TITLE } from "./fixtures/wiki-fixtures.mjs";

test("solo mode: click through the fixture link graph to a win", async ({ page }) => {
  await page.goto("/");
  // The landing page's mode cards are base-ui Buttons rendered as <a> tags
  // (for client-side navigation) but keep role="button" for a11y purposes.
  await page.getByRole("button", { name: "Play Solo" }).click();
  await expect(page).toHaveURL(/\/solo$/);

  await expect(page.getByRole("heading", { level: 1, name: RANDOM_START_TITLE })).toBeVisible();

  // Non-article links are rendered but must not be clickable in the game —
  // processArticleHtml strips their href entirely, so (correctly) they no
  // longer even expose an accessible "link" role.
  const article = page.locator(".wiki-content");
  const disabledLinks = article.locator("a.wiki-link-disabled");
  await expect(disabledLinks).toHaveCount(3); // external, redlink, category
  await expect(disabledLinks.filter({ hasText: "an external reference" })).not.toHaveAttribute(
    "href",
    /.+/
  );

  await article.getByRole("link", { name: MIDDLE_TITLE }).click();
  await expect(page.getByRole("heading", { level: 1, name: MIDDLE_TITLE })).toBeVisible();

  await page.locator(".wiki-content").getByRole("link", { name: TARGET_TITLE }).click();

  await expect(page.getByRole("heading", { name: "Diagnosis confirmed: it was Tuberculosis" })).toBeVisible();
  await expect(page.getByText("2", { exact: true }).first()).toBeVisible(); // click count
  await expect(page.getByText(RANDOM_START_TITLE)).toBeVisible(); // path badge
  await expect(page.getByText(MIDDLE_TITLE)).toBeVisible();
  await expect(page.getByText(TARGET_TITLE).last()).toBeVisible();
});

test("solo mode: restart loads a fresh attempt", async ({ page }) => {
  await page.goto("/solo");
  await expect(page.getByRole("heading", { level: 1, name: RANDOM_START_TITLE })).toBeVisible();

  await page.locator(".wiki-content").getByRole("link", { name: MIDDLE_TITLE }).click();
  await expect(page.getByRole("heading", { level: 1, name: MIDDLE_TITLE })).toBeVisible();
  await expect(page.getByText("1 click")).toBeVisible();

  await page.getByRole("button", { name: "Restart" }).click();

  await expect(page.getByRole("heading", { level: 1, name: RANDOM_START_TITLE })).toBeVisible();
  await expect(page.getByText("0 clicks")).toBeVisible();
});
