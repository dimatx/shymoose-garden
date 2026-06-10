import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * A list of months (1–12) that is normalized at load time: duplicates are
 * removed and the values are sorted ascending. This keeps hand-edited or
 * AI-generated frontmatter from producing a jumbled timeline.
 */
const monthList = z
  .array(z.number().int().min(1).max(12))
  .default([])
  .transform((months) => [...new Set(months)].sort((a, b) => a - b));

/**
 * Each plant lives in a single Markdown file under `src/content/plants/`.
 * The frontmatter (the block between the `---` lines) holds the structured
 * data below. The Markdown body *after* the frontmatter is the longer
 * "keep reading" description.
 *
 * To add a plant: copy an existing file in `src/content/plants/`, rename it,
 * drop a photo into `src/assets/plants/`, and edit the fields. That's it.
 */
const plants = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/plants" }),
  schema: ({ image }) =>
    z.object({
      // Display
      name: z.string(), // Common name, e.g. "Japanese Snowball"
      latinName: z.string(), // Botanical name, e.g. "Viburnum plicatum"

      // The kind of plant, used to filter the garden on the home page.
      // e.g. "Perennial", "Annual", "Shrub", "Vegetable", "Succulent".
      // Optional, but recommended so the plant shows up under a type filter.
      type: z.string().optional(),

      // Where the plant (or its species) is originally native to, as a short
      // human phrase, e.g. "Eastern North America" or "Japan, China, and Taiwan".
      // Optional — shown alongside the care details when present.
      nativeRange: z.string().optional(),
      photo: image(), // Path to a photo in src/assets/plants/
      photoAlt: z.string().default(""),
      photoCredit: z.string().optional(),

      // Short description shown by default (the body is the "read more").
      shortDescription: z.string(),

      // Care details — keep these short and human.
      // All fields are optional: only include what you can verify, and the
      // plant page will simply skip any care detail you leave out.
      care: z.object({
        water: z.string().optional(),
        soil: z.string().optional(),
        sunlight: z.string().optional(),
        hardiness: z.string().optional(),
        size: z.string().optional(),
        bloom: z.string().optional(),
        pruning: z.string().optional(),
      }),

      // Months this plant is in flower, as numbers 1–12 (1 = January).
      // Drives the Bloom Calendar. Omit for plants with no floral display
      // (e.g. conifers) or where bloom isn't the point (e.g. vegetables).
      bloomMonths: monthList,

      // Months to do the plant's main pruning / cut-back, as numbers 1–12.
      // Drives the Pruning Calendar. Omit for plants with no calendar pruning
      // window (e.g. annual vegetables that are simply pulled at season's end).
      pruneMonths: monthList,

      // A short, surprising, or delightful fact about the plant.
      // Shown in a highlighted callout on the plant's detail page.
      funFact: z.string().optional(),

      // Optional helpers
      tags: z.array(z.string()).default([]),
      featured: z.boolean().default(false),
      learnMoreUrl: z.string().url().optional(),
      shortUrl: z.string().url().optional(),
    }),
});

export const collections = { plants };
