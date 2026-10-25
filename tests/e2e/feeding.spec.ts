import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { auditPlants } from "../../scripts/check-plant-data";
import { feedingRecommendations } from "../../src/data/feeding";
import { getFeedingGuide } from "../../src/lib/feeding";

const { plants } = auditPlants();
const guide = getFeedingGuide(plants, feedingRecommendations);

test("feeding guide matches the active collection, sources and visible cautions", async ({ page }) => {
  await page.goto("/feeding/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Feeding guide");
  await expect(page.locator("[data-feeding-entry]")).toHaveCount(guide.entries.length);
  const actual = await page.locator("[data-feeding-entry]").evaluateAll((entries) => entries.map((entry) => ({
    id: entry.id,
    plants: [...entry.querySelectorAll("[data-feeding-plant]")].map((plant) => plant.getAttribute("data-feeding-plant")).sort(),
  })));
  expect(actual).toEqual(guide.entries
    .slice().sort((a, b) => ["spring", "growing", "no-routine"].indexOf(a.recommendation.window) - ["spring", "growing", "no-routine"].indexOf(b.recommendation.window))
    .map(({ recommendation, plants: members }) => ({ id: recommendation.id, plants: members.map((plant) => plant.id).sort() })));
  expect(await page.locator("[data-feeding-missing]").evaluateAll((links) =>
    links.map((link) => link.getAttribute("data-feeding-missing")).sort(),
  )).toEqual(guide.missing.map((plant) => plant.id).sort());
  for (const { recommendation } of guide.entries) {
    const entry = page.locator(`#${recommendation.id}`);
    await expect(entry.getByText(`Caution: ${recommendation.warning}`, { exact: true })).toBeVisible();
    await expect(entry.getByText(recommendation.condition, { exact: true })).toBeVisible();
    await entry.getByText("Instructions, soil & sources", { exact: true }).click();
    await expect(entry.getByText(recommendation.instructions, { exact: true })).toBeVisible();
    for (const source of recommendation.sources) {
      await expect(entry.getByRole("link", { name: source.label, exact: true })).toHaveAttribute("href", source.url);
    }
  }
});

test("product and need filters, empty state and reset work after client navigation", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await page.goto("/plants/mountain-laurel/");
  for (let visit = 0; visit < 2; visit++) {
    await page.getByRole("link", { name: "Feeding timing, instructions & sources", exact: true }).click();
    await expect(page).toHaveURL(/\/feeding\/#mountain-laurel$/);
    await expect(page.locator("#mountain-laurel")).toBeInViewport();
    const product = page.getByRole("combobox", { name: "Preferred product", exact: true });
    const need = page.getByRole("combobox", { name: "Feeding need", exact: true });
    await product.selectOption("holly-tone");
    await expect(page.locator("[data-feeding-entry]:visible")).toHaveCount(3);
    await expect(page.getByRole("link", { name: "No routine feeding", exact: true })).toHaveCount(0);
    await need.selectOption("Not routinely needed");
    await expect(page.locator("[data-feeding-empty]")).toBeVisible();
    await expect(page.locator("[data-feeding-entry]:visible")).toHaveCount(0);
    await page.getByRole("button", { name: "Reset filters" }).click();
    await expect(product).toHaveValue("");
    await expect(need).toHaveValue("");
    await expect(page.locator("[data-feeding-entry]:visible")).toHaveCount(guide.entries.length);
    await expect(page.getByRole("link", { name: "No routine feeding", exact: true })).toBeVisible();
    await page.locator('#mountain-laurel [data-feeding-plant="mountain-laurel"]').click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Mountain Laurel");
  }
  expect(errors).toEqual([]);
});

test("every active detail page links to its recommendation or explicitly reports missing guidance", async ({ page }) => {
  const pages = plants.map(({ id, data }) => ({
    id, archived: data.archived, html: readFileSync(path.join("dist", "plants", id, "index.html"), "utf8"),
  }));
  await page.goto("/feeding/");
  const actual = await page.evaluate((pages) => pages.map(({ id, archived, html }) => {
    const document = new DOMParser().parseFromString(html, "text/html");
    const section = document.querySelector('[aria-label="Feeding guidance"]');
    return { id, archived, links: section ? [...section.querySelectorAll("a")].map((link) => link.getAttribute("href")) : [], text: section?.textContent ?? "" };
  }), pages);
  for (const entry of actual) {
    if (entry.archived) {
      expect(entry.links).toEqual([]);
    } else {
      const matching = feedingRecommendations.filter((recommendation) => recommendation.plantIds.includes(entry.id));
      expect(entry.links).toEqual(matching.length ? matching.map((recommendation) => `/feeding/#${recommendation.id}`) : ["/feeding/#guidance-coverage"]);
      if (!matching.length) expect(entry.text).toContain("not yet reviewed");
    }
  }
});

test("feeding navigation and content fit narrow screens and both themes", async ({ page }, testInfo) => {
  await page.goto("/feeding/");
  for (const width of [320, 640, 768, 1024]) {
    await page.setViewportSize({ width, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    if (width < 1024) {
      await page.getByRole("button", { name: "Open menu", exact: true }).click();
      await expect(page.locator("#nav-menu").getByRole("link", { name: "Feeding guide" })).toBeVisible();
      await page.keyboard.press("Escape");
    } else {
      await expect(page.locator("header").getByRole("link", { name: "Feeding guide" }).first()).toBeVisible();
    }
  }
  await page.setViewportSize({ width: testInfo.project.name === "mobile" ? 393 : 1280, height: 900 });
  for (const dark of [false, true]) {
    await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
    await expect(page.locator("body")).toHaveCSS("color", dark ? "rgb(241, 248, 241)" : "rgb(13, 32, 16)");
    await page.screenshot({ path: testInfo.outputPath(`feeding-${dark ? "dark" : "light"}.png`), animations: "disabled" });
  }
});

test("feeding disclosures and plant links work without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4322/feeding/");
  await expect(page.locator("[data-feeding-filters]")).toBeHidden();
  await expect(page.locator("[data-feeding-entry]:visible")).toHaveCount(guide.entries.length);
  await page.locator("#mountain-laurel").getByText("Instructions, soil & sources", { exact: true }).click();
  await expect(page.locator("#mountain-laurel").getByRole("heading", { name: "How to apply" })).toBeVisible();
  await page.locator('#mountain-laurel [data-feeding-plant="mountain-laurel"]').click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Mountain Laurel");
  await context.close();
});
