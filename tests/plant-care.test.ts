import assert from "node:assert/strict";
import { test } from "node:test";
import { auditPlants } from "../scripts/check-plant-data.ts";
import { plantCareGroups } from "../src/data/plant-care.ts";
import { auditPlantCareGroups } from "../src/lib/plant-care-schema.ts";
import { matchesCareCategory, plantCareGroup, plantCareTags } from "../src/lib/plant-care.ts";
import { DERIVED_TAGS, plantDisplayTags, plantTags } from "../src/lib/plant-facets.ts";

const { plants } = auditPlants();

test("every published plant has one explicit care assignment, including unreviewed plants", () => {
  assert.deepEqual(auditPlantCareGroups(plants, plantCareGroups), []);
  const assigned = plantCareGroups.flatMap((group) => [...group.plantIds]);
  assert.equal(new Set(assigned).size, plants.length);
  assert.equal(assigned.length, plants.length);
  assert.throws(() => plantCareGroup("not-in-the-catalog"), /Missing explicit care classification/);
  assert.equal(plantCareGroup("parsley").fertility, "unreviewed");
  assert.deepEqual(plantCareTags("parsley"), ["Care unclassified"]);
});

test("acidity and fertility are independent, reviewed facts rather than mutually exclusive feeding buckets", () => {
  assert.deepEqual(plantCareTags("mountain-laurel"), ["Acid-loving", "Organically rich soil"]);
  assert.deepEqual(plantCareTags("anacis-verticillata-zagreb"), ["Lean soil"]);
  assert.deepEqual(plantCareTags("coreopsis-verticillata-crazy-cayenne"), ["Lean soil"]);
  assert.equal(plantCareGroup("anacis-verticillata-zagreb").acidity, "unreviewed");
  assert.equal(plantCareGroup("astilbe-chinensis-visions").fertility, "organic");
  assert.ok(matchesCareCategory("mountain-laurel", "acidic", "organic"));
  assert.ok(!matchesCareCategory("mountain-laurel", "acidic", "lean"));
  assert.ok(matchesCareCategory("coreopsis-verticillata-crazy-cayenne", "", "lean"));
  assert.ok(!matchesCareCategory("coreopsis-verticillata-crazy-cayenne", "acidic", "lean"));
});

test("catalog filters, card labels and detail tags derive the same classifications", () => {
  for (const { id, data } of plants) {
    const careTags = plantCareTags(id);
    for (const tag of careTags) {
      assert.ok(plantTags(data, id).includes(tag), `${id}: filter mismatch`);
      assert.ok(plantDisplayTags(data, id).includes(tag), `${id}: detail mismatch`);
      assert.ok((DERIVED_TAGS as readonly string[]).includes(tag));
      assert.ok(!data.tags.some((authored) => authored === tag), `${id}: duplicated authored classification`);
    }
  }
});

test("classification audit rejects missing, duplicate, invented and unsourced facts", () => {
  const first = plantCareGroups[0];
  assert.match(auditPlantCareGroups(plants, plantCareGroups.slice(1)).join("\n"), /missing explicit classification/);
  assert.match(auditPlantCareGroups(plants, [...plantCareGroups, first]).join("\n"), /conflicting classifications/);
  assert.match(auditPlantCareGroups(plants, [{ ...first, plantIds: ["invented-plant"] }]).join("\n"), /unknown plant/);
  assert.match(auditPlantCareGroups(plants, [{ ...first, sources: [] }]).join("\n"), /need sources/);
  assert.match(auditPlantCareGroups(plants, [{ ...first, acidity: "acidic-by-default" }]).join("\n"), /Unknown soil acidity/);
  assert.match(auditPlantCareGroups(plants, [{ ...first, reviewedOn: "2026-02-31" }]).join("\n"), /real review date/);
  assert.match(auditPlantCareGroups(plants, [{ ...first, reviewedOn: "2099-01-01" }]).join("\n"), /future/);
  const unreviewed = plantCareGroups.find((group) => group.id === "unreviewed")!;
  assert.match(auditPlantCareGroups(plants, [{ ...unreviewed, reviewedOn: "2026-10-26" }]).join("\n"), /must not claim/);
});
