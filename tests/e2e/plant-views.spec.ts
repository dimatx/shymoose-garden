import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { auditPlants } from "../../scripts/check-plant-data";
import { isMapped, isOnCalendar, petSafetyFacts, plantDisplayTags, plantTags, plantTypes } from "../../src/lib/plant-facets";

const { plants, issues } = auditPlants();
const ids = (entries: typeof plants) => entries.map((plant) => plant.id).sort();
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

test("every catalog entry exposes the same classifications, sunlight and safety as its source", async ({ page }) => {
  expect(issues).toEqual([]);
  await page.goto("/");
  const actual = await page.locator(".plant-item").evaluateAll((items) => items.map((item) => {
    const element = item as HTMLElement;
    const link = element.querySelector("a")!;
    return {
      id: link.getAttribute("href")!.split("/")[2],
      types: JSON.parse(element.dataset.types!),
      sun: element.dataset.sun!.split("|").filter(Boolean),
      tags: element.dataset.tags!.split("|").filter(Boolean),
      archived: element.dataset.archived === "true",
      warning: element.querySelector(".highly-toxic-badge")?.getAttribute("title") ?? null,
    };
  }));
  expect(actual.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
    plants.map(({ id, data }) => ({
      id, types: plantTypes(data), sun: data.sunExposure, tags: plantTags(data),
      archived: data.archived,
      warning: petSafetyFacts(data.care.petSafety).highlyToxic
        ? data.care.petSafety === "Highly toxic to cats" ? "Highly toxic to cats" : "Highly toxic to dogs and cats"
        : null,
    })).sort((a, b) => a.id.localeCompare(b.id)),
  );
});

test("every type, sun and trait filter returns its entire matching collection", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/");
  await expect(page.locator("#plant-grid")).toHaveAttribute("data-ready", "true");
  const visibleIds = () => page.locator(".plant-item:visible").evaluateAll((items) =>
    items.map((item) => item.querySelector("a")!.getAttribute("href")!.split("/")[2]).sort());
  const chips = await page.locator("[data-filter]").evaluateAll((items) =>
    items.map((item) => ({ group: item.getAttribute("data-filter")!, value: item.getAttribute("data-value")! })));
  for (const { group, value } of chips) {
    const chip = page.locator(`[data-filter="${group}"][data-value="${value}"]`);
    const dropdown = chip.locator("xpath=ancestor::details");
    if (!(await dropdown.evaluate((element) => (element as HTMLDetailsElement).open))) {
      await dropdown.locator("summary").click();
    }
    await chip.click();
    const expected = plants.filter(({ data }) => (
      group === "type" ? plantTypes(data) : group === "sun" ? data.sunExposure : plantTags(data)
    ).includes(value));
    await expect.poll(visibleIds, { message: `${group}: ${value}` }).toEqual(ids(expected));
    await chip.click();
    await page.keyboard.press("Escape");
  }
  for (const [group, value] of [
    ["type", "Tree"], ["type", "Conifer"], ["sun", "Full sun"], ["sun", "Part shade"],
    ["trait", "Evergreen"], ["trait", "Drought tolerant"],
  ]) {
    const chip = page.locator(`[data-filter="${group}"][data-value="${value}"]`);
    const dropdown = chip.locator("xpath=ancestor::details");
    if (!(await dropdown.evaluate((element) => (element as HTMLDetailsElement).open))) {
      await dropdown.locator("summary").click();
    }
    await chip.click();
    await page.keyboard.press("Escape");
  }
  const combined = plants.filter(({ data }) =>
    plantTypes(data).some((type) => ["Tree", "Conifer"].includes(type)) &&
    data.sunExposure.some((sun) => ["Full sun", "Part shade"].includes(sun)) &&
    ["Evergreen", "Drought tolerant"].every((tag) => plantTags(data).includes(tag)));
  expect(combined.length).toBeGreaterThan(0);
  await expect.poll(visibleIds).toEqual(ids(combined));
});

test("both calendars contain exactly the scheduled active plants and months", async ({ page }) => {
  for (const [route, field] of [["bloom", "bloomMonths"], ["pruning", "pruneMonths"]] as const) {
    await page.goto(`/${route}/`);
    const actual = await page.locator(".calendar-row").evaluateAll((rows) => rows.map((row) => ({
      id: row.getAttribute("data-url")!.split("/")[2],
      months: row.getAttribute("data-months")!.split(",").map(Number),
    })));
    expect(actual.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      plants.filter(({ data }) => isOnCalendar(data, field))
        .map(({ id, data }) => ({ id, months: data[field] })).sort((a, b) => a.id.localeCompare(b.id)),
    );
  }
});

test("every detail page renders the researched fields, tag links and calendar bars without drift", async ({ page }) => {
  const pages = plants.map(({ id }) => ({
    id, html: readFileSync(path.join("dist", "plants", id, "index.html"), "utf8"),
  }));
  await page.goto("/");
  const actual = await page.evaluate((pages) => pages.map(({ id, html }) => {
    const document = new DOMParser().parseFromString(html, "text/html");
    const article = document.querySelector("article")!;
    return {
      id,
      care: Object.fromEntries(Array.from(article.querySelectorAll("dt")).map((term) => [
        term.textContent!.trim(), term.parentElement!.parentElement!.querySelector("dd")!.textContent!.trim(),
      ])),
      tags: Array.from(article.querySelectorAll('a[href^="/?tag="]')).map((link) => ({
        label: link.textContent!.trim(),
        value: new URL(link.getAttribute("href")!, "https://garden.shymoose.com").searchParams.get("tag"),
      })),
      sources: Array.from(document.querySelectorAll("#pet-safety-popup a")).map((link) => link.getAttribute("href")),
      photoAlt: article.querySelector("figure img")!.getAttribute("alt"),
      mapLink: article.querySelector('a[href^="/map/"]') !== null,
      calendar: Array.from(article.querySelectorAll(".plant-months .grid")).slice(1).map((row) => ({
        names: row.querySelector(".sr-only")!.textContent!.trim(),
        active: Array.from(row.querySelectorAll(".month-cell")).filter((cell) =>
          Array.from(cell.firstElementChild!.classList).some((name) => name.startsWith("bg-")))
          .map((cell) => Number(cell.getAttribute("data-month"))),
      })),
    };
  }), pages);
  for (const { id, data } of plants) {
    const detail = actual.find((entry) => entry.id === id)!;
    expect(detail.care, id).toEqual({
      "Native range": data.nativeRange, "Plant type": plantTypes(data).join(" · "),
      "Mature size": data.care.size, "Bloom": data.care.bloom, "Hardiness": data.care.hardiness,
      ...(data.care.harvest ? { Harvest: data.care.harvest } : {}),
      Sunlight: data.care.sunlight, Water: data.care.water, Soil: data.care.soil,
      "Planting distance": data.care.spacing, Propagation: data.care.propagation,
      Pruning: data.care.pruning, "Pet safety": data.care.petSafety,
    });
    expect(detail.tags, id).toEqual(plantDisplayTags(data).map((tag) => ({ label: tag, value: tag })));
    expect(detail.sources, id).toEqual(data.care.petSafetySources);
    expect(detail.photoAlt, id).toBe(data.photoAlt);
    expect(detail.mapLink, id).toBe(isMapped(data));
    expect(detail.calendar.map(({ names, active }) => ({ names, active })), id).toEqual(
      [data.bloomMonths, data.pruneMonths].filter((values) => values.length).map((values) => ({
        names: values.map((month) => months[month - 1]).join(", "), active: values,
      })),
    );
  }
});

test("the beta map exposes only real active placements with overlapping type memberships", async ({ page }) => {
  await page.goto("/map/?beta");
  const pins = JSON.parse((await page.locator("#garden-map").getAttribute("data-pins"))!);
  expect(pins.map(({ slug, types, x, y }: { slug: string; types: string[]; x: number; y: number }) =>
    ({ id: slug, types, x, y })).sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id))).toEqual(
    plants.filter(({ data }) => isMapped(data)).map(({ id, data }) => ({
      id, types: plantTypes(data), x: data.mapX, y: data.mapY,
    })).sort((a, b) => a.id.localeCompare(b.id)),
  );
  const active = plants.filter(({ data }) => !data.archived).length;
  await expect(page.locator("#map-coverage")).toContainText(`${pins.length} of ${active} active plants`);
  const chips = page.locator("#garden-map-legend [data-type]");
  expect((await chips.evaluateAll((elements) => elements.map((el) => el.getAttribute("data-type")))).sort()).toEqual(
    [...new Set(plants.filter(({ data }) => isMapped(data)).flatMap(({ data }) => plantTypes(data)))].sort(),
  );
});
