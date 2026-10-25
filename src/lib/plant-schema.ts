import { z } from "astro/zod";
import {
  GROWTH_FORMS, LIFE_CYCLES, PLANT_GROUPS, FOLIAGE_TYPES, SUN_LEVELS,
  PET_SAFETY_LEVELS, PLANT_TAGS,
} from "./plant-facets.ts";

const text = z.string().trim().min(1).refine((value) => !/\bTODO\b/i.test(value), "Finish the research; TODO is not publishable");
const url = z.string().url().refine((value) => /^https?:\/\//.test(value), "Use an HTTP(S) source URL");
const unique = <T>(values: T[]) => new Set(values).size === values.length;
const months = z.array(z.number().int().min(1).max(12))
  .refine(unique, "Remove duplicate months")
  .transform((values) => values.toSorted((a, b) => a - b));

export const plantFields = {
  name: text,
  latinName: text,
  growthForms: z.array(z.enum(GROWTH_FORMS)).min(1).refine(unique, "Remove duplicate growth forms"),
  lifeCycle: z.enum(LIFE_CYCLES),
  plantGroups: z.array(z.enum(PLANT_GROUPS)).refine(unique, "Remove duplicate groups"),
  foliage: z.enum(FOLIAGE_TYPES),
  sunExposure: z.array(z.enum(SUN_LEVELS)).min(1).refine(unique, "Remove duplicate sun levels"),
  nativeRange: text,
  photoAlt: text,
  photoCredit: text,
  photoSourceUrl: url.optional(),
  shortDescription: text,
  care: z.object({
    water: text,
    soil: text,
    sunlight: text,
    hardiness: text,
    size: text,
    bloom: text,
    harvest: text.optional(),
    pruning: text,
    spacing: text,
    propagation: text,
    petSafety: z.enum(PET_SAFETY_LEVELS),
    petSafetyNotes: text,
    petSafetyInfo: text,
    petSafetySources: z.array(url).min(1),
  }).strict(),
  bloomMonths: months,
  pruneMonths: months,
  // Required only when the corresponding calendar has no months.
  bloomCalendarNote: text.optional(),
  pruneCalendarNote: text.optional(),
  funFact: text.optional(),
  tags: z.array(z.enum(PLANT_TAGS)).refine(unique, "Remove duplicate tags"),
  featured: z.boolean().default(false),
  learnMoreUrl: url,
  shortUrl: url.optional(),
  mapZone: text.optional(),
  mapX: z.number().finite().min(0).max(1560).optional(),
  mapY: z.number().finite().min(0).max(1060).optional(),
  dateAdded: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.date()]).pipe(z.coerce.date()),
  archived: z.boolean().default(false),
  archivedNote: text.optional(),
};

type PlantData = z.infer<z.ZodObject<typeof plantFields>>;

export function validatePlantRelationships(data: PlantData, ctx: z.RefinementCtx) {
  for (const [field, note] of [
    ["bloomMonths", "bloomCalendarNote"], ["pruneMonths", "pruneCalendarNote"],
  ] as const) {
    if (!data[field].length && !data[note]) {
      ctx.addIssue({ code: "custom", path: [note], message: "Explain the deliberate calendar exclusion, or supply researched months" });
    }
    if (data[field].length && data[note]) {
      ctx.addIssue({ code: "custom", path: [note], message: "A scheduled calendar cannot also have an exclusion note" });
    }
  }
  if ((data.mapX == null) !== (data.mapY == null) || (data.mapZone && data.mapX == null)) {
    ctx.addIssue({ code: "custom", path: ["mapX"], message: "Map placement needs both coordinates; do not leave a partial location" });
  }
  if (data.growthForms.some((form) => form === "Tree" || form === "Shrub") && data.lifeCycle !== "Perennial") {
    ctx.addIssue({ code: "custom", path: ["lifeCycle"], message: "Woody trees and shrubs are perennial" });
  }
  if (data.plantGroups.includes("Conifer") && !data.growthForms.some((form) => form === "Tree" || form === "Shrub")) {
    ctx.addIssue({ code: "custom", path: ["growthForms"], message: "A conifer also needs its cultivar's tree/shrub growth form" });
  }
  if (data.plantGroups.includes("Conifer") && data.bloomMonths.length) {
    ctx.addIssue({ code: "custom", path: ["bloomMonths"], message: "Conifers have cones, not flowers" });
  }
  if (data.plantGroups.includes("Fern") && data.bloomMonths.length) {
    ctx.addIssue({ code: "custom", path: ["bloomMonths"], message: "Ferns have spores, not flowers" });
  }
  if (data.growthForms.includes("Herbaceous") && data.growthForms.some((form) => form === "Tree" || form === "Shrub")) {
    ctx.addIssue({ code: "custom", path: ["growthForms"], message: "Do not classify a woody plant as herbaceous" });
  }
}

export const plantMetadataSchema = z.object(plantFields).strict().superRefine(validatePlantRelationships);
