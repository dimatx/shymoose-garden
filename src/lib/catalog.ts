export type SortMode = "name" | "name-desc" | "recent" | "oldest";

export interface CatalogItem {
  name: string;
  archived: boolean;
  added: number;
}

export function isSortMode(value: string | undefined): value is SortMode {
  return value === "name" || value === "name-desc" || value === "recent" || value === "oldest";
}

/** Archived plants and unknown dates stay last, regardless of sort direction. */
export function compareCatalogItems(a: CatalogItem, b: CatalogItem, mode: SortMode): number {
  const archived = Number(a.archived) - Number(b.archived);
  if (archived !== 0) return archived;
  if (mode === "recent" || mode === "oldest") {
    const missing = Number(!a.added) - Number(!b.added);
    if (missing !== 0) return missing;
    const date = a.added - b.added;
    if (date !== 0) return mode === "recent" ? -date : date;
  }
  const name = a.name.localeCompare(b.name);
  return mode === "name-desc" ? -name : name;
}
