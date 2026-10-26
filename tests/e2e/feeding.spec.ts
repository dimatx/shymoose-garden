import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { auditPlants } from "../../scripts/check-plant-data";
import { feedingProducts, feedingTreatments } from "../../src/data/feeding";
import { getTreatmentCatalog, treatmentUrl, treatmentsForPlant, TREATMENT_TRIGGERS } from "../../src/lib/feeding";
import { plantCareGroup, plantCareTags } from "../../src/lib/plant-care";

const { plants } = auditPlants();
const active = plants.filter((plant) => !plant.data.archived);
const catalog = getTreatmentCatalog(plants, feedingTreatments);
const ids = (items: typeof plants) => items.map((plant) => plant.id).sort();
const visibleIds = (page: Page) => page.locator("[data-feeding-plant]:visible").evaluateAll((rows) =>
  rows.map((row) => row.getAttribute("data-feeding-plant")).sort());
const entry = (id: string) => catalog.find((item) => item.treatment.id === id)!;
const openTreatment = async (page: Page, id: string) => {
  await page.locator(`#${id} > summary`).click();
  await expect(page.locator(`#${id}`)).toHaveAttribute("open", "");
};

test("spring shows shared treatments, with no per-plant essays or source-link wall", async ({ page }) => {
  await page.goto("/feeding/");
  await expect(page.locator("[data-feeding-catalog]")).toHaveAttribute("data-ready", "true");
  const expected = catalog.filter(({ treatment, plants: members }) => members.length && (!treatment.seasons.length || treatment.seasons.includes("spring")));
  expect(await page.locator("[data-treatment]:visible").evaluateAll((items) => items.map((item) => item.id).sort()))
    .toEqual(expected.map((item) => item.treatment.id).sort());
  await expect(page.locator("[data-treatment][open]")).toHaveCount(0);
  await expect(page.locator("[data-treatment-plants]")).toBeHidden();
  await expect(page.locator("[data-feeding-catalog] a:visible")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Leave unfed", exact: true })).toBeVisible();
  const words = (await page.locator("main").innerText()).split(/\s+/).filter(Boolean).length;
  expect(words).toBeLessThan(350);
  expect(await page.locator("main").innerText()).not.toMatch(/\bdefault\b|general baseline/i);
});

test("one treatment exposes timing, trigger and use once, followed by matching catalog cards", async ({ page }) => {
  await page.goto("/feeding/");
  await openTreatment(page, "acid-loving-feed");
  const { treatment, plants: members } = entry("acid-loving-feed");
  const panel = page.locator("#acid-loving-feed");
  await expect.poll(() => visibleIds(page)).toEqual(ids(members));
  await expect(panel.getByText(treatment.when, { exact: true })).toBeVisible();
  await expect(panel.locator("dd").filter({ hasText: TREATMENT_TRIGGERS[treatment.trigger] })).toBeVisible();
  await expect(panel.getByText(treatment.caution, { exact: true })).toBeVisible();
  await expect(page.getByText(treatment.steps[0], { exact: true })).toHaveCount(1);
  await expect(page.getByText(treatment.steps[0], { exact: true })).toBeHidden();
  await panel.getByText("Instructions & sources", { exact: true }).click();
  await expect(page.getByText(treatment.steps[0], { exact: true })).toBeVisible();
  for (const source of treatment.sources) {
    await expect(panel.getByRole("link", { name: source.label, exact: true })).toHaveAttribute("href", source.url);
  }
  for (const plant of members) {
    const card = page.locator(`[data-feeding-plant="${plant.id}"]`);
    for (const tag of plantCareTags(plant.id)) await expect(card.locator("[data-care-labels]")).toContainText(tag);
    await expect(card).not.toContainText(treatment.steps[0]);
    await expect(card).not.toContainText(treatment.caution);
  }
});

test("a fertilizer shows its full reviewed treatment audience, never an assumed evergreen group", async ({ page }) => {
  await page.goto("/feeding/");
  await page.getByRole("button", { name: "By fertilizer", exact: true }).click();
  await expect(page.locator("[data-feeding-empty]")).toContainText("Choose a fertilizer");
  for (const product of feedingProducts) {
    await page.getByRole("combobox", { name: "Fertilizer", exact: true }).selectOption(product.id);
    const matching = catalog.filter((item) => item.treatment.productId === product.id);
    expect(matching).toHaveLength(1);
    await expect(page.locator(`#${matching[0].treatment.id}`)).toHaveAttribute("open", "");
    await expect.poll(() => visibleIds(page)).toEqual(ids(matching[0].plants));
  }
  await page.getByRole("combobox", { name: "Fertilizer", exact: true }).selectOption("holly-tone");
  expect(await visibleIds(page)).toContain("mountain-laurel");
  expect(await visibleIds(page)).toContain("tsuga-canadensis-moon-frost");
  expect(await visibleIds(page)).not.toContain("boxwood");
  expect(await visibleIds(page)).not.toContain("thuja-occidentalis-emerald");
});

test("care categories filter independent acidity and fertility facts and connect to shared actions", async ({ page }) => {
  await page.goto("/feeding/?view=category");
  await page.getByRole("combobox", { name: "Soil fertility", exact: true }).selectOption("lean");
  const lean = active.filter((plant) => plantCareGroup(plant.id).fertility === "lean");
  await expect.poll(() => visibleIds(page)).toEqual(ids(lean));
  expect(await visibleIds(page)).toContain("anacis-verticillata-zagreb");
  expect(await visibleIds(page)).toContain("coreopsis-verticillata-crazy-cayenne");
  await page.getByRole("button", { name: /^Related treatments/ }).click();
  await openTreatment(page, "lean-soil-no-feed");
  await expect.poll(() => visibleIds(page)).toEqual(ids(lean));
  await page.getByRole("button", { name: "All treatments", exact: true }).click();
  await page.getByRole("combobox", { name: "Soil pH", exact: true }).selectOption("acidic");
  const both = lean.filter((plant) => plantCareGroup(plant.id).acidity === "acidic");
  await expect.poll(() => visibleIds(page)).toEqual(ids(both));
  await expect(page.locator("[data-feeding-empty]")).toContainText("No catalog plants match");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect.poll(() => visibleIds(page)).toEqual(ids(active));
});

test("the same care labels work in the main catalog and on a plant page", async ({ page }) => {
  await page.goto("/feeding/?view=category&fertility=lean");
  const expected = await visibleIds(page);
  await page.goto("/?tag=Lean%20soil");
  await expect(page.locator("#plant-grid")).toHaveAttribute("data-ready", "true");
  const mainIds = await page.locator('.plant-item[data-archived="false"]:visible').evaluateAll((items) =>
    items.map((item) => item.querySelector("a")!.getAttribute("href")!.split("/")[2]).sort());
  expect(mainIds).toEqual(expected);
  await page.goto("/plants/anacis-verticillata-zagreb/");
  await expect(page.getByRole("link", { name: "Lean soil", exact: true })).toHaveAttribute("href", "/?tag=Lean%20soil");
  const care = page.locator('[aria-label="Feeding guidance"]');
  await expect(care.getByRole("link", { name: "Leave lean-soil plants unfed", exact: true })).toHaveAttribute("href", treatmentUrl("lean-soil-no-feed"));
  expect((await care.innerText()).split(/\s+/).length).toBeLessThan(35);
});

test("seasonal stages are separate actions, and all-year no-feed groups are not scheduled applications", async ({ page }) => {
  await page.goto("/feeding/");
  await page.getByRole("combobox", { name: "Season", exact: true }).selectOption("summer");
  await expect(page.locator("#tomato-fruit-feed")).toBeVisible();
  await expect(page.locator("#vegetable-bed-nutrition")).toBeHidden();
  await openTreatment(page, "tomato-fruit-feed");
  await expect.poll(() => visibleIds(page)).toEqual(ids(entry("tomato-fruit-feed").plants));
  await page.getByRole("combobox", { name: "Season", exact: true }).selectOption("autumn");
  await expect(page.locator("[data-no-seasonal-applications]")).toBeVisible();
  expect(await page.locator("[data-treatment]:visible").evaluateAll((items) => items.map((item) => item.getAttribute("data-action"))))
    .toEqual(catalog.filter((item) => item.treatment.action === "withhold" && item.plants.length).map(() => "withhold"));
});

test("selection and search survive a plant round trip and recover when a new search no longer matches", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await page.goto("/feeding/?view=product&product=holly-tone&q=laurel");
  await expect.poll(() => visibleIds(page)).toEqual(["mountain-laurel"]);
  await page.locator('[data-feeding-plant="mountain-laurel"] > a').click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Mountain Laurel");
  await page.goBack();
  await expect(page.locator("#acid-loving-feed")).toHaveAttribute("open", "");
  await expect(page.getByRole("searchbox", { name: "Search plants", exact: true })).toHaveValue("laurel");
  await page.reload();
  await expect.poll(() => visibleIds(page)).toEqual(["mountain-laurel"]);
  await page.goto("/feeding/?treatment=acid-loving-feed");
  await page.getByRole("searchbox", { name: "Search plants", exact: true }).fill("tickseed");
  await expect(page.locator("#acid-loving-feed")).toBeHidden();
  await expect(page.locator("#lean-soil-no-feed")).toBeVisible();
  await openTreatment(page, "lean-soil-no-feed");
  await expect.poll(() => visibleIds(page)).toEqual(["anacis-verticillata-zagreb", "coreopsis-verticillata-crazy-cayenne"]);
  expect(errors).toEqual([]);
});

test("unreviewed classifications are visible as gaps, not converted into feeding advice", async ({ page }) => {
  await page.goto("/feeding/?view=category&acidity=unreviewed&fertility=unreviewed&q=parsley");
  await expect.poll(() => visibleIds(page)).toEqual(["parsley"]);
  await expect(page.locator('[data-feeding-plant="parsley"] [data-care-labels]')).toHaveText("Care unclassified");
  await page.getByRole("button", { name: /^Related treatments/ }).click();
  await expect(page.locator("[data-treatment]:visible")).toHaveCount(0);
  await page.getByText("Care classification sources", { exact: true }).click();
  await expect(page.locator("[data-care-source-empty]")).toBeVisible();
});

test("every plant page links to shared treatments without duplicating their instructions", async ({ page }) => {
  const pages = plants.map(({ id, data }) => ({
    id, archived: data.archived, html: readFileSync(path.join("dist", "plants", id, "index.html"), "utf8"),
  }));
  await page.goto("/feeding/");
  const actual = await page.evaluate((pages) => pages.map(({ id, archived, html }) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const section = doc.querySelector('[aria-label="Feeding guidance"]');
    return { id, archived, text: section?.textContent ?? "", links: [...section?.querySelectorAll("a") ?? []].map((link) => link.getAttribute("href")) };
  }), pages);
  for (const row of actual) {
    const plant = plants.find((item) => item.id === row.id)!;
    const shared = treatmentsForPlant(plant, feedingTreatments);
    if (row.archived) expect(row.links).toEqual([]);
    else if (shared.length) expect(row.links).toEqual(shared.map((item) => treatmentUrl(item.id)));
    else {
      expect(row.text).toContain("No treatment recorded");
      expect(row.links).toHaveLength(1);
    }
    for (const item of shared) expect(row.text).not.toContain(item.steps[0]);
  }
});

test("keyboard browsing, narrow screens and catalog photos remain usable", async ({ page }, testInfo) => {
  await page.goto("/feeding/");
  for (const width of [320, 393, 640, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    const first = await page.locator("[data-treatment]:visible").first().boundingBox();
    expect(first!.y).toBeLessThan(700);
  }
  await page.locator("#acid-loving-feed > summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#acid-loving-feed")).toHaveAttribute("open", "");
  await expect(page.locator("[data-treatment][open]")).toHaveCount(1);
  await page.setViewportSize({ width: testInfo.project.name === "mobile" ? 393 : 1280, height: 900 });
  for (const dark of [false, true]) {
    await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
    await expect(page.locator("body")).toHaveCSS("color", dark ? "rgb(241, 248, 241)" : "rgb(13, 32, 16)");
    await page.screenshot({ path: testInfo.outputPath(`treatment-${dark ? "dark" : "light"}.png`), animations: "disabled" });
  }
  await page.goto("/feeding/?view=category&fertility=lean");
  await page.screenshot({ path: testInfo.outputPath("lean-category.png"), animations: "disabled" });
});

test("native shared treatment instructions and catalog cards work without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4322/feeding/");
  await expect(page.locator("[data-feeding-tools]")).toBeHidden();
  await expect(page.locator("[data-feeding-plant]:visible")).toHaveCount(active.length);
  await page.locator("#lean-soil-no-feed > summary").click();
  await page.locator("#lean-soil-no-feed").getByText("Instructions & sources", { exact: true }).click();
  await expect(page.getByText(entry("lean-soil-no-feed").treatment.steps[0], { exact: true })).toBeVisible();
  await page.locator("#lean-soil-no-feed").getByText(/^Plants in this treatment/).click();
  await expect(page.locator("#lean-soil-no-feed").getByRole("link", { name: "Tickseed 'Zagreb'", exact: true })).toBeVisible();
  await context.close();
});
