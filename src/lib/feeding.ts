export const FEEDING_WINDOWS = [
  { id: "spring", label: "Late winter & spring", note: "Use growth and bloom cues, not a fixed date." },
  { id: "growing", label: "Planting & growing season", note: "Crop stage and soil fertility determine whether to feed." },
  { id: "no-routine", label: "No routine feeding", note: "Leaving healthy plants unfed is often the right choice." },
] as const;

export type FeedingWindow = typeof FEEDING_WINDOWS[number]["id"];
export type FeedingNeed = "Routine" | "Conditional" | "Not routinely needed";
export const FEEDING_EVIDENCE = {
  "plant-group": "Plant/group guidance",
  general: "General baseline",
} as const;
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
  evidenceScope: keyof typeof FEEDING_EVIDENCE;
  timing: string;
  requirement: string;
  product?: FeedingProduct;
  condition: string;
  quickCaution: string;
  warning: string;
  instructions: string;
  soil: string;
  sources: readonly FeedingSource[];
  reviewedOn: string;
}
export interface FeedingPlant {
  id: string;
  data: { name: string; latinName?: string; archived?: boolean };
}
export interface FeedingEntry<T extends FeedingPlant> {
  recommendation: FeedingRecommendation;
  plants: T[];
}

export const FEEDING_NEEDS: readonly FeedingNeed[] = ["Routine", "Conditional", "Not routinely needed"];

export function recommendationsForPlant(
  plantId: string,
  recommendations: readonly FeedingRecommendation[],
): FeedingRecommendation[] {
  return recommendations.filter((recommendation) => recommendation.plantIds.includes(plantId));
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
  const baseline = new Set(entries.filter((entry) => entry.recommendation.evidenceScope === "general")
    .flatMap((entry) => entry.plants.map((plant) => plant.id)));
  return {
    entries,
    coveredCount: covered.size,
    baselineCount: baseline.size,
    plantGroupCount: covered.size - baseline.size,
    activeCount: active.length,
    missing: active.filter((plant) => !covered.has(plant.id))
      .sort((a, b) => a.data.name.localeCompare(b.data.name)),
  };
}

export function getFeedingProductGroups<T extends FeedingPlant>(entries: readonly FeedingEntry<T>[]) {
  const groups = new Map<string, {
    product: FeedingProduct;
    plants: { plant: T; recommendation: FeedingRecommendation }[];
  }>();
  for (const { recommendation, plants } of entries) {
    if (!recommendation.product) continue;
    const product = recommendation.product;
    const group = groups.get(product.id) ?? { product, plants: [] };
    group.plants.push(...plants.map((plant) => ({ plant, recommendation })));
    groups.set(product.id, group);
  }
  return [...groups.values()]
    .sort((a, b) => a.product.name.localeCompare(b.product.name))
    .map((group) => ({
      ...group,
      plants: group.plants.sort((a, b) => a.plant.data.name.localeCompare(b.plant.data.name)),
    }));
}

export function normalizeFeedingSearch(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function feedingSearchText(plant: FeedingPlant): string {
  return normalizeFeedingSearch(`${plant.data.name} ${plant.data.latinName ?? ""} ${plant.id}`);
}

export function matchesFeedingSearch(text: string, query: string): boolean {
  return normalizeFeedingSearch(text).includes(normalizeFeedingSearch(query));
}

export type FeedingView = "season" | "product" | "plants";
export interface FeedingFilters {
  view: FeedingView;
  window: FeedingWindow;
  product: string;
  query: string;
}
export interface FeedingRow {
  search: string;
  window?: string;
  product?: string;
  reviewed: boolean;
}

export function matchesFeedingRow(row: FeedingRow, filters: FeedingFilters): boolean {
  if (!matchesFeedingSearch(row.search, filters.query)) return false;
  if (filters.view === "plants") return Boolean(normalizeFeedingSearch(filters.query));
  if (!row.reviewed) return false;
  if (filters.view === "season") return row.window === filters.window;
  return Boolean(filters.product) && (row.product ?? "no-product") === filters.product;
}

export function readFeedingFilters(params: URLSearchParams, productIds: readonly string[]): FeedingFilters {
  const requestedView = params.get("view");
  const view: FeedingView = requestedView === "plants" || requestedView === "product" || requestedView === "season"
    ? requestedView : params.has("product") ? "product" : "season";
  const requestedWindow = params.get("window");
  const window = FEEDING_WINDOWS.find((item) => item.id === requestedWindow)?.id ?? "spring";
  const product = params.get("product") ?? "";
  return {
    view, window,
    product: product === "no-product" || productIds.includes(product) ? product : "",
    query: params.get("q") ?? "",
  };
}

export function feedingPlantUrl(id: string): string {
  return `/feeding/?plant=${encodeURIComponent(id)}#plant-${encodeURIComponent(id)}`;
}
