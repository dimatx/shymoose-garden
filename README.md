# 🌿 ShyMoose Garden

A small, fast static web app that catalogs the plants in the ShyMoose garden.
Each plant has a page with a photo, names, a description, and care details. Scan
a QR code next to a plant in the garden and it opens that plant's page on
**[garden.shymoose.com](https://garden.shymoose.com)**.

## Stack

- **[Astro](https://astro.build)** — static site, ships almost no JavaScript, so
  pages load instantly on mobile data.
- **Content Collections** — every plant is one Markdown file in
  [`src/content/plants/`](src/content/plants/), validated at build time.
- **[Tailwind CSS v4](https://tailwindcss.com)** — clean, responsive, mobile-first UI.
- **Light / dark mode** — follows the device setting, with a manual toggle.
- **[Cloudflare Pages](https://pages.cloudflare.com)** — hosting + custom domain.
- **[Shlink](https://shlink.io)** — self-hosted short links at `s.shymoose.com`
  embedded in each physical sign's QR code.

## Project structure

```text
src/
  content/plants/      One Markdown file per plant (the data you edit most).
  content.config.ts    The plant schema — what fields a plant file can have.
  assets/plants/       Plant photos, optimized at build time.
  lib/plants.ts        Shared data helpers: sorting, page URLs, timeline rows.
  components/
    Icon.astro         Central registry of every inline SVG icon.
    PlantCard.astro    A plant tile on the home grid.
    MonthCalendar.astro 12-month chart shared by Bloom and Pruning.
    ThemeToggle.astro  Light/dark switch.
  layouts/Layout.astro Page shell: <head>, header nav, footer, theme script.
  pages/
    index.astro        Home grid + search/filter bar.
    plants/[slug].astro A single plant page (one per Markdown file).
    bloom.astro         Bloom timeline.
    pruning.astro       Pruning calendar.
    404.astro
  styles/global.css    Theme tokens (the leaf color palette) and base styles.
public/
  _headers             Security + caching headers for Cloudflare Pages.
  robots.txt
scripts/
  import-plants.mjs    Pull new plants from the Google Sheet into draft files.
  gen-shortlinks.mjs   Create Shlink short URLs and write them back to frontmatter.
  gen-signs.mjs        Generate per-plant OpenSCAD sign files from the template.
  plant-sign-template.scad  OpenSCAD template used by gen-signs.
signs/                 Generated OpenSCAD files — one per plant, ready to 3D-print.
```

The two pieces of shared logic worth knowing:

- **[`src/lib/plants.ts`](src/lib/plants.ts)** is the single place that reads the
  plant collection. `getSortedPlants()` (alphabetical home order), `getCalendarRows()` (bloom
  and pruning charts), and `plantUrl()` all live here, so the rules stay
  consistent across every page.
- **[`src/components/Icon.astro`](src/components/Icon.astro)** holds every SVG
  icon in one labeled map. Use one anywhere with `<Icon name="leaf" />`; add a
  new icon by adding a single entry to that file.

## Add or edit a plant

This is the part you'll do most. No coding required.

1. **Add a photo.** Drop a `.jpg`/`.png` into
   [`src/assets/plants/`](src/assets/plants/) (e.g. `lavandula-angustifolia.jpg`).
2. **Copy an existing plant file.** Duplicate any file in
   [`src/content/plants/`](src/content/plants/) and rename it.
   **Files are named after the Latin name** (lowercase, hyphens, no punctuation),
   so `lavandula-angustifolia.md` → `garden.shymoose.com/plants/lavandula-angustifolia/`.
3. **Edit the fields** at the top (the part between the `---` lines):

   ```yaml
   ---
   name: "Lavender"                              # Common name
   latinName: "Lavandula angustifolia"           # Botanical name
   type: "Perennial"                             # Powers the home-page type filter
   nativeRange: "Mediterranean region"           # Optional — shown in care details
   photo: "../../assets/plants/lavandula-angustifolia.jpg"
   photoAlt: "Rows of purple lavender in bloom."
   photoCredit: "Your name"                      # Optional
   shortDescription: "The short blurb shown first."  # ~1–2 sentences
   funFact: "A surprising or delightful fact."   # Optional highlighted callout
   care:
     water: "..."
     soil: "..."
     sunlight: "..."
     hardiness: "..."   # Optional
     size: "..."        # Optional
     bloom: "..."       # Optional
     pruning: "..."     # Optional
   bloomMonths: [6, 7, 8]   # Months in flower (1=Jan). Drives the Bloom Timeline.
   pruneMonths: [3]          # Months to prune (1=Jan). Drives the Pruning Calendar.
   tags: ["Perennial", "Fragrant", "Pollinator friendly"]  # Optional filter pills
   learnMoreUrl: "https://..."   # Optional "Learn more" button
   shortUrl: "https://s.shymoose.com/..."  # Set automatically by gen:shortlinks
   ---
   ```

4. **Write the long description** *below* the `---`. This is the
   **"Keep reading"** content that's hidden until tapped. Use normal Markdown
   (headings, lists, **bold**, links, quotes).

That's the whole workflow — commit the change and Cloudflare rebuilds the site.

> Most fields are optional. Any care item you leave out simply won't show.
> `bloomMonths` and `pruneMonths` accept an array of integers 1–12; duplicates
> and out-of-order values are normalized automatically at build time.

## Filtering and sorting the garden

Search by common or Latin name, then sort by **Name (A–Z)** (the default) or
**Recently added** (newest `dateAdded` first). Equal dates keep alphabetical
order; plants without a recorded date appear last.

Search, filter selections, and sort order are remembered when opening a plant
and returning with browser Back or **All plants**. This is in-memory navigation
state only: reloading, opening a fresh page, or arriving from another section
starts with the default catalog. Explicit `?tag=` links still apply their tag.

The home page has a filter bar so visitors can narrow the catalog down:

- **Type** — one button per distinct `type` value used across your plants
  (e.g. `Perennial`, `Annual`, `Shrub`, `Vegetable`, `Succulent`). The buttons
  are generated from the data, so giving a plant a new `type` automatically
  adds a matching filter. Selecting several types widens the results (OR).
- **Traits** — a curated shortlist drawn from each plant's `tags`
  (e.g. `Evergreen`, `Drought tolerant`, `Pollinator friendly`). Selecting
  several traits narrows the results (AND). A trait button only appears if at
  least one plant carries that tag.

To make a characteristic filterable, add the matching tag to a plant's `tags`
list. The curated trait list lives in
[`src/pages/index.astro`](src/pages/index.astro) (the `traitCandidates` array)
if you want to add or reorder the trait buttons. The filtering itself runs in a
small no-framework script at the bottom of that same file, so the catalog still
works with JavaScript disabled (every plant just stays visible).

## Run it locally

```bash
npm install
npm run dev        # http://localhost:4321
```

Other commands:

```bash
npm run build      # production build into dist/
npm run preview    # preview the production build locally
npm run publish    # build + gen:shortlinks + gen:signs (full release workflow)
```

## Scripts

### Import plants from the Google Sheet

```bash
npm run import:plants
```

Reads the ShyMoose plants spreadsheet (publicly published as CSV), compares
rows against existing plant files, and writes scaffold Markdown files for any
new rows into `drafts/plants/`. Review each draft, add a photo, fill in the
`TODO` fields, and move it to `src/content/plants/` when ready. Re-running is
safe — already-cataloged plants are skipped.

### Generate short links

```bash
SHLINK_API_KEY=<key> npm run gen:shortlinks
```

For every plant that doesn't already have a `shortUrl` in its frontmatter,
creates a short link at `s.shymoose.com` (via the Shlink API) and writes it
back into the `.md` file. Idempotent — plants with an existing `shortUrl` are
skipped, and if Shlink already has a link for the same long URL it returns the
existing one rather than creating a duplicate.

Optional env vars: `SHLINK_BASE_URL`, `SITE_URL`, `DRY_RUN=1`.

### Generate physical signs

Signs use short common names without cultivars; website names are unchanged.
The generator removes trailing quoted cultivars automatically and uses
`SIGN_NAME` overrides for unquoted prefixes and other short labels. Cultivar
identification stays on the Latin line.

```bash
npm run gen:signs
```

Reads every plant in `src/content/plants/` and writes a corresponding
`.scad` file to `signs/` by substituting the plant's `shortUrl`, common name,
and Latin name into [`scripts/plant-sign-template.scad`](scripts/plant-sign-template.scad).

The resulting `.scad` files are ready to open in
[OpenSCAD](https://openscad.org/) and render/export for 3D printing. Each sign
is a two-color plaque (white body, black inlay text and QR code) with a stake
leg. Set `DRY_RUN=1` to preview what would be generated without writing files.

## Physical signs

Each plant in the garden has a 3D-printed sign. The sign body encodes:

- The plant's **common name** and **Latin name** in engraved text.
- A **QR code** that points to the plant's Shlink short URL
  (`s.shymoose.com/…`), which in turn redirects to the full plant page.
  Using a short URL keeps the QR code small and easy to scan.

The OpenSCAD files in [`signs/`](signs/) are generated — do not edit them by
hand. To regenerate after adding or changing plants, run `npm run gen:signs`
(or `npm run publish`, which does it as part of the full release workflow).

## QR codes

Each plant's page URL follows the pattern:

```text
https://garden.shymoose.com/plants/<latin-name-slug>/
```

For example: `https://garden.shymoose.com/plants/viburnum-plicatum/`.

In practice the QR codes on physical signs use the shorter `s.shymoose.com`
redirect so the code is smaller and the destination URL can be updated without
reprinting. Run `npm run gen:shortlinks` to create short links for new plants.

## Deploy to Cloudflare Pages

1. Push this repo to GitHub (already at `dimatx/shymoose-garden`).
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**,
   and pick this repository.
3. Build settings:
   - **Framework preset:** Astro
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Deploy. Then under **Custom domains**, add `garden.shymoose.com`
   (Cloudflare will add the `CNAME` for you if the zone is on Cloudflare).

Every push to the default branch triggers a new build and deploy. The build
also generates a sitemap at `/sitemap-index.xml` automatically.
