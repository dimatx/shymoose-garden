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
    MonthTimeline.astro 12-month chart shared by Bloom and Pruning.
    ThemeToggle.astro  Light/dark switch.
  layouts/Layout.astro Page shell: <head>, header nav, footer, theme script.
  pages/
    index.astro        Home grid + search/filter bar.
    plants/[slug].astro A single plant page (one per Markdown file).
    bloom.astro         Bloom timeline.
    pruning.astro       Pruning calendar.
    404.astro
  styles/global.css    Theme tokens (the leaf color palette) and base styles.
public/_headers        Security + caching headers for Cloudflare Pages.
```

The two pieces of shared logic worth knowing:

- **[`src/lib/plants.ts`](src/lib/plants.ts)** is the single place that reads the
  plant collection. `getSortedPlants()` (home order), `getTimelineRows()` (bloom
  and pruning charts), and `plantUrl()` all live here, so the rules stay
  consistent across every page.
- **[`src/components/Icon.astro`](src/components/Icon.astro)** holds every SVG
  icon in one labeled map. Use one anywhere with `<Icon name="leaf" />`; add a
  new icon by adding a single entry to that file.

## Add or edit a plant

This is the part you'll do most. No coding required.

1. **Add a photo.** Drop a `.jpg`/`.png` into
   [`src/assets/plants/`](src/assets/plants/) (e.g. `lavender.jpg`).
2. **Copy an existing plant file.** Duplicate
   [`src/content/plants/japanese-snowball.md`](src/content/plants/japanese-snowball.md)
   and rename it. **The file name becomes the page URL**, so
   `lavender.md` → `garden.shymoose.com/plants/lavender/`.
3. **Edit the fields** at the top (the part between the `---` lines):

   ```yaml
   ---
   name: "Lavender" # Common name
   latinName: "Lavandula angustifolia" # Botanical name
   type: "Perennial" # Plant type — powers the home-page filter
   photo: "../../assets/plants/lavender.jpg" # Path to your photo
   photoAlt: "Rows of purple lavender in bloom."
   photoCredit: "Your name (optional)"
   shortDescription: "The short blurb shown first." # ~1–2 sentences
   care:
     water: "..."
     soil: "..."
     sunlight: "..."
     hardiness: "..." # optional
     size: "..." # optional
     bloom: "..." # optional
   tags: ["Perennial", "Fragrant"] # optional pills
   order: 2 # optional — lower numbers sort first
   learnMoreUrl: "https://..." # optional "Learn more" button
   ---
   ```

4. **Write the long description** *below* the `---`. This is the
   **"Keep reading"** content that's hidden until tapped. Use normal Markdown
   (headings, lists, **bold**, links, quotes).

That's the whole workflow — commit the change and Cloudflare rebuilds the site.

> Fields like `hardiness`, `size`, `bloom`, `tags`, and `learnMoreUrl` are
> optional. Any care item you leave out simply won't show.

## Filtering the garden

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
```

## QR codes

Each plant's QR code should point at its page URL:

```text
https://garden.shymoose.com/plants/<file-name>/
```

For the first plant that's
`https://garden.shymoose.com/plants/japanese-snowball/`.

Generate a printable QR code with no extra setup:

```bash
npx qrcode "https://garden.shymoose.com/plants/japanese-snowball/" -o japanese-snowball-qr.png
```

(You can also use any QR generator — the only thing that matters is the URL.)

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

Every push to the default branch triggers a new build and deploy.
