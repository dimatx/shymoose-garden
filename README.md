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
  lib/catalog.ts       Browser-safe catalog ordering, covered by unit tests.
  lib/calendar-order.ts Browser/server calendar ordering and month arithmetic.
  lib/build-info.ts    Build timestamp/revision, computed once per build.
  components/
    Icon.astro         Central registry of every inline SVG icon.
    PlantCard.astro    A plant tile on the home grid.
    MonthCalendar.astro 12-month chart shared by Bloom and Pruning.
    ThemeToggle.astro  Light/dark switch.
    QRScanner.astro    Lazy-loaded camera scanner and modal lifecycle.
  layouts/Layout.astro Page shell: <head>, header nav, footer, theme script.
  scripts/             Browser feature controllers (QR scanner, beta map).
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
tests/                 Native Node regression tests (no network or credentials).
  e2e/                 Playwright checks against a production preview.
```

The two pieces of shared logic worth knowing:

- **[`src/lib/plants.ts`](src/lib/plants.ts)** centralizes collection queries for
  listings. `getSortedPlants()` (alphabetical home order), `getCalendarRows()` (bloom
  and pruning charts), and `plantUrl()` all live here, so the rules stay
  consistent across every page.
- **[`src/components/Icon.astro`](src/components/Icon.astro)** holds every SVG
  icon in one labeled map. Use one anywhere with `<Icon name="leaf" />`; add a
  new icon by adding a single entry to that file.

## Add or edit a plant

This is the part you'll do most. No coding required.

**Read [AGENTS.md](AGENTS.md) first.** The steps below explain the content
format, not the complete publishing pipeline. New plants also require
multi-source care research, a verified/credited high-resolution photo,
short links, and matching SCAD/3MF signs.

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

After editing, run `check:photos`, then `gen:shortlinks`, then `gen:signs`,
then `gen:3mf -- <new-sign-slug>` for only the new signs, and finally `build`.
Review all generated diffs. Publish the content, photo, short URL, SCAD and 3MF
together as described in AGENTS.md. Pushing to `main` deploys to Cloudflare;
local checks alone do not deploy.

> Most fields are optional. Any care item you leave out simply won't show.
> `bloomMonths` and `pruneMonths` accept an array of integers 1–12; duplicates
> and out-of-order values are normalized automatically at build time.

## Filtering and sorting the garden

Search by common name, Latin name, or tag, then sort by **Name (A–Z)** (the
default), **Name (Z–A)**, **Recently added**, or **Oldest first**. Equal dates
keep alphabetical order; plants without a recorded date appear last in both
date modes. Archived plants always follow active plants.

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
npm run publish    # gen:shortlinks + gen:signs + build (3MF export is separate)
```

## Safe development and validation

Use Node 22.18 or newer (unit tests use native TypeScript stripping).
After changing dependencies, run `npm ci` to verify the lockfile, not only
`npm install`. Do not override this machine's npm registry; see AGENTS.md.
Cloudflare currently installs with npm 10.9.2; CI uses the same installer.
After dependency changes, also check a clean directory containing only the
two package manifests with `npx --yes npm@10.9.2 ci --ignore-scripts`.
An npm 11 install with an existing `node_modules` directory is not sufficient
to detect missing dependencies for other platforms. `npm test` includes a
lockfile regression for those missing entries.

```powershell
npm ci
npm run check       # Astro + TypeScript diagnostics
npm test            # isolated unit/script regressions; no .env or API calls
npm run build
npx playwright install chromium  # once per Playwright browser version
npm run test:e2e    # desktop/mobile Chromium against dist/ on port 4322
```

The browser runner starts and stops its own preview server. Rebuild before
running it after source changes. `.github/workflows/validate.yml` runs these
checks for pull requests and pushes to `main`, without publishing, creating
short links, or rendering signs. Cloudflare deployment remains separate;
this workflow does not gate Cloudflare's push-triggered builds.

Keep pure rules in `src/lib/`, with Node regression tests. Browser features
must initialize idempotently on `astro:page-load` and release document
listeners, observers, timers, and device streams when Astro replaces the
page. Keep large optional libraries (Leaflet and jsQR) behind dynamic imports.
Prefer focused components over growing the shared layout. Production styles
use Astro's automatic inlining threshold so large shared CSS can be cached
across navigations rather than repeated in every HTML page.

The garden map remains opt-in with `?beta`; navigation links retain that
flag. GPS stays unavailable until the reference points in
`src/lib/geoCalibration.ts` are configured.

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

Drafts also count as known plants, so repeated or reordered sheet rows do not
create duplicate drafts. Invalid CSV/required headers stop the import before
any published-draft pruning.

### Generate short links

```powershell
npm run gen:shortlinks
```

The command reads `SHLINK_API_KEY` from the ignored local `.env` file.
Never commit or print that file.

For every plant that doesn't already have a `shortUrl` in its frontmatter,
creates a short link at `s.shymoose.com` (via the Shlink API) and writes it
back into the `.md` file. Idempotent — plants with an existing `shortUrl` are
skipped, and if Shlink already has a link for the same long URL it returns the
existing one rather than creating a duplicate.

Optional env vars: `SHLINK_BASE_URL`, `SITE_URL`, `DRY_RUN=1`.
The default Shlink connection uses HTTPS and requests have timeouts. Shared
frontmatter helpers preserve line endings and quoting; ambiguous scalar
fields fail explicitly instead of risking a malformed content rewrite.

`scripts/recover-shortlinks.mjs` is a separate disaster-recovery utility for
already-printed codes, not part of normal publishing. It verifies the
destination of an existing code and reports conflicts instead of silently
accepting or overwriting a link to the wrong plant.

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
is a two-color plaque (white body, black inlay text and QR code) with sockets
for separate stakes. Set `DRY_RUN=1` to preview what would be generated without writing files.
All plant inputs and output-name collisions are checked before writing or
pruning signs, so invalid content cannot remove an existing sign.

### Export 3MF models for PrusaSlicer

```powershell
npm run gen:signs
# Export one sign by its SCAD filename (the extension is optional):
npm run gen:3mf -- tsuga-canadensis-moon-frost
# Re-render even if the source and output are unchanged:
npm run gen:3mf -- --force tsuga-canadensis-moon-frost
```

Writes one **model-only** `.3mf` per SCAD file into [`signs/3mf/`](signs/3mf/),
prefixed with that plant's number from the ShyMoose sheet's `Filename` column
(e.g. `74_tsuga-canadensis-moon-frost.3mf`) so it's easy to find the right
model to print. The plant is matched to its sheet row by `Full link`, falling
back to Latin name; a plant the script can't match keeps its plain slug name
and is listed in a `[WARN]` at the end. Requires `PLANTS_SHEET_CSV_URL` in
`.env` (same as `npm run import:plants`) — without it, files keep their slug
name. Open these files in PrusaSlicer as models, choose your printer and
filament, configure the color change, and slice. They are not PrusaSlicer
projects and contain no printer profiles, filament assignments, or G-code.
MakerWorld is not needed.

Install [OpenSCAD](https://openscad.org/downloads.html) first. A recent desktop
build with the Manifold backend is recommended for faster batch rendering
(the initial exports used Windows snapshot 2026.09.03). The script searches
portable `OpenSCAD*` folders inside `.tools/`, then PATH, standard Windows
installation folders, and the standard macOS app location. Alternatively:

```powershell
$env:OPENSCAD_BIN = 'C:\Program Files\OpenSCAD\openscad.com'
npm run gen:3mf
```

On Windows, use the console executable `openscad.com`. A portable ZIP can be
extracted into `.tools/` without a global installation. The required Barlow
Condensed fonts and their OFL license are bundled in `scripts/fonts/`; the
exporter registers them without installing system fonts.

The export preserves the SCAD's millimeter scale and face-down orientation.
PrusaSlicer places the imported model on the bed. The current design has a
1 mm face inlay: inspect the sliced layers and set your filament change at
the corresponding transition. SCAD display colors do not add color-change
instructions. The separate stake-leg calls are disabled in the current SCAD;
these files contain the plaque, sockets, and stabilizer, not loose stakes.

Unchanged exports are skipped using hashes of the SCAD, renderer version,
export script, fonts, and output file. The local `signs/3mf/.cache.json` is
ignored by Git; the finished 3MFs are committed. A fresh checkout without
that cache renders again. Warnings and render failures stop the command
without replacing that sign's previous output; completed files are cached
so a later run can resume. Old exports are never automatically deleted.

For new plants, always pass just the new sign slugs. An unscoped export can
rewrite unrelated committed models on a machine with a different renderer
or no local cache; reserve it for intentional whole-sign regeneration.

Run this command **after** `gen:signs` whenever sign geometry or text changes,
and commit the changed SCAD and 3MF files together. It is deliberately
separate from the website build and `publish` command: Cloudflare does not
need OpenSCAD to build the site.

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
