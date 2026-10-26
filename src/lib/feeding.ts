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
export const FEEDING_SAFETY = "Do not feed drought-stressed plants or frozen soil.";
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
  caution?: string;
  exceptions?: readonly { plantIds: readonly string[]; label: string; when?: string; note?: string }[];
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

export interface CareApplication {
  treatmentId: string;
  when: string;
  use: string;
  condition?: string;
  steps: readonly string[];
  caution?: string;
  notes: readonly string[];
}
export type FertilizerCare =
  | { kind: "applications"; applications: CareApplication[] }
  | { kind: "withhold"; summary: string };
export interface PlantNutritionCare {
  fertilizer?: FertilizerCare;
  mulch: CareApplication[];
}

export function plantNutritionCare(
  plant: TreatmentPlant,
  treatments: readonly FeedingTreatment[],
  products: readonly FeedingProduct[],
): PlantNutritionCare {
  // Archiving removes planning jobs, not the plant's care information.
  const subject = { ...plant, data: { ...plant.data, archived: false } };
  const matching = treatmentsForPlant(subject, treatments);
  const application = (treatment: FeedingTreatment): CareApplication => {
    const product = treatment.productId ? products.find((item) => item.id === treatment.productId) : undefined;
    if (treatment.productId && !product) throw new Error(`Missing product ${treatment.productId} for ${treatment.id}`);
    const exceptions = treatment.exceptions?.filter((exception) => exception.plantIds.includes(plant.id)) ?? [];
    let condition: string | undefined;
    switch (treatment.trigger) {
      case "soil-shortage": condition = "Only if a soil test confirms a nutrient shortage."; break;
      case "fruit-topup": condition = "Only if additional nutrients are needed."; break;
      case "mulch-low": condition = undefined; break;
      default: throw new Error(`Unsupported application condition ${treatment.trigger}`);
    }
    return {
      treatmentId: treatment.id,
      when: exceptions.find((exception) => exception.when)?.when ?? treatment.when,
      use: product?.name ?? treatment.material,
      condition,
      steps: treatment.steps,
      caution: treatment.caution,
      notes: exceptions.flatMap((exception) => exception.note ? [exception.note] : []),
    };
  };
  const feeds = matching.filter((treatment) => treatment.action === "feed");
  const mulch = matching.filter((treatment) => treatment.action === "mulch").map(application);
  if (feeds.length) return { fertilizer: { kind: "applications", applications: feeds.map(application) }, mulch };
  const withheld = matching.filter((treatment) => treatment.action === "withhold");
  const specific = withheld.find((treatment) => treatment.trigger !== "established") ?? withheld[0];
  if (!specific) return { mulch };
  let summary: string;
  switch (specific.trigger) {
    case "lean-soil": summary = "No routine fertilizer in lean soil."; break;
    case "rich-moist-soil": summary = "No routine fertilizer in rich, moist soil."; break;
    case "established": summary = "No routine fertilizer for healthy, established plants."; break;
    default: throw new Error(`Unsupported no-feed condition ${specific.trigger}`);
  }
  return { fertilizer: { kind: "withhold", summary }, mulch };
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
