# AGENTS.md — working agreement for AI assistants on shymoose-garden

This file is the **source of truth** for how an AI assistant should add and
publish plants in this repo. It lives in git on purpose: earlier the same
workflow was kept only in local "memory" and was repeatedly lost between
sessions, causing regressions (photos skipped, signs/short links not generated,
care data taken from a single marketing page). If you are an assistant working
here, **read this file first and follow it end to end.** "It built
successfully" is *not* the definition of done — the steps below are.

## What this project is

A small Astro static site cataloging the ShyMoose garden. Each plant is one
Markdown file in `src/content/plants/`, with its photo in `src/assets/plants/`.
The schema is `src/content.config.ts`; **`photo: image()` is REQUIRED**, so the
image file must exist or the build fails. Physical 3D-printed signs in `signs/`
carry a QR code pointing at a Shlink short URL for each plant.

## Adding new plants — the full pipeline (do ALL of it)

### 1. Import
- Run `npm run import:plants` (needs `PLANTS_SHEET_CSV_URL` in `.env`).
- It pulls the Google Sheet and scaffolds NEW rows as drafts in
  `drafts/plants/`. Matching against existing plants is by **Full link
  (`learnMoreUrl`) OR normalized Latin name**; Latin name is the stable id
  (common names like "Stonecrop" repeat).
- The script self-prunes: drafts whose plant is now published are deleted on
  the next import run.

### 2. Research care data — MULTIPLE reputable sources, not the first hit
Do **not** trust a single source or a vendor marketing page alone. Cross-
reference and reconcile:
- **Genus/species culture** (water, soil, sun, hardiness, size, pruning):
  NCSU Extension Plant Toolbox, Missouri Botanical Garden Plant Finder, RHS,
  university extension sites. **These outrank vendor/marketing pages.**
- **Cultivar-specific traits** (exact mature size, foliage color, this
  cultivar's bloom time, awards): the breeder/vendor page (e.g. Proven Winners)
  is authoritative for **its own** cultivar — but still corroborate the genus
  culture above.
- If sources disagree, prefer the reputable extension/botanical-garden value or
  give the reconciled range; note the cultivar exception where one exists.
- Choose the most reputable `learnMoreUrl`: prefer NCSU/MoBot for a species,
  keep the breeder page for a patented cultivar.

### 3. Fetch the photo — this is the assistant's job, not a TODO for the user
- Preferred: a CC-licensed image (Wikimedia Commons, Flickr CC-BY). Add
  `photoCredit`.
- **Avoid CC-BY-NC-ND**: the Sharp build pipeline resizes/crops the image, which
  creates a derivative the ND clause forbids.
- For patented cultivars with no CC image (e.g. Proven Winners Primo®/Dolce®
  Heuchera), download the hero image from the `learnMoreUrl` page and credit
  `"Courtesy of Proven Winners — provenwinners.com"`. Use `Invoke-WebRequest`
  with a browser `User-Agent` and save to `src/assets/plants/<slug>.jpg`.
- **View the downloaded image** to confirm it's the right cultivar, then write
  `photoAlt` describing what's actually in frame (e.g. foliage only vs. in
  flower).

### 4. Write the content file
- Fill all frontmatter: `type`, `nativeRange`, `care.*`, `bloomMonths`,
  `pruneMonths`, `tags` (reuse the existing vocabulary), `funFact`, and a longer
  body below the `---`.
- Clean cultivar Latin names — the sheet sometimes has stray nested quotes
  (e.g. `Heuchera Primo® 'Black Pearl'`).
- Create the real file at `src/content/plants/<slug>.md` (slug is cultivar-based,
  matching its siblings). The draft is auto-pruned on the next import run.

### 5. Short links — BEFORE signs
- `npm run gen:shortlinks` creates a Shlink short URL (`s.shymoose.com/XXXX`)
  and writes `shortUrl:` back into the plant's frontmatter. Needs
  `SHLINK_API_KEY` in `.env` (already present; `.env` is gitignored — never
  commit or echo the key). Idempotent: only plants missing `shortUrl` change.

### 6. Signs — AFTER short links
- `npm run gen:signs` generates `signs/<slug>.scad` (OpenSCAD QR sign). It MUST
  run **after** `gen:shortlinks`, because the QR embeds the `shortUrl`. Skip the
  order and the QR falls back to the long URL — it works but defeats the point
  of the short links on the physical signs.
- Do not hand-edit `signs/*.scad` — `gen:signs` overwrites them. If a name is
  too long for the physical sign, encode the shorter text in the override tables
  at the top of `scripts/gen-signs.mjs` (`SIGN_NAME`, `SIGN_LATIN`, `PLAQUE_W`,
  keyed by the plant's slug). That way regeneration *reproduces* the intended
  sign instead of reverting it. Before committing regenerated signs, confirm the
  only diffs are ones you meant to make — never assume an unexpected sign change
  is "stale"; it may be a deliberate hand/override tweak.

### 7. Build, then commit EVERYTHING
- `npm run build` to verify the collection and images validate.
- Commit the `.md`, the photo, the new `signs/<slug>.scad`, and the frontmatter
  `shortUrl` change together. `npm run publish` runs build + gen:shortlinks +
  gen:signs in the correct order as a convenience.

## Definition of done
A new plant is finished only when it has: researched-and-reconciled care data,
a verified+credited photo, a `shortUrl` in its frontmatter, a `signs/<slug>.scad`
file whose QR uses that short URL, a clean build, and a single commit containing
all of the above.

## Environment notes
- Node >= 22, Windows PowerShell. Chain commands with `;`, not `&&`.
- `.env` holds `PLANTS_SHEET_CSV_URL` and `SHLINK_API_KEY`; it is gitignored.
- The `.astro` data-store cache is gitignored; if you see phantom duplicate-id
  warnings, delete `.astro/data-store.json` and rebuild.
