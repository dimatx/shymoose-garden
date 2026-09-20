import { expect, test } from "@playwright/test";

test("catalog search and sort survive a detail round trip", async ({ page }) => {
  await page.goto("/");
  await page.locator("#plant-search").fill("heuchera");
  await page.locator("#plant-sort summary").click();
  await page.locator('[data-sort="name-desc"]').click();
  const cards = page.locator(".plant-item:visible");
  const before = await cards.evaluateAll((items) => items.map((el) => el.getAttribute("data-name")));
  expect(before.length).toBeGreaterThan(1);
  await cards.first().locator("a").click();
  await expect(page.locator("article")).toBeVisible();
  await page.getByRole("link", { name: "All plants" }).click();
  await expect(page.locator("#plant-search")).toHaveValue("heuchera");
  await expect(page.locator("#plant-sort-label")).toHaveText("Name (Z–A)");
  expect(await cards.evaluateAll((items) => items.map((el) => el.getAttribute("data-name")))).toEqual(before);
});

test("archived row boundary follows the visible sorted DOM order", async ({ page }) => {
  await page.goto("/");
  await page.locator("#plant-sort summary").click();
  await page.locator('[data-sort="name-desc"]').click();
  const archived = page.locator('.plant-item[data-archived="true"]:visible');
  expect(await archived.count()).toBeGreaterThan(0);
  await expect(archived.first()).toHaveAttribute("data-archived-first", "true");
  await expect(page.locator('.plant-item:visible[data-archived-first="true"]')).toHaveCount(1);
});

test("calendar buttons advance one month even after repeat navigation", async ({ page }) => {
  await page.goto("/bloom/");
  for (let visit = 0; visit < 2; visit++) {
    const label = page.locator("[data-cal-range]");
    const before = await label.textContent();
    const firstMonth = () => page.locator(".month-head").evaluateAll((headers) =>
      Number((headers.find((el) => el instanceof HTMLElement && el.style.order === "1") as HTMLElement)?.dataset.month),
    );
    const start = await firstMonth();
    await page.locator('[data-cal-step="1"]').click();
    await expect(label).not.toHaveText(before!);
    expect(await firstMonth()).toBe(start % 12 + 1);
    await page.locator('[data-cal-step="-1"]').click();
    await expect(label).toHaveText(before!);
    if (visit === 0) {
      await page.getByRole("link", { name: "All plants" }).click();
      await page.evaluate(() => {
        const link = document.createElement("a");
        link.href = "/bloom/";
        document.body.append(link);
        link.click();
      });
      await expect(page.locator(".month-calendar")).toBeVisible();
    }
  }
});

test("theme works without storage and survives client navigation", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("Blocked", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("Blocked", "SecurityError"); };
  });
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await page.goto("/");
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.locator(".plant-item").first().locator("a").click();
  await expect(page.locator("article")).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(errors).toEqual([]);
});

test("clipboard failure is visible and toxicity details stay beside their heading", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async () => { throw new DOMException("Blocked", "NotAllowedError"); } },
    });
  });
  await page.goto("/plants/pieris-japonica/");
  await page.locator("#copy-shorturl").click();
  await expect(page.locator("#copy-status")).toContainText("Couldn't copy automatically");
  const summary = page.getByText("View toxicity details", { exact: true });
  await summary.locator("..").click();
  const info = page.locator('details[title="View toxicity details"]');
  await expect(info).toHaveAttribute("open", "");
  const box = await info.boundingBox();
  const heading = await page.getByText("Pet safety", { exact: true }).boundingBox();
  expect(Math.abs(box!.y - heading!.y)).toBeLessThan(20);
});

test("beta map links preserve opt-in and remain hidden by default", async ({ page }) => {
  await page.goto("/plants/dianthus/");
  await expect(page.getByRole("link", { name: "Find on map" })).toHaveCount(0);
  await page.goto("/plants/dianthus/?beta");
  const link = page.getByRole("link", { name: "Find on map" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", /beta/);
  await link.click();
  await expect(page.locator("#garden-map-content")).toBeVisible();
});

test("locked map does not download optional map or scanner libraries", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/map/");
  await expect(page.locator("#garden-map-locked")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(requests.filter((url) => /\/(?:leaflet|jsQR)[^/]*\.js/.test(url))).toEqual([]);
});

test("catalog and plant content remain usable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4322/");
  expect(await page.locator(".plant-item:visible").count()).toBeGreaterThan(100);
  await page.locator(".plant-item a").first().click();
  await expect(page.locator("article h1")).toBeVisible();
  await page.goto("http://127.0.0.1:4322/bloom/");
  await expect(page.locator(".month-head:visible")).toHaveCount(12);
  await context.close();
});
