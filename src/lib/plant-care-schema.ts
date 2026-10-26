import { z } from "astro/zod";
import { SOIL_FERTILITIES, SOIL_REACTIONS } from "./plant-care.ts";

export const careIdSchema = z.string().regex(/^[a-z][a-z0-9-]+$/);
export const careTextSchema = z.string().trim().min(1).refine((value) => !/\bTODO\b/i.test(value), "Complete the research before publishing");
export const careSourceSchema = z.object({
  label: careTextSchema,
  url: z.string().url().refine((value) => value.startsWith("https://"), "Use an HTTPS reference"),
}).strict();
export const careReviewDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Use a real review date");
const ids = z.array(careIdSchema).min(1).refine((values) => new Set(values).size === values.length, "Remove duplicate plant IDs");

export const plantCareGroupSchema = z.object({
  id: careIdSchema,
  plantIds: ids,
  acidity: z.string().refine((value) => Object.hasOwn(SOIL_REACTIONS, value), "Unknown soil acidity classification"),
  fertility: z.string().refine((value) => Object.hasOwn(SOIL_FERTILITIES, value), "Unknown soil fertility classification"),
  sources: z.array(careSourceSchema),
  reviewedOn: careReviewDateSchema.optional(),
}).strict().superRefine((group, ctx) => {
  const classified = group.acidity !== "unreviewed" || group.fertility !== "unreviewed";
  if (classified && (!group.reviewedOn || !group.sources.length)) {
    ctx.addIssue({ code: "custom", path: ["sources"], message: "Classified facts need sources and a review date" });
  }
  if (!classified && (group.sources.length || group.reviewedOn)) {
    ctx.addIssue({ code: "custom", path: ["sources"], message: "Unreviewed classifications must not claim a completed source review" });
  }
});

export function auditPlantCareGroups(
  plants: readonly { id: string }[],
  input: unknown,
  today = new Date().toISOString().slice(0, 10),
): string[] {
  const parsed = z.array(plantCareGroupSchema).safeParse(input);
  if (!parsed.success) return parsed.error.issues.map((issue) => `care.${issue.path.join(".")}: ${issue.message}`);
  const issues: string[] = [];
  const plantIds = new Set(plants.map((plant) => plant.id));
  const groupIds = new Set<string>();
  const assignments = new Set<string>();
  for (const group of parsed.data) {
    if (groupIds.has(group.id)) issues.push(`care.${group.id}: duplicate classification group`);
    groupIds.add(group.id);
    if (group.reviewedOn && group.reviewedOn > today) issues.push(`care.${group.id}: review date is in the future`);
    for (const id of group.plantIds) {
      if (!plantIds.has(id)) issues.push(`care.${group.id}: unknown plant ${id}`);
      if (assignments.has(id)) issues.push(`care.${group.id}: conflicting classifications for ${id}`);
      assignments.add(id);
    }
  }
  for (const { id } of plants) {
    if (!assignments.has(id)) issues.push(`care.${id}: missing explicit classification; research it or mark it unreviewed`);
  }
  return issues;
}
