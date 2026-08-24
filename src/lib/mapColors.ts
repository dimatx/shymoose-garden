/**
 * Colors for the map's plant-type legend/pin-coloring. Kept in their own
 * tiny module (rather than lib/plants.ts, where the rest of the plant-type
 * logic lives) because map.astro's client-side <script> needs to import
 * these directly, and lib/plants.ts pulls in astro:content/astro:assets —
 * server-only virtual modules that can't be bundled into client JS.
 *
 * Chosen to stay visually distinct from the two colors already meaningful
 * on the map: amber (the selected-pin highlight) and blue ("you are here"
 * GPS dot) are deliberately not reused here, so a pin's color always means
 * "type" and never gets confused with map state.
 */
export const MAP_TYPE_COLORS: Record<string, string> = {
  Perennial: "#16a34a",
  Shrub: "#ea580c",
  Tree: "#78350f",
  Vegetable: "#dc2626",
  Annual: "#eab308",
  Succulent: "#0d9488",
  Biennial: "#9333ea",
  Conifer: "#065f46",
  "Ornamental grass": "#65a30d",
};

export const MAP_DEFAULT_PIN_COLOR = "#57534e"; // any type not in the map above
