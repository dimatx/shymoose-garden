import { plantCareGroup, type CareSource, type SoilFertility, type SoilReaction } from "./plant-care.ts";

export const FEEDING_SEASONS = {
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
  winter: "Winter",
} as const;
export const TREATMENT_TRIGGERS = {
  "soil-shortage": "Soil test: nutrient shortage",
  "fruit-topup": "First fruit enlarges and nutrients need topping up",
  "mulch-low": "Organic mulch needs replenishing",
  "lean-soil": "Lean-soil plants growing normally",
  established: "Established plants growing well",
  "rich-moist-soil": "Astilbes established in rich, moist soil",
} as const;
export type FeedingSeason = keyof typeof FEEDING_SEASONS;
export interface FeedingProduct { id: string; name: string; url: string; soilReactions: readonly Exclude<SoilReaction, "unreviewed">[] }
export interface TreatmentAudience {
  careGroups?: readonly string[];
  plantIds?: readonly string[];
  growthForms?: readonly string[];
  lifeCycle?: string;
  plantGroups?: readonly string[];
  excludePlantGroups?: readonly string[];
  fertility?: readonly SoilFertility[];
}
export interface FeedingTreatment {
  id: string;
  title: string;
  action: "feed" | "mulch" | "withhold";
  seasons: readonly FeedingSeason[];
  when: string;
  trigger: keyof typeof TREATMENT_TRIGGERS;
  material: string;
  productId?: string;
  audience: TreatmentAudience;
  steps: readonly string[];
  caution: string;
  exceptions?: readonly { plantIds: readonly string[]; label: string; note: string }[];
  sources: readonly CareSource[];
  reviewedOn: string;
}
export interface TreatmentPlant {
  id: string;
  data: {
    name: string;
    latinName?: string;
    archived: boolean;
    growthForms: readonly string[];
    lifeCycle: string;
    plantGroups: readonly string[];
  };
}

export function isTreatmentMember(plant: TreatmentPlant, treatment: FeedingTreatment): boolean {
  if (plant.data.archived) return false;
  const audience = treatment.audience;
  const care = plantCareGroup(plant.id);
  if (audience.careGroups || audience.plantIds) {
    if (!audience.careGroups?.includes(care.id) && !audience.plantIds?.includes(plant.id)) return false;
  }
  return (!audience.growthForms || audience.growthForms.some((form) => plant.data.growthForms.includes(form)))
    && (!audience.lifeCycle || audience.lifeCycle === plant.data.lifeCycle)
    && (!audience.plantGroups || audience.plantGroups.some((group) => plant.data.plantGroups.includes(group)))
    && (!audience.excludePlantGroups || !audience.excludePlantGroups.some((group) => plant.data.plantGroups.includes(group)))
    && (!audience.fertility || audience.fertility.includes(care.fertility));
}

export function getTreatmentCatalog<T extends TreatmentPlant>(plants: readonly T[], treatments: readonly FeedingTreatment[]) {
  return treatments.map((treatment) => ({
    treatment,
    plants: plants.filter((plant) => isTreatmentMember(plant, treatment))
      .sort((a, b) => a.data.name.localeCompare(b.data.name)),
  }));
}

export function treatmentsForPlant(plant: TreatmentPlant, treatments: readonly FeedingTreatment[]): FeedingTreatment[] {
  return treatments.filter((treatment) => isTreatmentMember(plant, treatment));
}

export function treatmentUrl(id: string): string {
  return `/feeding/?treatment=${encodeURIComponent(id)}`;
}

export function normalizeFeedingSearch(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function feedingSearchText(plant: TreatmentPlant): string {
  return normalizeFeedingSearch(`${plant.data.name} ${plant.data.latinName ?? ""} ${plant.id}`);
}

export function matchesFeedingSearch(text: string, query: string): boolean {
  return normalizeFeedingSearch(text).includes(normalizeFeedingSearch(query));
}

export const LEGACY_TREATMENTS: Record<string, string> = {
  "mountain-laurel": "acid-loving-feed",
  "azalea-rhododendron": "acid-loving-feed",
  "pieris-holly": "acid-loving-feed",
  "boxwood-arborvitae": "boxwood-arborvitae-feed",
  hydrangeas: "hydrangea-feed",
  tomatoes: "tomato-fruit-feed",
  cucumbers: "vegetable-bed-nutrition",
  "established-woody": "established-woody-no-feed",
  "yarrow-stonecrop": "lean-soil-no-feed",
  "ornamental-grasses": "grass-no-feed",
};
