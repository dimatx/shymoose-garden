import { treatmentMaterial, treatmentsForPlant, type FeedingProduct, type FeedingTreatment, type TreatmentPlant } from "./feeding.ts";

// Plant details expose facts, not the guide's procedures, policies or provenance.
export interface PlantNutritionFact {
  treatmentId: string;
  when: string;
  recommendation: string;
  notes: readonly string[];
}
export type FertilizerCare =
  | { kind: "applications"; applications: readonly PlantNutritionFact[] }
  | { kind: "withhold"; summary: string };
export interface PlantNutritionCare {
  fertilizer?: FertilizerCare;
  mulch: readonly PlantNutritionFact[];
}

export function plantNutritionCare(
  plant: TreatmentPlant,
  treatments: readonly FeedingTreatment[],
  products: readonly FeedingProduct[],
): PlantNutritionCare {
  // Archiving removes planning jobs, not the plant's care information.
  const subject = { ...plant, data: { ...plant.data, archived: false } };
  const matching = treatmentsForPlant(subject, treatments);
  const fact = (treatment: FeedingTreatment): PlantNutritionFact => {
    const material = treatmentMaterial(treatment, products);
    const exceptions = treatment.exceptions?.filter((exception) => exception.plantIds.includes(plant.id)) ?? [];
    let recommendation: string;
    switch (treatment.trigger) {
      case "soil-shortage": recommendation = `Use ${material} only when soil is nutrient-deficient.`; break;
      case "fruit-topup": recommendation = `Use ${material} only when additional nitrogen is needed.`; break;
      case "mulch-low": recommendation = material; break;
      default: throw new Error(`Unsupported application condition ${treatment.trigger}`);
    }
    return {
      treatmentId: treatment.id,
      when: exceptions.find((exception) => exception.when)?.when ?? treatment.when,
      recommendation,
      notes: exceptions.flatMap((exception) => exception.note ? [exception.note] : []),
    };
  };
  const feeds = matching.filter((treatment) => treatment.action === "feed");
  const mulch = matching.filter((treatment) => treatment.action === "mulch").map(fact);
  if (feeds.length) return { fertilizer: { kind: "applications", applications: feeds.map(fact) }, mulch };
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
