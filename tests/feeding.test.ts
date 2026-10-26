import assert from "node:assert/strict";
import { test } from "node:test";
import { auditPlants } from "../scripts/check-plant-data.ts";
import { feedingProducts, feedingTreatments } from "../src/data/feeding.ts";
import { auditFeedingCatalog } from "../src/lib/feeding-schema.ts";
import { FEEDING_SEASONS, TREATMENT_TRIGGERS, getTreatmentCatalog, isTreatmentMember, matchesFeedingSearch, plantNutritionCare, treatmentUrl, treatmentsForPlant } from "../src/lib/feeding.ts";
import { plantCareGroup } from "../src/lib/plant-care.ts";

const { plants } = auditPlants();
const find = (id: string) => {
  const plant = plants.find((item) => item.id === id);
  assert.ok(plant);
  return plant;
};
const treatment = (id: string) => {
  const entry = feedingTreatments.find((item) => item.id === id);
  assert.ok(entry);
  return entry;
};

test("the complete treatment catalog satisfies sources, dates, triggers and audience contracts", () => {
  assert.deepEqual(auditFeedingCatalog(plants, feedingProducts, feedingTreatments), []);
  for (const entry of feedingTreatments) {
    assert.ok(TREATMENT_TRIGGERS[entry.trigger]);
    for (const season of entry.seasons) assert.ok(FEEDING_SEASONS[season]);
    assert.ok(entry.steps.length <= 4);
    assert.ok(entry.title.length <= 65);
    if (entry.caution) assert.ok(entry.caution.length <= 180);
  }
});

test("acid treatment has an explicit reviewed audience, not every evergreen or every acid-tolerant plant", () => {
  const acid = treatment("acid-loving-feed");
  assert.ok(isTreatmentMember(find("mountain-laurel"), acid));
  assert.ok(isTreatmentMember(find("tsuga-canadensis-moon-frost"), acid));
  assert.ok(isTreatmentMember(find("pinus-strobus-angel-falls"), acid));
  assert.ok(!isTreatmentMember(find("boxwood"), acid));
  assert.ok(!isTreatmentMember(find("thuja-occidentalis-emerald"), acid));
  assert.ok(!isTreatmentMember(find("heuchera-primo-black-pearl"), acid));
  assert.equal(acid.productId, "holly-tone");
  assert.equal(acid.trigger, "soil-shortage");
  assert.equal(treatment("boxwood-arborvitae-feed").productId, "plant-tone");
});

test("lean-soil plants are excluded from feed and enrichment rounds, including both threadleaf coreopsis cultivars", () => {
  for (const plant of plants.filter((plant) => !plant.data.archived && plantCareGroup(plant.id).fertility === "lean")) {
    const entries = treatmentsForPlant(plant, feedingTreatments);
    assert.ok(entries.some((entry) => entry.id === "lean-soil-no-feed"));
    assert.ok(entries.every((entry) => entry.action === "withhold"));
  }
  for (const id of ["anacis-verticillata-zagreb", "coreopsis-verticillata-crazy-cayenne"]) {
    assert.deepEqual(treatmentsForPlant(find(id), feedingTreatments).map((entry) => entry.id), ["lean-soil-no-feed"]);
  }
});

test("organically rich soil does not imply scheduled fertilizer, and multiple distinct actions may apply", () => {
  const astilbe = treatmentsForPlant(find("astilbe-chinensis-visions"), feedingTreatments);
  assert.deepEqual(astilbe.map((entry) => entry.id), ["organic-perennial-mulch", "astilbe-no-feed"]);
  assert.ok(astilbe.every((entry) => entry.action !== "feed"));
  const tomato = treatmentsForPlant(find("solanum-lycopersicum-carbon"), feedingTreatments);
  assert.deepEqual(tomato.map((entry) => entry.id), ["vegetable-bed-nutrition", "tomato-fruit-feed"]);
  assert.deepEqual(tomato[0].seasons, ["spring"]);
  assert.deepEqual(tomato[1].seasons, ["summer"]);
});

test("treatment audiences exclude archived plants without erasing their explicit classifications", () => {
  const archived = { ...find("mountain-laurel"), data: { ...find("mountain-laurel").data, archived: true } };
  assert.ok(!isTreatmentMember(archived, treatment("acid-loving-feed")));
  assert.equal(plantCareGroup(archived.id).acidity, "acidic");
  const catalog = getTreatmentCatalog([...plants, archived], feedingTreatments);
  assert.ok(catalog.every((entry) => entry.plants.every((plant) => !plant.data.archived)));
  assert.ok(getTreatmentCatalog([], feedingTreatments).every((entry) => !entry.plants.length));
});

test("missing treatment membership is not fabricated into a no-feed recommendation", () => {
  assert.deepEqual(treatmentsForPlant(find("parsley"), feedingTreatments), []);
  assert.equal(plantCareGroup("parsley").id, "unreviewed");
});

test("search normalization and treatment URLs remain stable", () => {
  assert.ok(matchesFeedingSearch("Corál bells Heuchera", "  CORAL   BELLS "));
  assert.ok(!matchesFeedingSearch("Heuchera", "coreopsis"));
  assert.equal(treatmentUrl("acid-loving-feed"), "/feeding/?treatment=acid-loving-feed");
});

test("audit rejects incomplete records, impossible dates and unsupported product references", () => {
  const base = treatment("acid-loving-feed");
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...base, sources: [] }]).join("\n"), /sources/);
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...base, reviewedOn: "2026-02-31" }]).join("\n"), /real review date/);
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...base, reviewedOn: "2099-01-01" }]).join("\n"), /future/);
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...base, productId: "invented" }]).join("\n"), /unknown product/);
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...base, sources: [{ label: "Only a label", url: feedingProducts[0].url }] }]).join("\n"), /label alone/);
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...base, steps: ["TODO research"] }]).join("\n"), /Complete the research/);
  assert.match(auditFeedingCatalog(plants, feedingProducts, [base, base]).join("\n"), /duplicate treatment ID/);
});

test("audit rejects guessed audiences, enrichment of lean soil and irrelevant exceptions", () => {
  const base = treatment("acid-loving-feed");
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...base, audience: { careGroups: ["invented"] } }]).join("\n"), /unknown or unreviewed care group/);
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...base, audience: { careGroups: ["unreviewed"] } }]).join("\n"), /unknown or unreviewed care group/);
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...base, audience: { plantIds: ["invented"] } }]).join("\n"), /unknown plant/);
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...base, audience: { excludePlantGroups: ["Vegetable"] } }]).join("\n"), /positive, explicit audience/);
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...base, audience: { growthForms: ["Herbaceous"] } }]).join("\n"), /lean-soil plants/);
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...base, audience: { careGroups: ["boxwoods"] }, exceptions: [] }]).join("\n"), /reviewed acidity class/);
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...treatment("organic-perennial-mulch"), audience: { growthForms: ["Herbaceous"] } }]).join("\n"), /lean-soil plants/);
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...base, exceptions: [{ plantIds: ["parsley"], label: "Parsley", note: "Does not belong" }] }]).join("\n"), /outside its audience/);
});

test("audit keeps no-application actions separate from seasonal feeding jobs", () => {
  const noFeed = treatment("lean-soil-no-feed");
  assert.deepEqual(noFeed.seasons, []);
  assert.equal(noFeed.productId, undefined);
  assert.deepEqual(noFeed.steps, []);
  assert.equal(noFeed.caution, undefined);
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...noFeed, seasons: ["spring"] }]).join("\n"), /Withholding is year-round/);
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...noFeed, productId: "holly-tone" }]).join("\n"), /cannot recommend fertilizer/);
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...treatment("acid-loving-feed"), trigger: "established" }]).join("\n"), /Trigger and treatment action disagree/);
});

test("cautions are optional, while actual applications still require instructions and evidence", () => {
  const base = treatment("acid-loving-feed");
  assert.equal(base.caution, undefined);
  assert.deepEqual(auditFeedingCatalog(plants, feedingProducts, [base]), []);
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...base, caution: " " }]).join("\n"), /caution/);
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...base, steps: [] }]).join("\n"), /practical instructions/);
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...treatment("lean-soil-no-feed"), sources: [] }]).join("\n"), /sources/);
});

test("plant care shows product, timing and applicability directly from shared feeding data", () => {
  const care = plantNutritionCare(find("mountain-laurel"), feedingTreatments, feedingProducts);
  assert.ok(care.fertilizer?.kind === "applications");
  const [application] = care.fertilizer.applications;
  assert.equal(application.use, "Espoma Holly-tone");
  assert.equal(application.when, treatment("acid-loving-feed").when);
  assert.ok(application.condition);
  assert.match(application.condition, /Only if a soil test/);
  assert.deepEqual(application.steps, treatment("acid-loving-feed").steps);
  assert.ok(!("sources" in application));
  assert.ok(!("reviewedOn" in application));
});

test("plant-specific timing overrides apply to the right plants without parsing prose", () => {
  for (const id of ["karen-azelia", "rhododendron-dauricum"]) {
    const care = plantNutritionCare(find(id), feedingTreatments, feedingProducts);
    assert.ok(care.fertilizer?.kind === "applications");
    assert.equal(care.fertilizer.applications[0].when, "At the first hint of bloom color");
  }
  const care = plantNutritionCare(find("pieris-japonica"), feedingTreatments, feedingProducts);
  assert.ok(care.fertilizer?.kind === "applications");
  assert.equal(care.fertilizer.applications[0].when, treatment("acid-loving-feed").when);
});

test("no-feed care stays concise, mulch is separate, and missing guidance is not guessed", () => {
  const lean = plantNutritionCare(find("anacis-verticillata-zagreb"), feedingTreatments, feedingProducts);
  assert.deepEqual(lean.fertilizer, { kind: "withhold", summary: "No routine fertilizer in lean soil." });
  const astilbe = plantNutritionCare(find("astilbe-chinensis-visions"), feedingTreatments, feedingProducts);
  assert.equal(astilbe.fertilizer?.kind, "withhold");
  assert.deepEqual(astilbe.mulch.map((item) => item.treatmentId), ["organic-perennial-mulch"]);
  assert.equal(astilbe.mulch[0].use, treatment("organic-perennial-mulch").material);
  const parsley = plantNutritionCare(find("parsley"), feedingTreatments, feedingProducts);
  assert.equal(parsley.fertilizer, undefined);
  assert.deepEqual(parsley.mulch, []);
});

test("detail care retains multiple crop stages and archived care facts without creating archived jobs", () => {
  const tomato = plantNutritionCare(find("solanum-lycopersicum-carbon"), feedingTreatments, feedingProducts);
  assert.ok(tomato.fertilizer?.kind === "applications");
  assert.deepEqual(tomato.fertilizer.applications.map((item) => item.treatmentId), ["vegetable-bed-nutrition", "tomato-fruit-feed"]);
  const archived = { ...find("mountain-laurel"), data: { ...find("mountain-laurel").data, archived: true } };
  assert.deepEqual(plantNutritionCare(archived, feedingTreatments, feedingProducts), plantNutritionCare(find("mountain-laurel"), feedingTreatments, feedingProducts));
  assert.deepEqual(treatmentsForPlant(archived, feedingTreatments), []);
  assert.equal(archived.data.archived, true);
});

test("legacy fertilizer advice is correctly placed and conditional rather than hidden in pruning", () => {
  for (const id of ["geum-tempo-orange", "geum-tempo-yellow"]) {
    assert.doesNotMatch(find(id).data.care.pruning, /fertili[sz]|feed/i);
    const care = plantNutritionCare(find(id), feedingTreatments, feedingProducts);
    assert.ok(care.fertilizer?.kind === "applications");
    const condition = care.fertilizer.applications[0].condition;
    assert.ok(condition);
    assert.match(condition, /soil test/);
  }
  assert.equal(plantNutritionCare(find("baptisia-decadence-lemon-meringue"), feedingTreatments, feedingProducts).fertilizer?.kind, "withhold");
  assert.equal(plantNutritionCare(find("veronica-pink-potion"), feedingTreatments, feedingProducts).fertilizer?.kind, "applications");
});

test("care projection rejects missing products and audit catches conflicting timing overrides", () => {
  assert.throws(() => plantNutritionCare(find("mountain-laurel"), feedingTreatments, []), /Missing product/);
  const base = treatment("acid-loving-feed");
  const conflicts = [
    { plantIds: ["karen-azelia"], label: "First", when: "Early spring" },
    { plantIds: ["karen-azelia"], label: "Second", when: "Late summer" },
  ];
  assert.match(auditFeedingCatalog(plants, feedingProducts, [{ ...base, exceptions: conflicts }]).join("\n"), /conflicting timing overrides/);
});
