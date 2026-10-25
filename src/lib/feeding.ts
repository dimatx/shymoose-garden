export const FEEDING_WINDOWS = [
  { id: "spring", label: "Late winter & spring", note: "Use growth and bloom cues, not a fixed date." },
  { id: "growing", label: "Planting & growing season", note: "Crop stage and soil fertility determine whether to feed." },
  { id: "no-routine", label: "No routine feeding", note: "Leaving healthy plants unfed is often the right choice." },
] as const;

export type FeedingWindow = typeof FEEDING_WINDOWS[number]["id"];
export type FeedingNeed = "Routine" | "Conditional" | "Not routinely needed";
export interface FeedingSource {
  label: string;
  url: string;
}
export interface FeedingProduct {
  id: string;
  name: string;
  url: string;
  note: string;
}
export interface FeedingRecommendation {
  id: string;
  title: string;
  plantIds: readonly string[];
  window: FeedingWindow;
  need: FeedingNeed;
  timing: string;
  requirement: string;
  product?: FeedingProduct;
  condition: string;
  warning: string;
  instructions: string;
  soil: string;
  sources: readonly FeedingSource[];
  reviewedOn: string;
}
export interface FeedingPlant {
  id: string;
  data: { name: string; archived?: boolean };
}

export const FEEDING_NEEDS: readonly FeedingNeed[] = ["Routine", "Conditional", "Not routinely needed"];

export function recommendationsForPlant(
  plantId: string,
  recommendations: readonly FeedingRecommendation[],
): FeedingRecommendation[] {
  return recommendations.filter((recommendation) => recommendation.plantIds.includes(plantId));
}

export function feedingAnchor(id: string): string {
  return `/feeding/#${id}`;
}

export function getFeedingGuide<T extends FeedingPlant>(
  plants: readonly T[],
  recommendations: readonly FeedingRecommendation[],
) {
  const active = plants.filter((plant) => !plant.data.archived);
  const entries = recommendations.flatMap((recommendation) => {
    const members = active
      .filter((plant) => recommendation.plantIds.includes(plant.id))
      .sort((a, b) => a.data.name.localeCompare(b.data.name));
    return members.length ? [{ recommendation, plants: members }] : [];
  });
  const covered = new Set(entries.flatMap((entry) => entry.plants.map((plant) => plant.id)));
  return {
    entries,
    coveredCount: covered.size,
    activeCount: active.length,
    missing: active.filter((plant) => !covered.has(plant.id))
      .sort((a, b) => a.data.name.localeCompare(b.data.name)),
  };
}

export function matchesFeedingFilters(
  recommendation: { product?: Pick<FeedingProduct, "id">; need: string },
  productId: string,
  need: string,
): boolean {
  return (!productId || (recommendation.product?.id ?? "no-product") === productId)
    && (!need || recommendation.need === need);
}
