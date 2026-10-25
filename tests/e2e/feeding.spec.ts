import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { auditPlants } from "../../scripts/check-plant-data";
import { feedingRecommendations } from "../../src/data/feeding";
import { feedingPlantUrl, getFeedingGuide, getFeedingProductGroups } from "../../src/lib/feeding";

const { plants } = auditPlants();
const guide = getFeedingGuide(plants, feedingRecommendations);
const groups = getFeedingProductGroups(guide.entries);
const visibleIds = (page: Page) => page.locator("[data-feeding-row]:visible").evaluateAll((rows) =>
  rows.map((row) => row.getAttribute("data-plant-id")).sort());
const expectedSeason = (window: string) => guide.entries.filter((entry) => entry.recommendation.window === window)
  .flatMap((entry) => entry.plants.map((plant) => plant.id)).sort();

test("seasonal browsing starts focused with collapsed plant rows, not a document of advice", async ({ page }) => {
  await page.goto("/feeding/");
  await expect(page.getByRole("button", { name: "By season", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => visibleIds(page)).toEqual(expectedSeason("spring"));
  await expect(page.locator("[data-feeding-row][open]")).toHaveCount(0);
  await expect(page.locator("[data-feeding-results] a:visible")).toHaveCount(0);
  await expect(page.locator("[data-feeding-results] img:visible")).toHaveCount(expectedSeason("spring").length);
  await page.getByRole("combobox", { name: "Seasonal window", exact: true }).selectOption("growing");
  await expect.poll(() => visibleIds(page)).toEqual(expectedSeason("growing"));
  await page.getByRole("combobox", { name: "Seasonal window", exact: true }).selectOption("no-routine");
  await expect.poll(() => visibleIds(page)).toEqual(expectedSeason("no-routine"));
  await expect(page.locator("[data-feeding-count]")).toContainText("general baseline");
});

test("a fertilizer shows every reviewed matching plant and no implied blanket application", async ({ page }) => {
  await page.goto("/feeding/");
  await page.getByRole("button", { name: "By fertilizer", exact: true }).click();
  await expect(page.locator("[data-feeding-empty]")).toHaveText("Choose a fertilizer to see its reviewed plant matches.");
  const selector = page.getByRole("combobox", { name: "Fertilizer", exact: true });
  for (const { product, plants: members } of groups) {
    await selector.selectOption(product.id);
    await expect.poll(() => visibleIds(page)).toEqual(members.map(({ plant }) => plant.id).sort());
    await expect(page.locator("[data-feeding-count]")).toHaveText(`${members.length} plants with a reviewed product choice`);
    await expect(page.locator("[data-product-context]")).toContainText("not instructions to feed every plant");
    for (const { plant, recommendation } of members) {
      const row = page.locator(`[data-plant-id="${plant.id}"]`);
      await expect(row.locator("summary").first()).toContainText("Conditional");
      await expect(row.locator("summary").first()).toContainText(recommendation.quickCaution);
    }
  }
  await selector.selectOption("no-product");
  const noProduct = guide.entries.filter((entry) => !entry.recommendation.product).flatMap((entry) => entry.plants.map((plant) => plant.id)).sort();
  await expect.poll(() => visibleIds(page)).toEqual(noProduct);
  await expect(page.locator("[data-product-context]")).toContainText("does not mean they need no fertilizer");
});

test("opening a plant exposes its guidance and keeps sources behind a secondary disclosure", async ({ page }) => {
  await page.goto("/feeding/?view=product&product=holly-tone");
  const laurel = page.locator('[data-plant-id="mountain-laurel"]');
  const recommendation = feedingRecommendations.find((entry) => entry.id === "mountain-laurel")!;
  await laurel.locator("summary").first().click();
  await expect(laurel).toHaveAttribute("open", "");
  await expect(laurel.getByText(recommendation.condition, { exact: true })).toBeVisible();
  await expect(laurel.getByText(recommendation.timing, { exact: true })).toBeVisible();
  await expect(laurel.getByText(recommendation.instructions, { exact: true })).toBeVisible();
  await expect(laurel.getByText(`Caution: ${recommendation.warning}`, { exact: true })).toBeVisible();
  await expect(laurel.locator(`a[href="${recommendation.sources[0].url}"]`)).toBeHidden();
  await laurel.getByText("Sources & review", { exact: true }).click();
  for (const source of recommendation.sources) {
    await expect(laurel.getByRole("link", { name: source.label, exact: true })).toHaveAttribute("href", source.url);
  }
  const other = page.locator('[data-plant-id="pieris-japonica"]');
  await other.locator("summary").first().click();
  await expect(other).toHaveAttribute("open", "");
  await expect(laurel).not.toHaveAttribute("open", "");
  await expect(page.locator("[data-feeding-row][open]")).toHaveCount(1);
});

test("finding a plant searches Latin names and exposes both baseline and missing research honestly", async ({ page }) => {
  await page.goto("/feeding/");
  await page.getByRole("button", { name: "Find a plant", exact: true }).click();
  await expect(page.locator("[data-feeding-empty]")).toContainText("Type a common or Latin name");
  const search = page.getByRole("searchbox", { name: "Find any active plant", exact: true });
  await search.fill("HEUCHERA primo");
  await expect.poll(() => visibleIds(page)).toEqual(["heuchera-primo-black-pearl", "heuchera-primo-pistachio-ambrosia"]);
  const pearl = page.locator('[data-plant-id="heuchera-primo-black-pearl"]');
  await expect(pearl.locator("summary").first()).toContainText("General baseline");
  await search.fill("parsley");
  await expect.poll(() => visibleIds(page)).toEqual(["parsley"]);
  const parsley = page.locator('[data-plant-id="parsley"]');
  await expect(parsley.locator("summary").first()).toContainText("Guidance not yet reviewed");
  await parsley.locator("summary").first().click();
  await expect(parsley.getByText(/That does not mean no fertilizer is needed/)).toBeVisible();
  await search.fill("no-such-plant");
  await expect(page.locator("[data-feeding-empty]")).toContainText("No plants match");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(page.locator("[data-feeding-empty]")).toContainText("Type a common or Latin name");
});

test("product selection, search and open plant survive refresh and a detail round trip", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await page.goto("/feeding/?view=product&product=holly-tone&q=laurel");
  for (let visit = 0; visit < 2; visit++) {
    await expect(page.getByRole("combobox", { name: "Fertilizer", exact: true })).toHaveValue("holly-tone");
    await expect(page.getByRole("searchbox", { name: "Search these plants", exact: true })).toHaveValue("laurel");
    await expect.poll(() => visibleIds(page)).toEqual(["mountain-laurel"]);
    const row = page.locator('[data-plant-id="mountain-laurel"]');
    if (!(await row.evaluate((element) => (element as HTMLDetailsElement).open))) await row.locator("summary").first().click();
    await expect(page).toHaveURL(/plant=mountain-laurel/);
    await row.getByRole("link", { name: "Full plant page" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Mountain Laurel");
    await page.goBack();
    await expect(row).toHaveAttribute("open", "");
    await page.reload();
  }
  expect(errors).toEqual([]);
});

test("plant-specific and legacy recommendation links open the relevant guidance", async ({ page }) => {
  for (const id of ["mountain-laurel", "heuchera-primo-black-pearl", "parsley"]) {
    await page.goto(`/plants/${id}/`);
    await page.getByRole("link", { name: "Open feeding guidance", exact: true }).click();
    const row = page.locator(`[data-plant-id="${id}"]`);
    await expect(row).toHaveAttribute("open", "");
    await expect(row).toBeInViewport();
  }
  await page.goto("/feeding/#azalea-rhododendron");
  await expect(page.locator('[data-recommendation="azalea-rhododendron"][open]')).toHaveCount(1);
});

test("every plant row retains exact evidence, warnings and source links from the curated dataset", async ({ page }) => {
  await page.goto("/feeding/");
  const actual = await page.locator("[data-feeding-row]").evaluateAll((rows) => rows.map((row) => ({
    id: row.getAttribute("data-plant-id"),
    recommendation: row.getAttribute("data-recommendation"),
    evidence: row.getAttribute("data-evidence"),
    text: row.textContent,
    urls: [...row.querySelectorAll("a")].map((link) => link.getAttribute("href")),
  })));
  expect(actual.map((row) => row.id).sort()).toEqual(plants.filter((plant) => !plant.data.archived).map((plant) => plant.id).sort());
  for (const row of actual) {
    const recommendation = feedingRecommendations.find((entry) => entry.plantIds.includes(row.id!));
    expect(row.recommendation).toBe(recommendation?.id ?? null);
    expect(row.evidence).toBe(recommendation?.evidenceScope ?? null);
    if (recommendation) {
      expect(row.text).toContain(recommendation.quickCaution);
      expect(row.text).toContain(recommendation.warning);
      expect(row.text).toContain(recommendation.instructions);
      for (const source of recommendation.sources) expect(row.urls).toContain(source.url);
    } else expect(row.text).toContain("No feeding schedule or product has been reviewed");
  }
  const pages = plants.map(({ id, data }) => ({
    id, archived: data.archived, html: readFileSync(path.join("dist", "plants", id, "index.html"), "utf8"),
  }));
  const links = await page.evaluate((pages) => pages.map(({ id, archived, html }) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return { id, archived, href: doc.querySelector('[aria-label="Feeding guidance"] a')?.getAttribute("href") ?? null };
  }), pages);
  for (const entry of links) expect(entry.href).toBe(entry.archived ? null : feedingPlantUrl(entry.id));
});

test("mobile and desktop controls fit, sources start hidden, and the first plant is immediately reachable", async ({ page }, testInfo) => {
  await page.goto("/feeding/");
  for (const width of [320, 393, 640, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    const first = await page.locator("[data-feeding-row]:visible").first().boundingBox();
    expect(first!.y).toBeLessThan(780);
  }
  await page.setViewportSize({ width: testInfo.project.name === "mobile" ? 393 : 1280, height: 900 });
  for (const dark of [false, true]) {
    await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
    await expect(page.locator("body")).toHaveCSS("color", dark ? "rgb(241, 248, 241)" : "rgb(13, 32, 16)");
    await page.screenshot({ path: testInfo.outputPath(`feeding-app-${dark ? "dark" : "light"}.png`), animations: "disabled" });
  }
  await page.getByRole("button", { name: "By fertilizer", exact: true }).click();
  await page.getByRole("combobox", { name: "Fertilizer", exact: true }).selectOption("holly-tone");
  await page.screenshot({ path: testInfo.outputPath("feeding-product.png"), animations: "disabled" });
});

test("native disclosures and full plant links remain usable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4322/feeding/");
  await expect(page.locator("[data-feeding-tools]")).toBeHidden();
  await expect(page.locator("[data-feeding-row]:visible")).toHaveCount(guide.activeCount);
  const row = page.locator('[data-plant-id="mountain-laurel"]');
  await row.locator("summary").first().click();
  await expect(row.getByText("How to apply", { exact: true })).toBeVisible();
  await row.getByText("Sources & review", { exact: true }).click();
  await expect(row.getByRole("link", { name: "Current Espoma Holly-tone directions", exact: true })).toBeVisible();
  await row.getByRole("link", { name: "Full plant page" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Mountain Laurel");
  await context.close();
});
