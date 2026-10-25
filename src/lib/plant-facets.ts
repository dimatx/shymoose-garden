export const GROWTH_FORMS = ["Tree", "Shrub", "Herbaceous", "Vine"] as const;
export const LIFE_CYCLES = ["Annual", "Biennial", "Perennial"] as const;
export const PLANT_GROUPS = ["Conifer", "Vegetable", "Succulent", "Ornamental grass", "Fern"] as const;
export const FOLIAGE_TYPES = ["Evergreen", "Semi-evergreen", "Deciduous", "Seasonal"] as const;
export const SUN_LEVELS = ["Full sun", "Part shade", "Full shade"] as const;
export const PET_SAFETY_LEVELS = [
  "Non-toxic", "Mildly toxic", "Highly toxic", "Potentially toxic", "Highly toxic to cats", "Unknown",
] as const;

export type SunLevel = (typeof SUN_LEVELS)[number];
export type PetSafety = (typeof PET_SAFETY_LEVELS)[number];

export interface PlantFacets {
  growthForms: readonly (typeof GROWTH_FORMS)[number][];
  lifeCycle: (typeof LIFE_CYCLES)[number];
  plantGroups: readonly (typeof PLANT_GROUPS)[number][];
  foliage: (typeof FOLIAGE_TYPES)[number];
  sunExposure: readonly SunLevel[];
  tags: readonly string[];
  care: { petSafety: PetSafety };
}

// Labels based on structured facts must never be maintained again in tags.
export const DERIVED_TAGS = [
  ...GROWTH_FORMS, ...LIFE_CYCLES, ...PLANT_GROUPS, ...FOLIAGE_TYPES,
  ...SUN_LEVELS, "Shade garden", "Toxic to dogs", "Toxic to cats",
] as const;

export const PLANT_TAGS = [
  "Acid-loving", "Aggressive spreader", "Architectural", "Asian garden",
  "Attracts butterflies", "Attracts hummingbirds", "Bicolor blooms", "Bitter-free",
  "Blue flowers", "Bog & waterside", "Cherry Tomato", "Cold hardy", "Compact",
  "Compact shrub", "Conical", "Container-suitable", "Cottage garden", "Cucumber",
  "Cut flowers", "Deer resistant", "Drought tolerant", "Dwarf conifer",
  "Early bloomer", "Easy to grow", "Edible", "Fall color", "Fall flowers",
  "Fast growing", "Foliage interest", "Fragrant", "Fragrant flowers", "Fragrant foliage",
  "Ground cover", "Heat tolerant", "Hedging", "Heirloom", "Herb", "Hybrid (F1)",
  "Indeterminate", "Japanese", "Long bloom season", "Low maintenance", "Native",
  "Naturalizes", "Onion", "Organic", "Plum Tomato", "Pollinator friendly",
  "Pond plant", "Rain garden", "Rock garden", "Salt tolerant", "Sauce", "Seedless",
  "Shade tolerant", "Showy flowers", "Slow growing", "Small spaces", "Small tree",
  "Specimen", "Spring bloom", "Suckering shrub", "Summer bloom", "Variegated",
  "Wetland plant", "Wildlife", "Winter interest", "Woodland edge", "Year-round interest",
] as const;

export const TRAIT_FILTERS = [
  "Evergreen", "Semi-evergreen", "Drought tolerant", "Pollinator friendly",
  "Low maintenance", "Edible", "Deer resistant", "Shade garden", "Toxic to dogs", "Toxic to cats",
] as const;

export function plantTypes(data: PlantFacets): string[] {
  return [...data.growthForms.filter((form) => form !== "Herbaceous"), data.lifeCycle, ...data.plantGroups];
}

export function petSafetyFacts(level: PetSafety) {
  return {
    tone: level === "Highly toxic" || level === "Highly toxic to cats"
      ? "danger"
      : level === "Non-toxic" ? "safe" : level === "Unknown" ? "unknown" : "caution",
    toxicToDogs: level === "Mildly toxic" || level === "Highly toxic",
    toxicToCats: level === "Mildly toxic" || level === "Highly toxic" || level === "Highly toxic to cats",
    highlyToxic: level === "Highly toxic" || level === "Highly toxic to cats",
  } as const;
}

export function plantTags(data: PlantFacets): string[] {
  const safety = petSafetyFacts(data.care.petSafety);
  return [...new Set([
    ...plantTypes(data),
    ...(data.foliage === "Seasonal" ? [] : [data.foliage]),
    ...data.sunExposure,
    ...(data.sunExposure.includes("Part shade") || data.sunExposure.includes("Full shade") ? ["Shade garden"] : []),
    ...(safety.toxicToDogs ? ["Toxic to dogs"] : []),
    ...(safety.toxicToCats ? ["Toxic to cats"] : []),
    ...data.tags,
  ])];
}

export function plantDisplayTags(data: PlantFacets): string[] {
  const inCareCards = new Set([...plantTypes(data), ...data.sunExposure]);
  return plantTags(data).filter((tag) => !inCareCards.has(tag));
}

export function matchesAny(values: readonly string[], selected: ReadonlySet<string>): boolean {
  return selected.size === 0 || values.some((value) => selected.has(value));
}

export function isOnCalendar(data: { archived: boolean; bloomMonths: readonly number[]; pruneMonths: readonly number[] }, field: "bloomMonths" | "pruneMonths"): boolean {
  return !data.archived && data[field].length > 0;
}

export function isMapped(data: { archived: boolean; mapX?: number; mapY?: number }): boolean {
  return !data.archived && data.mapX != null && data.mapY != null;
}
