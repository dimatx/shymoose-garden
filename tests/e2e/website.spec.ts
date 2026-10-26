import { expect, test } from "@playwright/test";

test("plant body links use readable theme colors", async ({ page }) => {
  await page.goto("/plants/metasequoia-glyptostroboides-miss-grace/");
  const link = page.locator(".prose-garden a").first();
  for (const dark of [false, true]) {
    await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
    await expect(link).toHaveCSS("color", dark ? "rgb(143, 201, 143)" : "rgb(47, 112, 53)");
    await expect(link).toHaveCSS("text-decoration-line", "underline");
    const contrast = await link.evaluate((element, isDark) => {
      const luminance = (channels: number[]) => {
        const linear = channels.map((value) => {
          const s = value / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
      };
      const foreground = luminance(getComputedStyle(element).color.match(/\d+/g)!.map(Number));
      const token = getComputedStyle(document.documentElement)
        .getPropertyValue(isDark ? "--color-leaf-900" : "--color-leaf-100").trim();
      const background = luminance(token.slice(1).match(/../g)!.map((value) => parseInt(value, 16)));
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    }, dark);
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  }
});

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
    await expect(page.locator(".month-calendar")).toHaveAttribute("data-ready", "true");
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
      await expect(page.locator("#plant-grid")).toHaveAttribute("data-ready", "true");
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
  const toggle = page.getByRole("button", { name: "View toxicity details" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const popup = page.locator("#pet-safety-popup");
  await expect(popup).toBeVisible();
  const box = await toggle.boundingBox();
  const heading = await page.getByText("Pet safety", { exact: true }).boundingBox();
  expect(Math.abs(box!.y - heading!.y)).toBeLessThan(20);
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});

test("beta map links preserve opt-in and remain hidden by default", async ({ page }) => {
  await page.goto("/plants/cucumis-sativus-suyo-long/");
  await expect(page.getByRole("link", { name: "Find on map" })).toHaveCount(0);
  await page.goto("/plants/dianthus/?beta");
  await expect(page.getByRole("link", { name: "Find on map" })).toHaveCount(0);
  await page.goto("/plants/cucumis-sativus-suyo-long/?beta");
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
