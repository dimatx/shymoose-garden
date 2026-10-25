import { z } from "astro/zod";
import { FEEDING_NEEDS, FEEDING_WINDOWS, type FeedingPlant } from "./feeding.ts";

const text = z.string().trim().min(1).refine((value) => !/\bTODO\b/i.test(value), "Finish the guidance before publishing");
const id = z.string().regex(/^[a-z][a-z0-9-]+$/);
const url = z.string().url().refine((value) => value.startsWith("https://"), "Use an HTTPS reference");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Use a real calendar date");

export const feedingRecommendationSchema = z.object({
  id,
  title: text,
  plantIds: z.array(id).min(1).refine((ids) => new Set(ids).size === ids.length, "Remove duplicate plants"),
  window: z.string().refine((value) => FEEDING_WINDOWS.some((window) => window.id === value), "Unknown seasonal window"),
  need: z.string().refine((value) => FEEDING_NEEDS.some((need) => need === value), "Unknown feeding need"),
  evidenceScope: z.enum(["plant-group", "general"]),
  timing: text,
  requirement: text,
  product: z.object({ id, name: text, url, note: text }).strict().optional(),
  condition: text,
  quickCaution: text,
  warning: text,
  instructions: text,
  soil: text,
  sources: z.array(z.object({ label: text, url }).strict()).min(1),
  reviewedOn: date,
}).strict().superRefine((entry, ctx) => {
  if ((entry.window === "no-routine") !== (entry.need === "Not routinely needed")) {
    ctx.addIssue({ code: "custom", path: ["window"], message: "No-routine window and feeding need must agree" });
  }
  if (entry.evidenceScope === "general" && entry.product) {
    ctx.addIssue({ code: "custom", path: ["product"], message: "A broad baseline cannot establish a plant-specific product choice" });
  }
});

export function auditFeedingRecommendations(
  plants: readonly FeedingPlant[],
  input: unknown,
  today = new Date().toISOString().slice(0, 10),
): string[] {
  const parsed = z.array(feedingRecommendationSchema).safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => `feeding.${issue.path.join(".")}: ${issue.message}`);
  }
  const issues: string[] = [];
  const plantIds = new Set(plants.map((plant) => plant.id));
  const ids = new Set<string>();
  const assignments = new Map<string, string>();
  const products = new Map<string, string>();
  for (const entry of parsed.data) {
    if (ids.has(entry.id)) issues.push(`feeding.${entry.id}: duplicate recommendation ID`);
    ids.add(entry.id);
    if (entry.reviewedOn > today) issues.push(`feeding.${entry.id}: review date is in the future`);
    for (const plantId of entry.plantIds) {
      if (!plantIds.has(plantId)) issues.push(`feeding.${entry.id}: unknown plant ${plantId}`);
      const assigned = assignments.get(plantId);
      if (assigned) issues.push(`feeding.${entry.id}: ${plantId} already assigned to ${assigned}; reconcile conflicting guidance`);
      assignments.set(plantId, entry.id);
    }
    if (entry.product) {
      const product = entry.product;
      const definition = JSON.stringify(product);
      const existing = products.get(product.id);
      if (existing && existing !== definition) issues.push(`feeding.${entry.id}: conflicting definition for product ${product.id}`);
      products.set(product.id, definition);
      if (!entry.sources.some((source) => new URL(source.url).hostname !== new URL(product.url).hostname)) {
        issues.push(`feeding.${entry.id}: product directions need independent horticultural support`);
      }
    }
  }
  return issues;
}
