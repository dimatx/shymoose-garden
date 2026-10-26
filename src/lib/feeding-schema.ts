import { z } from "astro/zod";
import { isTreatmentMember, type TreatmentPlant } from "./feeding.ts";
import { plantCareGroups } from "../data/plant-care.ts";
import { plantCareGroup } from "./plant-care.ts";
import { GROWTH_FORMS, LIFE_CYCLES, PLANT_GROUPS } from "./plant-facets.ts";
import { auditPlantCareGroups, careIdSchema, careReviewDateSchema, careSourceSchema, careTextSchema } from "./plant-care-schema.ts";

const unique = <T>(values: T[]) => new Set(values).size === values.length;
const ids = z.array(careIdSchema).min(1).refine(unique, "Remove duplicate IDs");
const productSchema = z.object({
  id: careIdSchema, name: careTextSchema, url: careSourceSchema.shape.url,
  soilReactions: z.array(z.enum(["acidic", "acid-neutral", "neutral-alkaline", "adaptable"])).min(1).refine(unique, "Remove duplicate soil reactions"),
}).strict();
const audienceSchema = z.object({
  careGroups: ids.optional(),
  plantIds: ids.optional(),
  growthForms: z.array(z.enum(GROWTH_FORMS)).min(1).optional(),
  lifeCycle: z.enum(LIFE_CYCLES).optional(),
  plantGroups: z.array(z.enum(PLANT_GROUPS)).min(1).optional(),
  excludePlantGroups: z.array(z.enum(PLANT_GROUPS)).min(1).optional(),
  fertility: z.array(z.enum(["lean", "moderate", "organic"])).min(1).optional(),
}).strict().refine((audience) => Boolean(audience.careGroups || audience.plantIds || audience.growthForms || audience.lifeCycle || audience.plantGroups || audience.fertility), "A treatment needs a positive, explicit audience rule");

export const feedingTreatmentSchema = z.object({
  id: careIdSchema,
  title: careTextSchema.pipe(z.string().max(65)),
  action: z.enum(["feed", "mulch", "withhold"]),
  seasons: z.array(z.enum(["spring", "summer", "autumn", "winter"])).refine(unique, "Remove duplicate seasons"),
  when: careTextSchema.pipe(z.string().max(100)),
  trigger: z.enum(["soil-shortage", "fruit-topup", "mulch-low", "lean-soil", "established", "rich-moist-soil"]),
  material: careTextSchema.pipe(z.string().max(100)),
  productId: careIdSchema.optional(),
  audience: audienceSchema,
  steps: z.array(careTextSchema.pipe(z.string().max(240))).max(4),
  caution: careTextSchema.pipe(z.string().max(180)).optional(),
  exceptions: z.array(z.object({ plantIds: ids, label: careTextSchema.pipe(z.string().max(60)), note: careTextSchema.pipe(z.string().max(160)) }).strict()).optional(),
  sources: z.array(careSourceSchema).min(1),
  reviewedOn: careReviewDateSchema,
}).strict().superRefine((treatment, ctx) => {
  if (treatment.action !== "withhold" && !treatment.steps.length) {
    ctx.addIssue({ code: "custom", path: ["steps"], message: "An application needs practical instructions" });
  }
  if ((treatment.action === "withhold") !== (treatment.seasons.length === 0)) {
    ctx.addIssue({ code: "custom", path: ["seasons"], message: "Withholding is year-round; applications need an explicit season" });
  }
  if (treatment.action === "withhold" && treatment.productId) {
    ctx.addIssue({ code: "custom", path: ["productId"], message: "A no-application treatment cannot recommend fertilizer" });
  }
  const triggers = treatment.action === "feed" ? ["soil-shortage", "fruit-topup"]
    : treatment.action === "mulch" ? ["mulch-low"] : ["lean-soil", "established", "rich-moist-soil"];
  if (!triggers.includes(treatment.trigger)) ctx.addIssue({ code: "custom", path: ["trigger"], message: "Trigger and treatment action disagree" });
});

export function auditFeedingCatalog(
  plants: readonly TreatmentPlant[],
  productInput: unknown,
  treatmentInput: unknown,
  today = new Date().toISOString().slice(0, 10),
): string[] {
  const issues = auditPlantCareGroups(plants, plantCareGroups, today);
  const products = z.array(productSchema).safeParse(productInput);
  const treatments = z.array(feedingTreatmentSchema).safeParse(treatmentInput);
  if (!products.success) issues.push(...products.error.issues.map((issue) => `products.${issue.path.join(".")}: ${issue.message}`));
  if (!treatments.success) issues.push(...treatments.error.issues.map((issue) => `treatments.${issue.path.join(".")}: ${issue.message}`));
  if (issues.length || !products.success || !treatments.success) return issues;
  const productIds = new Set<string>();
  for (const product of products.data) {
    if (productIds.has(product.id)) issues.push(`products.${product.id}: duplicate product ID`);
    productIds.add(product.id);
  }
  const treatmentIds = new Set<string>();
  const groupIds = new Set(plantCareGroups.filter((group) => group.id !== "unreviewed").map((group) => group.id));
  const plantIds = new Set(plants.map((plant) => plant.id));
  for (const treatment of treatments.data) {
    if (treatmentIds.has(treatment.id)) issues.push(`treatments.${treatment.id}: duplicate treatment ID`);
    treatmentIds.add(treatment.id);
    if (treatment.reviewedOn > today) issues.push(`treatments.${treatment.id}: review date is in the future`);
    for (const group of treatment.audience.careGroups ?? []) {
      if (!groupIds.has(group)) issues.push(`treatments.${treatment.id}: unknown or unreviewed care group ${group}`);
    }
    for (const id of treatment.audience.plantIds ?? []) {
      if (!plantIds.has(id)) issues.push(`treatments.${treatment.id}: unknown plant ${id}`);
    }
    const product = products.data.find((item) => item.id === treatment.productId);
    if (treatment.productId && !product) issues.push(`treatments.${treatment.id}: unknown product ${treatment.productId}`);
    if (product && !treatment.sources.some((source) => new URL(source.url).hostname !== new URL(product.url).hostname)) {
      issues.push(`treatments.${treatment.id}: a product label alone cannot establish a treatment`);
    }
    const audiencePlants = plants.filter((plant) => isTreatmentMember({ ...plant, data: { ...plant.data, archived: false } }, treatment));
    if (treatment.action !== "withhold" && audiencePlants.some((plant) => plantCareGroup(plant.id).fertility === "lean")) {
      issues.push(`treatments.${treatment.id}: feeding or enrichment must not sweep in lean-soil plants`);
    }
    if (product && audiencePlants.some((plant) => !product.soilReactions.some((reaction) => reaction === plantCareGroup(plant.id).acidity))) {
      issues.push(`treatments.${treatment.id}: product ${product.id} does not fit every audience plant's reviewed acidity class`);
    }
    for (const exception of treatment.exceptions ?? []) {
      for (const id of exception.plantIds) {
        if (!audiencePlants.some((plant) => plant.id === id)) issues.push(`treatments.${treatment.id}: exception ${id} is outside its audience`);
      }
    }
  }
  return issues;
}
