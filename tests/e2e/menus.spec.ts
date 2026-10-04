import { expect, test, type Page } from "@playwright/test";

const WIDTHS = [320, 360, 390, 412, 600, 640, 768, 1024, 1280];
const MARGIN = 0.5;

async function expectInsideViewport(page: Page, selector: string, label: string) {
  const box = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize()!;
  expect(box, `${label} should be rendered`).not.toBeNull();
  expect(box!.x, `${label} left edge`).toBeGreaterThanOrEqual(-MARGIN);
  expect(box!.x + box!.width, `${label} right edge`).toBeLessThanOrEqual(viewport.width + MARGIN);
  expect(box!.y, `${label} top edge`).toBeGreaterThanOrEqual(-MARGIN);
}

async function expectNoHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} should not scroll horizontally`).toBeLessThanOrEqual(0);
}

for (const width of WIDTHS) {
  test(`filter and sort menus stay inside a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expectNoHorizontalScroll(page, "home");

    const triggers = page.locator("details.filter-dd");
    const count = await triggers.count();
    expect(count).toBe(4);

    for (let i = 0; i < count; i++) {
      const details = triggers.nth(i);
      const label = (await details.locator("summary").innerText()).trim().split("\n")[0];
      await details.locator("summary").click();
      await expect(details).toHaveAttribute("open", "");
      const panel = details.locator(".filter-panel");
      await expect(panel).toBeVisible();

      const box = await panel.boundingBox();
      const viewport = page.viewportSize()!;
      expect(box!.x, `${label} panel left edge at ${width}px`).toBeGreaterThanOrEqual(-MARGIN);
      expect(box!.x + box!.width, `${label} panel right edge at ${width}px`).toBeLessThanOrEqual(
        viewport.width + MARGIN,
      );
      await expectNoHorizontalScroll(page, `${label} menu at ${width}px`);

      const chips = await panel.locator(".filter-chip").evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { text: el.textContent?.trim(), left: r.left, right: r.right };
        }),
      );
      for (const chip of chips) {
        expect(chip.left, `"${chip.text}" left edge at ${width}px`).toBeGreaterThanOrEqual(-MARGIN);
        expect(chip.right, `"${chip.text}" right edge at ${width}px`).toBeLessThanOrEqual(
          viewport.width + MARGIN,
        );
      }

      await page.keyboard.press("Escape");
      await expect(details).not.toHaveAttribute("open", "");
    }
  });
}

test("filter menu stays inside the viewport when the page is scrolled and the row wraps", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, 120));
  const traits = page.locator("details.filter-dd").nth(3);
  await traits.locator("summary").click();
  const box = await traits.locator(".filter-panel").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(-MARGIN);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320 + MARGIN);
  await expectNoHorizontalScroll(page, "scrolled traits menu");
});

test("opening one filter menu closes the previous one", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");
  const dropdownsLocator = page.locator("details.filter-dd");
  await dropdownsLocator.nth(1).locator("summary").click();
  await expect(dropdownsLocator.nth(1)).toHaveAttribute("open", "");
  await dropdownsLocator.nth(2).locator("summary").click();
  await expect(dropdownsLocator.nth(1)).not.toHaveAttribute("open", "");
  await expect(dropdownsLocator.nth(2)).toHaveAttribute("open", "");
});

for (const width of [320, 390, 640]) {
  test(`navigation menu stays inside a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const button = page.locator("#nav-menu-button");
    if (!(await button.isVisible())) return;
    await button.click();
    await expect(page.locator("#nav-menu")).toBeVisible();
    await expectInsideViewport(page, "#nav-menu", `nav menu at ${width}px`);
    await expectNoHorizontalScroll(page, "nav menu");
  });
}

for (const width of [320, 360, 390, 412, 768, 1280]) {
  test(`pet safety popup stays inside a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/plants/pieris-japonica/");
    const toggle = page.getByRole("button", { name: "View toxicity details" });
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click();
    await expect(page.locator("#pet-safety-popup")).toBeVisible();
    const box = await page.locator("#pet-safety-popup").boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x, `popup left edge at ${width}px`).toBeGreaterThanOrEqual(8 - MARGIN);
    expect(box!.x + box!.width, `popup right edge at ${width}px`).toBeLessThanOrEqual(
      viewport.width - 8 + MARGIN,
    );
    expect(box!.y, `popup top edge at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height, `popup bottom edge at ${width}px`).toBeLessThanOrEqual(
      viewport.height + MARGIN,
    );
    await expectNoHorizontalScroll(page, "pet safety popup");
  });
}
