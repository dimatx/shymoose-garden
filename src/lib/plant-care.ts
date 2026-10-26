import { plantCareGroups } from "../data/plant-care.ts";

export const SOIL_REACTIONS = {
  acidic: "Acid-loving",
  "acid-neutral": "Acidic–neutral soil",
  "neutral-alkaline": "Neutral–alkaline soil",
  adaptable: "Broad pH tolerance",
  unreviewed: "pH unreviewed",
} as const;
export const SOIL_FERTILITIES = {
  lean: "Lean soil",
  moderate: "Moderate fertility",
  organic: "Organically rich soil",
  unreviewed: "Fertility unreviewed",
} as const;
export type SoilReaction = keyof typeof SOIL_REACTIONS;
export type SoilFertility = keyof typeof SOIL_FERTILITIES;
export interface CareSource { label: string; url: string }
export interface PlantCareGroup {
  id: string;
  plantIds: readonly string[];
  acidity: SoilReaction;
  fertility: SoilFertility;
  sources: readonly CareSource[];
  reviewedOn?: string;
}
export const CARE_TAGS = [
  ...Object.entries(SOIL_REACTIONS).filter(([id]) => id !== "unreviewed").map(([, label]) => label),
  ...Object.entries(SOIL_FERTILITIES).filter(([id]) => id !== "unreviewed").map(([, label]) => label),
  "Care unclassified",
];

const assignments = new Map(plantCareGroups.flatMap((group) => group.plantIds.map((id) => [id, group] as const)));

export function plantCareGroup(plantId: string): PlantCareGroup {
  const group = assignments.get(plantId);
  if (!group) throw new Error(`Missing explicit care classification for ${plantId}; classify it or mark it unreviewed.`);
  return group;
}

export function plantCareTags(plantId: string): string[] {
  const group = plantCareGroup(plantId);
  if (group.acidity === "unreviewed" && group.fertility === "unreviewed") return ["Care unclassified"];
  return [
    ...(group.acidity === "unreviewed" ? [] : [SOIL_REACTIONS[group.acidity]]),
    ...(group.fertility === "unreviewed" ? [] : [SOIL_FERTILITIES[group.fertility]]),
  ];
}

export function matchesCareCategory(plantId: string, acidity: string, fertility: string): boolean {
  const group = plantCareGroup(plantId);
  return (!acidity || group.acidity === acidity) && (!fertility || group.fertility === fertility);
}
