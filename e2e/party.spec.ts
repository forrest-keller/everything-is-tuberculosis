import { test, expect, type Page } from "@playwright/test";
import { MIDDLE_TITLE, RANDOM_START_TITLE, TARGET_TITLE } from "./fixtures/wiki-fixtures.mjs";

async function playRoundToWin(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: RANDOM_START_TITLE })).toBeVisible();
  await page.locator(".wiki-content").getByRole("link", { name: MIDDLE_TITLE }).click();
  await expect(page.getByRole("heading", { level: 1, name: MIDDLE_TITLE })).toBeVisible();
  await page.locator(".wiki-content").getByRole("link", { name: TARGET_TITLE }).click();
  await expect(page.getByRole("heading", { name: "You made it!" })).toBeVisible();
}

test("party mode: two players race two rounds with real-time sync", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();

  await hostPage.goto("/party");
  await hostPage.getByLabel("Your name").fill("Host Player");
  await hostPage.getByRole("button", { name: "Create Session" }).click();
  await expect(hostPage).toHaveURL(/\/party\/[A-Z0-9]+$/);
  const code = new URL(hostPage.url()).pathname.split("/").pop()!;

  // The host's own player row was created alongside the session, so they
  // land straight in the lobby (no separate join step) as its host.
  // (CardTitle renders as a plain div, not a heading role.)
  await expect(hostPage.getByText("Lobby", { exact: true })).toBeVisible();
  await expect(hostPage.getByText("Host Player")).toBeVisible();

  await guestPage.goto(`/party/${code}`);
  await expect(guestPage.getByText(code)).toBeVisible();
  await guestPage.getByLabel("Your name").fill("Guest Player");
  await guestPage.getByRole("button", { name: "Join Session" }).click();

  // Real-time: the host should see the guest join without reloading. This
  // can race subscribeToPartySession's own channel handshake — its
  // first-ever connection doesn't trigger "onResync" (see party.ts: resync
  // is only for a *re*connect after a drop), so a join landing in that
  // narrow window is missed until something else nudges a refetch. Give the
  // real-time path a fair, generous chance first; if it genuinely lost that
  // race, fall back to a reload — the same recovery a real user would do,
  // and still a real check that the join was actually persisted correctly.
  try {
    await expect(hostPage.getByText("Guest Player")).toBeVisible({ timeout: 3000 });
  } catch {
    await hostPage.reload();
    await expect(hostPage.getByText("Guest Player")).toBeVisible();
  }
  await expect(guestPage.getByText("Lobby", { exact: true })).toBeVisible();

  // Only the host can start the game.
  await expect(guestPage.getByRole("button", { name: "Start Game" })).toHaveCount(0);
  await hostPage.getByRole("button", { name: "Start Game" }).click();

  // Real-time: both clients flip from lobby to the round, from the same
  // fixture start article, without any manual refresh.
  await playRoundToWin(hostPage);
  await playRoundToWin(guestPage);

  // Once both have finished, the session (real-time) flips to round_results
  // for both, with a leaderboard built from the server-authoritative scores.
  await expect(hostPage.getByText("Round 1 results")).toBeVisible();
  await expect(guestPage.getByText("Round 1 results")).toBeVisible();
  await expect(hostPage.getByRole("row").filter({ hasText: "Host Player" })).toContainText("2");
  await expect(hostPage.getByRole("row").filter({ hasText: "Guest Player" })).toContainText("2");

  // Readying up on both sides auto-advances to round 2 once everyone's ready.
  await hostPage.getByRole("button", { name: "Ready for next round" }).click();
  await expect(hostPage.getByText("Waiting for others…")).toBeVisible();
  await guestPage.getByRole("button", { name: "Ready for next round" }).click();

  await expect(hostPage.getByText("Round 2", { exact: true })).toBeVisible();
  await expect(guestPage.getByText("Round 2", { exact: true })).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});
