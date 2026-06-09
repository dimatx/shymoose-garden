import { getCollection, type CollectionEntry } from "astro:content";

/**
 * Shared helpers for reading the plant collection. Every page that lists
 * plants (the home grid, the bloom timeline, the pruning calendar) goes
 * through here, so sorting and URL rules live in exactly one place.
 */
export type Plant = CollectionEntry<"plants">;

/** A single row in a MonthTimeline (bloom or pruning chart). */
export interface TimelineRow {
  name: string;
  url: string;
  months: number[]; // 1–12 (1 = January)
}

/** The page URL for a plant, e.g. `/plants/japanese-snowball/`. */
export function plantUrl(plant: Plant): string {
  return `/plants/${plant.id}/`;
}

/**
 * Coarse sun-exposure buckets, in brightest-to-shadiest order. Derived from the
 * free-form `care.sunlight` prose so the home page can offer a "Sun" filter
 * without anyone having to maintain a separate field.
 */
export const SUN_LEVELS = ["Full sun", "Part shade", "Full shade"] as const;
export type SunLevel = (typeof SUN_LEVELS)[number];

/**
 * Map a plant's `care.sunlight` description to the buckets it can grow in. A
 * plant often spans more than one (e.g. "Full sun to part shade"), so the
 * filter behaves as "show me plants that work in this light".
 */
export function sunLevels(plant: Plant): SunLevel[] {
  const text = (plant.data.care.sunlight ?? "").toLowerCase();
  const levels: SunLevel[] = [];
  if (/full sun/.test(text)) levels.push("Full sun");
  if (/part(ial)? shade|part sun|dappled|filtered light/.test(text)) {
    levels.push("Part shade");
  }
  if (/full shade|deep shade/.test(text)) levels.push("Full shade");
  return levels;
}

/**
 * Stable display order: alphabetical by common name.
 */
export function comparePlants(a: Plant, b: Plant): number {
  return a.data.name.localeCompare(b.data.name);
}

/** All plants in display order. */
export async function getSortedPlants(): Promise<Plant[]> {
  return (await getCollection("plants")).sort(comparePlants);
}

/**
 * Build timeline rows from a per-plant month field. Plants with no months
 * for that field are dropped (e.g. conifers have no bloom, annuals have no
 * pruning window), so they never appear on the chart.
 */
export async function getTimelineRows(
  field: "bloomMonths" | "pruneMonths"
): Promise<TimelineRow[]> {
  const plants = await getCollection("plants");
  return plants
    .filter((plant) => plant.data[field].length > 0)
    .map((plant) => ({
      name: plant.data.name,
      url: plantUrl(plant),
      months: plant.data[field],
    }));
}
