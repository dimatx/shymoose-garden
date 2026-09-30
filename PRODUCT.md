# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Owners, family, and guests in the ShyMoose garden, usually on a phone, standing next to a plant after scanning the QR code on its sign. They want to know what the plant is, how to care for it, when it blooms or needs pruning, and whether it is safe around dogs. The owner also uses the site as a care reference and the catalog's maintainer.

## Product Purpose
A living catalog of the plants in the ShyMoose garden (about 117 plants). Each plant has a page with a verified, credited photo, names, care data reconciled across reputable sources, and bloom and pruning timing. Success is a fast, accurate answer at the plant, and a catalog that stays correct as the garden changes. It is a personal project, not a business.

## Positioning
A physical-to-digital garden guide: 3D-printed signs carry QR codes (Shlink short links at `s.shymoose.com`) that open the page for exactly that plant at `garden.shymoose.com`. It documents one specific garden, not plants in general.

## Operating Context
- Mostly mobile, often outdoors, on mobile data; pages must load quickly.
- Static Astro site on Cloudflare Pages; one Markdown file per plant in `src/content/plants/`, validated by a schema.
- Plants are added through the pipeline in `AGENTS.md`: import, multi-source research, verified photo, short link, sign, build.
- Home grid with search, sort, and filters; bloom and pruning calendars; in-app QR scanner; optional garden map.

## Capabilities and Constraints
- Every plant requires a photo (`photo: image()`), with credit where the license requires it.
- Dog toxicity ("Highly toxic") is safety information and must stay visible.
- The garden map is a beta feature, gated behind `?beta`, and must stay gated until it is ready.
- Light and dark mode, following the device setting with a manual toggle.
- Physical signs use short common names without cultivars; website names include the cultivar.
- Undecided: whether the map will be made public, and whether it gets a GPS "locate me" feature.

## Brand Commitments
The name is "ShyMoose Garden". Existing assets are the sprout logo mark and the favicon and PWA icons in `public/`. The tone is warm and personal ("Grown with care in the ShyMoose garden"). No other visual commitments have been made binding.

## Evidence on Hand
Real plant photos in `src/assets/plants/`, real care data in `src/content/plants/`, and 3D-printable signs in `signs/`. There are no testimonials, customers, press, or metrics, and none should be invented.

## Product Principles
1. Accuracy over polish: care data comes from reputable sources and photos are verified.
2. Phone-first, at the plant: fast, scannable, readable outdoors.
3. Safety info is never buried: dog toxicity stays visible.
4. The catalog mirrors the real garden: one page per real plant, with signs and short links that match.
5. Keep it light: almost no JavaScript, and optional features (map, scanner) load lazily.

## Accessibility & Inclusion
No formal standard is set. Working target is WCAG AA, including readable contrast outdoors. The September 2026 audit found gaps: low-contrast small text, an unnamed toxicity badge, and undersized touch targets.
