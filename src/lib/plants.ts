import { getCollection, type CollectionEntry } from "astro:content";
import { getImage } from "astro:assets";

/**
 * Shared helpers for reading the plant collection. Every page that lists
 * plants (the home grid, the bloom calendar, the pruning calendar) goes
 * through here, so sorting and URL rules live in exactly one place.
 */
export type Plant = CollectionEntry<"plants">;

/** A single row in a MonthCalendar (bloom or pruning chart). */
export interface CalendarRow {
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
 * Build calendar rows from a per-plant month field. Plants with no months
 * for that field are dropped (e.g. conifers have no bloom, annuals have no
 * pruning window), so they never appear on the chart.
 */
export async function getCalendarRows(
  field: "bloomMonths" | "pruneMonths"
): Promise<CalendarRow[]> {
  const plants = await getCollection("plants");
  return plants
    .filter((plant) => plant.data[field].length > 0)
    .map((plant) => ({
      name: plant.data.name,
      url: plantUrl(plant),
      months: plant.data[field],
    }));
}

/**
 * Plants placed on the garden map (see /map and public/map/garden-map.svg).
 * Anything missing mapX/mapY is left off — most plants won't have a pin yet
 * until someone plots them with the map's pin-placement helper.
 */
export interface MapPin {
  slug: string;
  name: string;
  latinName: string;
  type: string | null;
  zone: string | null;
  photo: string;
  x: number;
  y: number;
}

export async function getMapPins(): Promise<MapPin[]> {
  const plants = await getCollection("plants");
  const plotted = plants.filter(
    (plant) => plant.data.mapX != null && plant.data.mapY != null
  );
  return Promise.all(
    plotted.map(async (plant) => {
      const thumb = await getImage({
        src: plant.data.photo,
        width: 160,
        height: 160,
        format: "webp",
      });
      return {
        slug: plant.id,
        name: plant.data.name,
        latinName: plant.data.latinName,
        type: plant.data.type ?? null,
        zone: plant.data.mapZone ?? null,
        photo: thumb.src,
        x: plant.data.mapX!,
        y: plant.data.mapY!,
      };
    })
  );
}
