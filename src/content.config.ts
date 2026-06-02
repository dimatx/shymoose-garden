import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

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
      }),

      // Optional helpers
      tags: z.array(z.string()).default([]),
      featured: z.boolean().default(false),
      order: z.number().optional(), // Manual sort override (lower = earlier)
      learnMoreUrl: z.string().url().optional(),
    }),
});

export const collections = { plants };
