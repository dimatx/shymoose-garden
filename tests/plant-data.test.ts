import assert from "node:assert/strict";
import { test } from "node:test";
import { auditPlants } from "../scripts/check-plant-data.ts";
import { plantMetadataSchema } from "../src/lib/plant-schema.ts";
import { DERIVED_TAGS, isMapped, isOnCalendar, matchesAny, petSafetyFacts, plantDisplayTags, plantTags, plantTypes } from "../src/lib/plant-facets.ts";

const { plants, issues } = auditPlants();
const find = (id: string) => {
  const plant = plants.find((plant) => plant.id === id);
  assert.ok(plant, `Missing audited plant ${id}`);
  return plant.data;
};

test("every published plant satisfies the shared data contract", () => {
  assert.deepEqual(issues, []);
  assert.ok(plants.length >= 148, "Audit must cover the entire collection");
  for (const { data } of plants) {
    assert.equal(data.tags.some((tag) => (DERIVED_TAGS as readonly string[]).includes(tag)), false);
  }
});

test("tree-form conifers, dwarf shrubs, and deciduous conifers have independent facets", () => {
  for (const id of ["hollywood-juniper", "larch", "hinoki-cypress-filicoides", "picea-pungens-pendula", "pinus-densiflora-golden-ghost", "pinus-strobus-angel-falls", "thuja-occidentalis-emerald", "metasequoia-glyptostroboides-miss-grace", "sciadopitys-verticillata-joe-kozey", "tsuga-canadensis-golden-splendor"]) {
    const data = find(id);
    assert.ok(plantTypes(data).includes("Tree"), id);
    assert.ok(plantTypes(data).includes("Conifer"), id);
  }
  for (const id of ["pinus-mugo-pumilio", "siberian-cypress", "picea-pungens-glauca-globosa", "cryptomeria", "tsuga-canadensis-moon-frost"]) {
    assert.ok(plantTypes(find(id)).includes("Shrub"), id);
    assert.equal(plantTypes(find(id)).includes("Tree"), false, id);
  }
  for (const id of ["larch", "metasequoia-glyptostroboides-miss-grace"]) {
    assert.ok(plantTags(find(id), id).includes("Deciduous"));
    assert.equal(plantTags(find(id), id).includes("Evergreen"), false);
  }
});

test("grass-like irises are not grasses, and all true ornamental grasses are classified", () => {
  for (const id of ["calamagrostis-x-acutiflora-karl-foerster", "festuca-glauca-elijah-blue", "schizachyrium-scoparium-carousel"]) {
    assert.ok(plantTypes(find(id)).includes("Ornamental grass"), id);
  }
  assert.equal(plantTypes(find("blue-eyed-grass")).includes("Ornamental grass"), false);
});

test("sun filters use explicit exposure, never positive or negative phrases in prose", () => {
  assert.deepEqual(find("acer-palmatum-bihou").sunExposure, ["Full sun", "Part shade"]);
  assert.deepEqual(find("astilbe-chinensis-visions").sunExposure, ["Part shade", "Full shade"]);
  assert.deepEqual(find("taxus-x-media-hm-eddie").sunExposure, ["Full sun", "Part shade", "Full shade"]);
  assert.equal(find("japanese-painted-fern").sunExposure.includes("Full sun"), false);
  assert.equal(find("thuja-occidentalis-emerald").sunExposure.includes("Full shade"), false);
  const data = { ...find("blue-eyed-grass"), care: { ...find("blue-eyed-grass").care, sunlight: "Do not plant in full shade." } };
  assert.equal(plantTags(data, "blue-eyed-grass").includes("Full shade"), false);
});

test("pet safety determines filter membership and warning severity consistently", () => {
  for (const { id, data } of plants) {
    const safety = petSafetyFacts(data.care.petSafety);
    assert.equal(plantTags(data, id).includes("Toxic to dogs"), safety.toxicToDogs);
    assert.equal(plantTags(data, id).includes("Toxic to cats"), safety.toxicToCats);
  }
  assert.equal(petSafetyFacts("Unknown").tone, "unknown");
  assert.equal(petSafetyFacts("Potentially toxic").tone, "caution");
  assert.equal(petSafetyFacts("Potentially toxic").toxicToDogs, false);
  assert.equal(petSafetyFacts("Potentially toxic").toxicToCats, false);
  assert.equal(petSafetyFacts("Highly toxic").toxicToCats, true);
  assert.equal(petSafetyFacts("Mildly toxic").toxicToCats, true);
  assert.equal(petSafetyFacts(find("daylily").care.petSafety).toxicToDogs, false);
  assert.equal(petSafetyFacts(find("daylily").care.petSafety).toxicToCats, true);
  assert.equal(find("acer-palmatum-crimson-queen").care.petSafety, "Unknown");
});

test("detail tags retain filter meanings without repeating type and sun care cards", () => {
  for (const { id, data } of plants) {
    for (const tag of plantDisplayTags(data, id)) {
      assert.ok(plantTags(data, id).includes(tag));
      assert.equal(plantTypes(data).includes(tag), false);
      assert.equal((data.sunExposure as readonly string[]).includes(tag), false);
    }
  }
});

test("food crop harvest descriptions are not mislabeled as flowers", () => {
  for (const { id, data } of plants.filter(({ id }) => /^(cucumis-sativus|solanum-lycopersicum)-/.test(id))) {
    assert.match(data.care.bloom, /flowers/i, id);
    assert.ok(data.care.harvest, id);
    assert.match(data.care.propagation, /seed.*(frost|weeks)/i, id);
  }
});

test("publication rejects missing fields, unrecognized tags, silent calendar gaps, and broken map locations", () => {
  const valid = find("hollywood-juniper");
  assert.ok(plantMetadataSchema.safeParse(valid).success);
  for (const patch of [
    { growthForms: undefined }, { sunExposure: [] }, { tags: ["Evergreen"] },
    { tags: ["Groundcover"] }, { type: "Tree" }, { bloomCalendarNote: undefined },
    { pruneMonths: undefined }, { mapX: 10 }, { mapY: 1100 }, { photoCredit: undefined }, { dateAdded: null },
    { care: { ...valid.care, petSafety: "No known toxicity" } },
    { care: { ...valid.care, petSafetySources: [] } },
    { care: { ...valid.care, propagation: "TODO" } },
    { care: { ...valid.care, petSafetySources: ["javascript:alert(1)"] } },
  ]) assert.equal(plantMetadataSchema.safeParse({ ...valid, ...patch }).success, false, JSON.stringify(patch));
});

test("archived and unplaced plants are excluded intentionally; restored calendar gaps are scheduled", () => {
  const data = find("blue-eyed-grass");
  assert.deepEqual(data.bloomMonths, [5, 6]);
  assert.deepEqual(data.pruneMonths, [6, 7]);
  assert.ok(isOnCalendar(data, "bloomMonths"));
  assert.equal(isOnCalendar({ ...data, archived: true }, "bloomMonths"), false);
  assert.equal(isMapped(data), false);
  assert.ok(isMapped({ ...data, mapX: 0, mapY: 0 }));
  assert.equal(isMapped({ ...data, archived: true, mapX: 0, mapY: 0 }), false);
  assert.ok(matchesAny(["Tree", "Conifer"], new Set(["Tree"])));
  assert.ok(matchesAny(["Tree", "Conifer"], new Set(["Conifer"])));
  assert.equal(matchesAny(["Shrub", "Conifer"], new Set(["Tree"])), false);
});
