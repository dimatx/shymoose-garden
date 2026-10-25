import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { plantFields, validatePlantRelationships } from "./lib/plant-schema";

// The same publication contract is exercised by the content audit and tests.
// Photos still use Astro's image validator, not a permissive string schema.
const plants = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/plants" }),
  schema: ({ image }) => z.object({ ...plantFields, photo: image() })
    .strict()
    .superRefine(validatePlantRelationships),
});

const notes = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/notes" }),
  schema: z.object({ plant: z.string() }),
});

export const collections = { plants, notes };
