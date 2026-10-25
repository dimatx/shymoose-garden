import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import { plantMetadataSchema } from "../src/lib/plant-schema.ts";
import { isMapped, isOnCalendar, plantTypes } from "../src/lib/plant-facets.ts";
import type { z } from "astro/zod";
import { feedingRecommendations } from "../src/data/feeding.ts";
import { auditFeedingRecommendations } from "../src/lib/feeding-schema.ts";
import { getFeedingGuide } from "../src/lib/feeding.ts";

export interface AuditedPlant {
  id: string;
  data: z.infer<typeof plantMetadataSchema>;
  photo: string;
}

// These are botanical groups, not growth forms: a dwarf pine is still a conifer.
const coniferGenera = new Set([
  "Chamaecyparis", "Cryptomeria", "Juniperus", "Larix", "Metasequoia", "Microbiota",
  "Picea", "Pinus", "Sciadopitys", "Taxus", "Thuja", "Tsuga",
]);
const grassGenera = new Set(["Calamagrostis", "Festuca", "Muhlenbergia", "Pennisetum", "Cenchrus", "Phalaris", "Schizachyrium"]);
const fernGenera = new Set(["Athyrium", "Matteuccia", "Osmunda"]);

export function auditPlants(directory = path.resolve("src/content/plants")) {
  const plants: AuditedPlant[] = [];
  const issues: string[] = [];
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".md")).sort()) {
    const id = file.slice(0, -3);
    const text = readFileSync(path.join(directory, file), "utf8");
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) {
      issues.push(`${id}: missing YAML frontmatter`);
      continue;
    }
    const document = parseDocument(match[1]);
    if (document.errors.length) {
      issues.push(...document.errors.map((error) => `${id}: ${error.message}`));
      continue;
    }
    const input: unknown = document.toJS();
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      issues.push(`${id}: frontmatter must be an object`);
      continue;
    }
    const { photo, ...metadata } = input as Record<string, unknown>;
    const result = plantMetadataSchema.safeParse(metadata);
    if (!result.success) {
      issues.push(...result.error.issues.map((issue) => `${id}: ${issue.path.join(".")}: ${issue.message}`));
      continue;
    }
    if (typeof photo !== "string" || !existsSync(path.resolve(directory, photo))) {
      issues.push(`${id}: photo file does not exist`);
      continue;
    }
    const data = result.data;
    const genus = data.latinName.split(/\s/)[0];
    for (const [genera, group] of [[coniferGenera, "Conifer"], [grassGenera, "Ornamental grass"], [fernGenera, "Fern"]] as const) {
      if (genera.has(genus) && !data.plantGroups.includes(group)) issues.push(`${id}: ${genus} is missing its ${group} classification`);
    }
    if (data.tags.includes("Dwarf conifer") && !data.plantGroups.includes("Conifer")) issues.push(`${id}: dwarf-conifer tag without Conifer classification`);
    if (data.tags.includes("Edible") && !data.plantGroups.includes("Vegetable") && /^(Cucumis|Solanum|Allium|Anethum|Petroselinum)\b/.test(data.latinName)) {
      issues.push(`${id}: food crop is missing its Vegetable classification`);
    }
    if (data.plantGroups.includes("Conifer") && ["Larix", "Metasequoia"].includes(genus) && data.foliage !== "Deciduous") {
      issues.push(`${id}: deciduous conifer incorrectly classified as ${data.foliage}`);
    }
    plants.push({ id, data, photo });
  }
  if (!plants.length) issues.push("No valid plants found");
  return { plants, issues };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { plants, issues } = auditPlants();
  issues.push(...auditFeedingRecommendations(plants, feedingRecommendations));
  if (issues.length) {
    console.error(issues.join("\n"));
    process.exitCode = 1;
  } else {
    const active = plants.filter((plant) => !plant.data.archived);
    const count = (predicate: (plant: AuditedPlant) => boolean) => plants.filter(predicate).length;
    console.log(`Audited ${plants.length} plants: publication fields and cross-view classifications are valid.`);
    console.log(`Trees: ${count((p) => plantTypes(p.data).includes("Tree"))}; conifers: ${count((p) => p.data.plantGroups.includes("Conifer"))}; ornamental grasses: ${count((p) => p.data.plantGroups.includes("Ornamental grass"))}.`);
    console.log(`Bloom calendar: ${count((p) => isOnCalendar(p.data, "bloomMonths"))}; pruning calendar: ${count((p) => isOnCalendar(p.data, "pruneMonths"))}. All other exclusions are explicit or archived.`);
    console.log(`Map: ${active.filter((p) => isMapped(p.data)).length}/${active.length} active plants placed; unplaced plants need actual garden coordinates, not inferred locations.`);
    console.log(`Pet safety: ${count((p) => p.data.care.petSafety === "Unknown")} unknown assessments remain explicitly unconfirmed. Schema validity is not scientific verification.`);
    const feeding = getFeedingGuide(plants, feedingRecommendations);
    console.log(`Feeding: ${feeding.plantGroupCount} plants with plant/group guidance; ${feeding.baselineCount} with a general baseline; ${feeding.missing.length} unreviewed. Product associations and references are structurally valid, not a prescription to feed.`);
  }
}
