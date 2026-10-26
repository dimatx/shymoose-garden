import { expect, test, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { auditPlants } from "../../scripts/check-plant-data";
import { feedingProducts, feedingTreatments } from "../../src/data/feeding";
import { FEEDING_SAFETY, getTreatmentCatalog, plantNutritionCare, treatmentUrl, TREATMENT_TRIGGERS } from "../../src/lib/feeding";
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
  await expect(panel.locator("[data-treatment-caution]")).toHaveCount(0);
  await expect(page.getByText(treatment.steps[0], { exact: true })).toHaveCount(1);
  await expect(page.getByText(treatment.steps[0], { exact: true })).toBeHidden();
  await panel.getByText("Application instructions", { exact: true }).click();
  await expect(page.getByText(treatment.steps[0], { exact: true })).toBeVisible();
  await expect(panel.locator("a")).toHaveCount(0);
  for (const plant of members) {
    const card = page.locator(`[data-feeding-plant="${plant.id}"]`);
    for (const tag of plantCareTags(plant.id)) await expect(card.locator("[data-care-labels]")).toContainText(tag);
    await expect(card).not.toContainText(treatment.steps[0]);
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
  const care = page.locator('[data-care-section] [data-care-field="Fertilizer"]');
  await expect(care).toContainText("No routine fertilizer in lean soil.");
  await expect(care.locator("a")).toHaveCount(0);
  await expect(page.locator('[aria-label="Feeding guidance"]')).toHaveCount(0);
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

test("incomplete research stays internal without being converted into feeding advice", async ({ page }) => {
  await page.goto("/feeding/?view=category&q=parsley");
  await expect.poll(() => visibleIds(page)).toEqual(["parsley"]);
  await expect(page.locator('[data-feeding-plant="parsley"] [data-care-labels]')).toHaveCount(0);
  await expect(page.locator('option[value="unreviewed"]')).toHaveCount(0);
  await page.getByRole("button", { name: /^Related treatments/ }).click();
  await expect(page.locator("[data-treatment]:visible")).toHaveCount(0);
  expect(await page.locator("main").innerText()).not.toMatch(/unreviewed|unclassified|sources/i);
});

test("every plant page projects the shared nutrition data directly into its existing Care grid", async ({ page }) => {
  const pages = plants.map(({ id }) => ({ id, html: readFileSync(path.join("dist", "plants", id, "index.html"), "utf8") }));
  await page.goto("/feeding/");
  const actual = await page.evaluate((pages) => pages.map(({ id, html }) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const care = doc.querySelector("[data-care-section]");
    const fertilizer = care?.querySelector('[data-care-field="Fertilizer"]');
    const mulch = care?.querySelector('[data-care-field="Mulching"]');
    const applications = (element: Element | null | undefined) => [...element?.querySelectorAll("[data-care-application]") ?? []].map((item) => ({
      treatmentId: item.getAttribute("data-care-application"),
      use: item.querySelector("[data-care-use]")!.textContent!.trim(),
      when: item.querySelector("[data-care-when]")!.textContent!.trim(),
      condition: item.querySelector("[data-care-condition]")?.textContent?.trim() ?? null,
      steps: [...item.querySelectorAll("[data-care-steps] > li")].map((step) => step.textContent!.trim()),
      notes: [...item.querySelectorAll("[data-care-note]")].map((note) => note.textContent!.trim()),
      caution: item.querySelector("[data-care-caution]")?.textContent?.trim() ?? null,
    }));
    return {
      id,
      oldSection: Boolean(doc.querySelector('[aria-label="Feeding guidance"]')),
      fertilizer: fertilizer ? { text: fertilizer.querySelector("dd")!.textContent!.trim(), applications: applications(fertilizer), links: fertilizer.querySelectorAll("a").length } : null,
      mulch: mulch ? applications(mulch) : null,
    };
  }), pages);
  for (const row of actual) {
    const plant = plants.find((item) => item.id === row.id)!;
    const care = plantNutritionCare(plant, feedingTreatments, feedingProducts);
    expect(row.oldSection, row.id).toBe(false);
    if (!care.fertilizer) expect(row.fertilizer, row.id).toBeNull();
    else {
      expect(row.fertilizer!.links, row.id).toBe(0);
      if (care.fertilizer.kind === "withhold") {
        expect(row.fertilizer!.text, row.id).toBe(care.fertilizer.summary);
        expect(row.fertilizer!.applications, row.id).toEqual([]);
      } else {
        expect(row.fertilizer!.applications, row.id).toEqual(care.fertilizer.applications.map((item) => ({ ...item, condition: item.condition ?? null, caution: item.caution ?? null })));
      }
    }
    expect(row.mulch, row.id).toEqual(care.mulch.length ? care.mulch.map((item) => ({ ...item, condition: item.condition ?? null, caution: item.caution ?? null })) : null);
  }
});

test("fertilizer is self-contained care information rather than a section of guide links", async ({ page }) => {
  await page.goto("/plants/mountain-laurel/#care");
  const care = page.locator("[data-care-section]");
  const fertilizer = care.locator('[data-care-field="Fertilizer"]');
  await expect(fertilizer.getByText("Espoma Holly-tone", { exact: true })).toBeVisible();
  await expect(fertilizer.locator("[data-care-when]")).toHaveText("Late winter to early spring");
  await expect(fertilizer.locator("[data-care-condition]")).toContainText("Only if a soil test");
  await expect(fertilizer.getByText(FEEDING_SAFETY, { exact: true })).toBeVisible();
  await expect(fertilizer.locator("a")).toHaveCount(0);
  await expect(page.locator('[aria-label="Feeding guidance"]')).toHaveCount(0);
  await fertilizer.getByText("How to apply", { exact: true }).click();
  await expect(fertilizer.getByText(entry("acid-loving-feed").treatment.steps[0], { exact: true })).toBeVisible();
  await expect(fertilizer.locator('a[href^="https://"], time')).toHaveCount(0);
  await page.goto("/feeding/?view=product&product=holly-tone");
  await expect.poll(() => visibleIds(page)).toEqual(ids(entry("acid-loving-feed").plants));
});

test("care fields retain timing exceptions, no-feed guidance, mulch and distinct crop stages", async ({ page }) => {
  await page.goto("/plants/karen-azelia/#care");
  await expect(page.locator('[data-care-field="Fertilizer"] [data-care-when]')).toHaveText("At the first hint of bloom color");
  await page.goto("/plants/astilbe-chinensis-visions/#care");
  await expect(page.locator('[data-care-field="Fertilizer"] dd')).toHaveText("No routine fertilizer in rich, moist soil.");
  await expect(page.locator('[data-care-field="Mulching"] [data-care-use]')).toHaveText("Leaf mould or finished garden compost");
  await expect(page.locator('[data-care-field="Mulching"] [data-care-when]')).toHaveText("Spring, on moist soil");
  await page.goto("/plants/solanum-lycopersicum-carbon/#care");
  const applications = page.locator('[data-care-field="Fertilizer"] [data-care-application]');
  await expect(applications).toHaveCount(2);
  await expect(applications.nth(0).locator("[data-care-when]")).toHaveText("Before planting into warm soil");
  await expect(applications.nth(1).locator("[data-care-when]")).toHaveText("When the first fruits enlarge");
});

test("integrated nutrition cards fit the existing Care layout on phones and desktops", async ({ page }, testInfo) => {
  await page.goto("/plants/mountain-laurel/#care");
  for (const width of [320, 393, 640, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('[data-care-field="Fertilizer"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  }
  await page.setViewportSize({ width: testInfo.project.name === "mobile" ? 393 : 1280, height: 900 });
  await page.locator("[data-care-section]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("integrated-care.png"), animations: "disabled" });
  await page.goto("/plants/astilbe-chinensis-visions/#care");
  await page.locator("[data-care-section]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("integrated-mulch.png"), animations: "disabled" });
});

test("integrated care remains available without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4322/plants/mountain-laurel/#care");
  const fertilizer = page.locator('[data-care-field="Fertilizer"]');
  await expect(fertilizer.getByText("Espoma Holly-tone", { exact: true })).toBeVisible();
  await fertilizer.getByText("How to apply", { exact: true }).click();
  await expect(fertilizer.getByText(entry("acid-loving-feed").treatment.steps[0], { exact: true })).toBeVisible();
  await context.close();
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
  await expect(page.locator("#lean-soil-no-feed").getByText("Application instructions", { exact: true })).toHaveCount(0);
  await expect(page.locator("#lean-soil-no-feed dd").filter({ hasText: "No fertilizer" })).toBeVisible();
  await page.locator("#lean-soil-no-feed").getByText(/^Plants in this treatment/).click();
  await expect(page.locator("#lean-soil-no-feed").getByRole("link", { name: "Tickseed 'Zagreb'", exact: true })).toBeVisible();
  await context.close();
});

test("public treatment pages omit editorial asides and research metadata, including in closed disclosures", async ({ page }) => {
  await page.goto("/feeding/");
  const html = await page.content();
  for (const { treatment } of catalog) {
    for (const source of treatment.sources) expect(html).not.toContain(source.url);
  }
  await expect(page.locator("main time")).toHaveCount(0);
  await expect(page.locator('main a[href^="https://"]')).toHaveCount(0);
  await expect(page.getByText("Care classification sources", { exact: true })).toHaveCount(0);
  for (const { treatment } of catalog) {
    await page.goto(treatmentUrl(treatment.id));
    expect(await page.locator("main").innerText()).not.toMatch(/dry soil is a watering|flower-color treatments are separate|unreviewed|unclassified|reviewed \d|instructions & sources|care classification sources/i);
    if (treatment.action === "withhold") {
      await expect(page.locator(`#${treatment.id}`).getByText("Application instructions", { exact: true })).toHaveCount(0);
      await expect(page.locator(`#${treatment.id} [data-treatment-caution]`)).toHaveCount(0);
    }
  }
});

test("browser bundles do not ship the internal care bibliography or review records", () => {
  const files = readdirSync(path.join("dist", "_astro")).filter((file) => file.endsWith(".js"));
  for (const file of files) {
    const script = readFileSync(path.join("dist", "_astro", file), "utf8");
    expect(script, file).not.toMatch(/plants\.ces\.ncsu\.edu|extension\.(?:umd|umn)\.edu|rhs\.org\.uk|reviewedOn/);
  }
});

test("retired research-status filters do not leak labels or hide the garden", async ({ page }) => {
  await page.goto("/?tag=Care%20unclassified");
  await expect(page.locator("#plant-grid")).toHaveAttribute("data-ready", "true");
  await expect(page.locator(".plant-item:visible")).toHaveCount(plants.length);
  await expect(page.locator("#active-tag-bar")).toBeHidden();
  expect(new URL(page.url()).searchParams.has("tag")).toBe(false);
  await expect(page.locator('[data-filter="trait"][data-value="Care unclassified"]')).toHaveCount(0);
});
