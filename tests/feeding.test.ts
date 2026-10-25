import assert from "node:assert/strict";
import { test } from "node:test";
import { auditPlants } from "../scripts/check-plant-data.ts";
import { feedingRecommendations } from "../src/data/feeding.ts";
import {
  FEEDING_NEEDS, FEEDING_WINDOWS, getFeedingGuide,
  recommendationsForPlant, getFeedingProductGroups,
  feedingPlantUrl, matchesFeedingRow, readFeedingFilters, feedingSearchText,
  type FeedingFilters,
} from "../src/lib/feeding.ts";
import { auditFeedingRecommendations } from "../src/lib/feeding-schema.ts";

const { plants } = auditPlants();

test("feeding recommendations reference real plants, complete guidance and current sources", () => {
  const plantIds = new Set(plants.map((plant) => plant.id));
  const ids = new Set<string>();
  const memberships = new Set<string>();
  for (const entry of feedingRecommendations) {
    assert.match(entry.id, /^[a-z][a-z0-9-]+$/);
    assert.ok(!ids.has(entry.id), `Duplicate anchor ${entry.id}`);
    ids.add(entry.id);
    assert.ok(FEEDING_WINDOWS.some((window) => window.id === entry.window));
    assert.ok(FEEDING_NEEDS.includes(entry.need));
    assert.ok(entry.plantIds.length);
    for (const id of entry.plantIds) {
      assert.ok(plantIds.has(id), `Unknown plant ${id}`);
      assert.ok(!memberships.has(id), `Conflicting feeding groups for ${id}`);
      memberships.add(id);
    }
    for (const field of ["title", "timing", "requirement", "condition", "quickCaution", "warning", "instructions", "soil"] as const) {
      assert.ok(entry[field].trim(), `${entry.id}: missing ${field}`);
    }
    assert.match(entry.reviewedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(entry.reviewedOn <= new Date().toISOString().slice(0, 10));
    assert.ok(entry.sources.length);
    for (const source of entry.sources) {
      assert.ok(source.label.trim());
      assert.equal(new URL(source.url).protocol, "https:");
    }
    if (entry.product) {
      assert.ok(entry.product.name && entry.product.note && entry.product.id);
      assert.equal(new URL(entry.product.url).protocol, "https:");
    }
  }
});

test("active plants partition into covered and missing without treating unknown as no-feed", () => {
  const guide = getFeedingGuide(plants, feedingRecommendations);
  const active = plants.filter((plant) => !plant.data.archived);
  const covered = new Set(guide.entries.flatMap((entry) => entry.plants.map((plant) => plant.id)));
  assert.ok(guide.coveredCount > 100);
  assert.equal(guide.coveredCount + guide.missing.length, active.length);
  assert.equal(guide.activeCount, active.length);
  for (const plant of guide.missing) assert.ok(!covered.has(plant.id));
  for (const { plants: members } of guide.entries) {
    assert.ok(members.every((plant) => !plant.data.archived));
  }
  const unknown = { id: "new-unreviewed-plant", data: { name: "New plant" } };
  const withUnknown = getFeedingGuide([...plants, unknown], feedingRecommendations);
  assert.ok(withUnknown.missing.some((plant) => plant.id === unknown.id));
  assert.deepEqual(recommendationsForPlant(unknown.id, feedingRecommendations), []);
});

test("all-archived, empty and unreviewed gardens have honest coverage", () => {
  const archived = plants.map((plant) => ({ ...plant, data: { ...plant.data, archived: true } }));
  assert.deepEqual(getFeedingGuide(archived, feedingRecommendations), {
    entries: [], coveredCount: 0, baselineCount: 0, plantGroupCount: 0, activeCount: 0, missing: [],
  });
  assert.deepEqual(getFeedingGuide([], feedingRecommendations).entries, []);
  assert.equal(getFeedingGuide(plants, []).missing.length, plants.filter((plant) => !plant.data.archived).length);
});

test("coverage separates plant/group guidance from broad baselines", () => {
  const guide = getFeedingGuide(plants, feedingRecommendations);
  assert.ok(guide.baselineCount > guide.plantGroupCount);
  assert.equal(guide.plantGroupCount + guide.baselineCount, guide.coveredCount);
  assert.equal(guide.coveredCount + guide.missing.length, guide.activeCount);
});

test("fertilizer groups contain every explicitly associated active plant exactly once", () => {
  const guide = getFeedingGuide(plants, feedingRecommendations);
  const groups = getFeedingProductGroups(guide.entries);
  assert.deepEqual(groups.map((group) => group.product.id), ["holly-tone", "plant-tone"]);
  for (const { product, plants: members } of groups) {
    const expected = plants.filter((plant) => !plant.data.archived
      && recommendationsForPlant(plant.id, feedingRecommendations).some((entry) => entry.product?.id === product.id));
    assert.deepEqual(members.map(({ plant }) => plant.id).sort(), expected.map((plant) => plant.id).sort());
    assert.equal(new Set(members.map(({ plant }) => plant.id)).size, members.length);
    assert.ok(members.every(({ recommendation }) => recommendation.evidenceScope === "plant-group"));
  }
  assert.deepEqual(getFeedingProductGroups([]), []);
});

test("plant search uses names and Latin names, independent of case, accents and extra spaces", () => {
  const plant = { id: "test-plant", data: { name: "Corál Bells 'Black Pearl'", latinName: "Heuchera Primo" } };
  const row = { search: feedingSearchText(plant), window: "no-routine", reviewed: true };
  const filters: FeedingFilters = { view: "plants", window: "spring", product: "", query: "CORAL   BELLS" };
  assert.ok(matchesFeedingRow(row, filters));
  assert.ok(matchesFeedingRow(row, { ...filters, query: "HEUCHERA primo" }));
  assert.ok(!matchesFeedingRow(row, { ...filters, query: "" }), "Plant lookup starts with a query, not a 146-plant dump");
  assert.ok(!matchesFeedingRow(row, { ...filters, view: "season", query: "" }));
  assert.ok(matchesFeedingRow(row, { ...filters, view: "season", window: "no-routine", query: "" }));
});

test("unreviewed plants are findable but never become product or seasonal prescriptions", () => {
  const row = { search: "parsley petroselinum crispum", reviewed: false };
  const filters: FeedingFilters = { view: "plants", window: "spring", product: "no-product", query: "parsley" };
  assert.ok(matchesFeedingRow(row, filters));
  assert.ok(!matchesFeedingRow(row, { ...filters, view: "product" }));
  assert.ok(!matchesFeedingRow(row, { ...filters, view: "season" }));
  assert.ok(!matchesFeedingRow({ ...row, reviewed: true }, { ...filters, view: "product", product: "" }));
});

test("URL filters restore valid state, normalize unsupported choices and preserve plant links", () => {
  assert.deepEqual(readFeedingFilters(new URLSearchParams(), ["holly-tone"]), {
    view: "season", window: "spring", product: "", query: "",
  });
  assert.deepEqual(readFeedingFilters(new URLSearchParams("view=product&product=holly-tone&q=laurel"), ["holly-tone"]), {
    view: "product", window: "spring", product: "holly-tone", query: "laurel",
  });
  assert.equal(readFeedingFilters(new URLSearchParams("product=holly-tone"), ["holly-tone"]).view, "product");
  const invalid = readFeedingFilters(new URLSearchParams("view=invalid&window=13&product=unreviewed"), ["holly-tone"]);
  assert.equal(invalid.window, "spring");
  assert.equal(invalid.product, "");
  assert.equal(feedingPlantUrl("mountain-laurel"), "/feeding/?plant=mountain-laurel#plant-mountain-laurel");
});

test("build-time feeding audit validates the published dataset", () => {
  assert.deepEqual(auditFeedingRecommendations(plants, feedingRecommendations), []);
});

test("feeding audit rejects incomplete guidance, impossible dates and invalid source URLs", () => {
  const base = feedingRecommendations[0];
  const { reviewedOn, ...undated } = base;
  const { quickCaution, ...noCaution } = base;
  assert.match(auditFeedingRecommendations(plants, [undated]).join("\n"), /reviewedOn/);
  assert.match(auditFeedingRecommendations(plants, [noCaution]).join("\n"), /quickCaution/);
  assert.match(auditFeedingRecommendations(plants, [{ ...base, reviewedOn: "2026-02-31" }]).join("\n"), /real calendar date/);
  assert.match(auditFeedingRecommendations(plants, [{ ...base, reviewedOn: "2099-01-01" }]).join("\n"), /future/);
  assert.match(auditFeedingRecommendations(plants, [{ ...base, sources: [] }]).join("\n"), /sources/);
  assert.match(auditFeedingRecommendations(plants, [{ ...base, sources: [{ label: "Bad URL", url: "javascript:alert(1)" }] }]).join("\n"), /HTTPS/);
  assert.match(auditFeedingRecommendations(plants, [{ ...base, instructions: "TODO research" }]).join("\n"), /Finish/);
});

test("feeding audit prevents bad associations and broad baselines being used as product evidence", () => {
  const base = feedingRecommendations[0];
  assert.ok(base.product);
  const product = base.product;
  assert.match(auditFeedingRecommendations(plants, [{ ...base, plantIds: ["missing-plant"] }]).join("\n"), /unknown plant/);
  assert.match(auditFeedingRecommendations(plants, [base, { ...base, id: "second-recommendation" }]).join("\n"), /already assigned/);
  assert.match(auditFeedingRecommendations(plants, [base, base]).join("\n"), /duplicate recommendation ID/);
  assert.match(auditFeedingRecommendations(plants, [{ ...base, evidenceScope: "general" }]).join("\n"), /baseline cannot establish/);
  assert.match(auditFeedingRecommendations(plants, [{ ...base, window: "no-routine" }]).join("\n"), /must agree/);
  assert.match(auditFeedingRecommendations(plants, [{ ...base, sources: [{ label: "Label only", url: product.url }] }]).join("\n"), /independent horticultural support/);
  const conflicting = { ...base, id: "other-choice", plantIds: ["karen-azelia"], product: { ...product, note: "A conflicting definition" } };
  assert.match(auditFeedingRecommendations(plants, [base, conflicting]).join("\n"), /conflicting definition/);
});

test("mountain laurel and non-acid-loving evergreens retain distinct product choices", () => {
  const [laurel] = recommendationsForPlant("mountain-laurel", feedingRecommendations);
  assert.equal(laurel.product?.id, "holly-tone");
  assert.equal(laurel.need, "Conditional");
  assert.match(laurel.condition, /soil report/);
  assert.match(laurel.soil, /not a substitute/);
  assert.match(laurel.instructions, /No fixed dose/);
  for (const id of ["boxwood", "korean-boxwood", "thuja-occidentalis-emerald"]) {
    const [entry] = recommendationsForPlant(id, feedingRecommendations);
    assert.equal(entry.product?.id, "plant-tone");
    assert.equal(entry.need, "Conditional");
  }
});
