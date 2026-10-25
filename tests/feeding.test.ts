import assert from "node:assert/strict";
import { test } from "node:test";
import { auditPlants } from "../scripts/check-plant-data.ts";
import { feedingRecommendations } from "../src/data/feeding.ts";
import {
  FEEDING_NEEDS, FEEDING_WINDOWS, feedingAnchor, getFeedingGuide,
  matchesFeedingFilters, recommendationsForPlant,
} from "../src/lib/feeding.ts";

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
    for (const field of ["title", "timing", "requirement", "condition", "warning", "instructions", "soil"] as const) {
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
    entries: [], coveredCount: 0, activeCount: 0, missing: [],
  });
  assert.deepEqual(getFeedingGuide([], feedingRecommendations).entries, []);
  assert.equal(getFeedingGuide(plants, []).missing.length, plants.filter((plant) => !plant.data.archived).length);
});

test("mountain laurel and non-acid-loving evergreens retain distinct product choices", () => {
  const [laurel] = recommendationsForPlant("mountain-laurel", feedingRecommendations);
  assert.equal(laurel.product?.id, "holly-tone");
  assert.equal(laurel.need, "Conditional");
  assert.match(laurel.condition, /soil report/);
  assert.match(laurel.soil, /not a substitute/);
  assert.match(laurel.instructions, /No fixed dose/);
  assert.equal(feedingAnchor(laurel.id), "/feeding/#mountain-laurel");
  for (const id of ["boxwood", "korean-boxwood", "thuja-occidentalis-emerald"]) {
    const [entry] = recommendationsForPlant(id, feedingRecommendations);
    assert.equal(entry.product?.id, "plant-tone");
    assert.equal(entry.need, "Conditional");
  }
});

test("product and need filters intersect, including absent products and empty results", () => {
  const laurel = feedingRecommendations.find((entry) => entry.id === "mountain-laurel")!;
  const grasses = feedingRecommendations.find((entry) => entry.id === "ornamental-grasses")!;
  assert.ok(matchesFeedingFilters(laurel, "", ""));
  assert.ok(matchesFeedingFilters(laurel, "holly-tone", "Conditional"));
  assert.ok(!matchesFeedingFilters(laurel, "plant-tone", "Conditional"));
  assert.ok(!matchesFeedingFilters(laurel, "holly-tone", "Routine"));
  assert.ok(matchesFeedingFilters(grasses, "no-product", "Not routinely needed"));
  assert.ok(!matchesFeedingFilters(laurel, "no-product", ""));
  assert.ok(!matchesFeedingFilters(grasses, "holly-tone", ""));
});
