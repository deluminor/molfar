import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 900 } });

type Fixture = Window & { ids: { backlog: string; gate: string }; column: (id: string) => string | undefined };

const ids = (page: Page) => page.evaluate(() => (window as unknown as Fixture).ids);
const column = (page: Page, id: string) => page.evaluate((cardId) => (window as unknown as Fixture).column(cardId), id);
const card = (page: Page, id: string) => page.locator(`[data-card-id="${id}"]`);
const lane = (page: Page, name: string) => page.locator(`section[aria-label^="${name},"]`);

test.beforeEach(async ({ page }) => {
  // Motion makes cards "unstable" for Playwright, which then re-scrolls the board mid-drag.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/tests/browser/task-board.html");
  await expect(page.locator("[data-card-id]")).toHaveCount(2);
});

test("dropping a backlog card on Grill starts it", async ({ page }) => {
  const { backlog } = await ids(page);
  await card(page, backlog).dragTo(lane(page, "Grill"));

  await expect.poll(() => column(page, backlog)).toBe("grill");
  await expect(lane(page, "Grill").locator(`[data-card-id="${backlog}"]`)).toBeVisible();
});

test("an illegal drop leaves the card where it was", async ({ page }) => {
  const { backlog } = await ids(page);
  await card(page, backlog).dragTo(lane(page, "Done"));

  await page.waitForTimeout(200);
  expect(await column(page, backlog)).toBe("backlog");
});

test("dropping a plan card on Grill opens the request-changes form instead of acting", async ({ page }) => {
  const { gate } = await ids(page);
  await card(page, gate).dragTo(lane(page, "Grill"));

  await expect(page.getByRole("complementary", { name: /Card #2/ })).toBeVisible();
  expect(await column(page, gate)).toBe("plan_approval");
});

test("keyboard opens a card and Escape closes it", async ({ page }) => {
  const { backlog } = await ids(page);
  await card(page, backlog).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: /Card #1/ })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary")).toHaveCount(0);
});

test("reduced motion turns card transitions off", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { backlog } = await ids(page);
  const transition = await card(page, backlog).evaluate((element) => getComputedStyle(element).transitionProperty);
  expect(transition).toBe("none");
});

test("the Move to menu offers only legal targets and runs the same action", async ({ page }) => {
  const { backlog } = await ids(page);
  await card(page, backlog).click();
  const menu = page.getByLabel("Move card to");
  await expect(menu.locator("option:not([disabled])")).toHaveText(["Grill"]);

  await menu.selectOption("grill");
  await expect.poll(() => column(page, backlog)).toBe("grill");
});

for (const tab of ["Plan", "Spec", "Task"]) {
  test(`the ${tab} tab scrolls to its end`, async ({ page }) => {
    const { gate } = await ids(page);
    await card(page, gate).click();
    const drawer = page.getByRole("complementary", { name: /Card #2/ });
    await drawer.getByRole("tab", { name: tab }).click();
    const panel = drawer.getByRole("tabpanel");
    await panel.hover();
    for (let step = 0; step < 30; step++) await page.mouse.wheel(0, 600);

    const lastLine = tab === "Task" ? drawer.getByText("Acceptance criteria") : drawer.getByText("Detail line for section 40.");
    await expect(lastLine).toBeInViewport();
  });
}
