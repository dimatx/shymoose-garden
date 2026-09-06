#!/usr/bin/env node
/**
 * Generates OpenSCAD plant sign files for every plant in src/content/plants/.
 * Reads the template at scripts/plant-sign-template.scad and replaces the
 * three per-plant variables (qr_url, common_name, scientific_name) for each plant.
 *
 * Output: signs/<slug>.scad
 *
 * Usage:
 *   node scripts/gen-signs.mjs
 *   DRY_RUN=1 node scripts/gen-signs.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, globSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DRY_RUN = process.env.DRY_RUN === '1';

// Escape a value for use inside an OpenSCAD double-quoted string
function escapeScad(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

// Convert a latin name to a kebab-case filename slug.
// e.g. "Calendula officinalis 'Geisha Girl'" → "calendula-officinalis-geisha-girl"
function latinToSlug(latin) {
  return latin
    .toLowerCase()
    .replace(/[''®.]/g, '')       // drop apostrophes, ®, periods
    .replace(/[^a-z0-9]+/g, '-')  // non-alphanumeric runs → hyphen
    .replace(/^-+|-+$/g, '');     // trim leading/trailing hyphens
}

// Read the template
const templatePath = join(__dirname, 'plant-sign-template.scad');
const template = readFileSync(templatePath, 'utf8');

// Ensure output directory exists
const signsDir = join(ROOT, 'signs');
if (!DRY_RUN) {
  mkdirSync(signsDir, { recursive: true });
}

// Per-plant latin name override for the sign.
// When set, this replaces the latinName field on the sign only (frontmatter is unchanged).
const SIGN_LATIN = {
  'solanum-lycopersicum-bumble-bee-purple':  "S. lycopersicum 'Bumble Bee Purple'",
  'solanum-lycopersicum-bumble-bee-sunrise': "S. lycopersicum 'Bumble Bee Sunrise'",
  'solanum-lycopersicum-carbon':             "S. lycopersicum 'Carbon'",
  'solanum-lycopersicum-ukrainian-purple':   "S. lycopersicum 'Ukrainian Purple'",
  // Heuchera: shortened to fit the physical sign (full latinName overflows).
  'heuchera-dolce-silver-gumdrop':           "Heuchera 'Dolce\u00ae Silver Gumdrop'",
  'heuchera-primo-black-pearl':              "Heuchera 'Primo\u00ae Black Pearl'",
  'heuchera-primo-pistachio-ambrosia':       "Heuchera 'Primo\u00ae Pistachio Ambrosia'",
};

// Per-plant common name override for the sign.
// When set, this replaces the name field on the sign only (latin name is unchanged).
const SIGN_NAME = {
  // Unquoted cultivar prefixes need explicit short labels.
  'cercis-canadensis-flame-thrower':        'Eastern Redbud',
  'karen-azelia':                          'Azalea',
  'taxus-x-media-hm-eddie':                 'Yew',
  'thuja-occidentalis-emerald':             'Arborvitae',
  'cucumis-sativus-shintokiwa':              'Cucumber',
  'cucumis-sativus-suyo-long':               'Cucumber',
  'cucumis-sativus-unagi':                   'Cucumber',
  'solanum-lycopersicum-bumble-bee-purple':  'Tomato',
  'solanum-lycopersicum-bumble-bee-sunrise': 'Tomato',
  'solanum-lycopersicum-carbon':             'Tomato',
  'solanum-lycopersicum-ukrainian-purple':   'Tomato',
  'chamaecyparis-pisifera-golden-mop':       'False Cypress',
  'penstemon-hartwegii-arabesque-red':       'Beardtongue',
  'penstemon-digitalis-huskers-red':         'Beardtongue',
  'penstemon-dark-towers':                  'Beardtongue',
  'achillea-millefolium-tutti-frutti':       'Yarrow',
  'achillea-millefolium-new-vintage-red':    'Yarrow',
  // Heuchera: drop the cultivar from the common name so it fits the sign.
  'heuchera-dolce-silver-gumdrop':           'Coral Bells',
  'heuchera-primo-black-pearl':              'Coral Bells',
  'heuchera-primo-pistachio-ambrosia':       'Coral Bells',
  'heuchera-dolce-cherry-truffles':          'Coral Bells',
  // Japanese maples: web display names carry the cultivar, but the physical
  // signs stay the shorter "Japanese Maple" (the latin line gives the cultivar).
  'acer-palmatum-crimson-queen':             'Japanese Maple',
  'acer-palmatum-inaba-shidare':             'Japanese Maple',
  'acer-palmatum-tamukeyama':                'Japanese Maple',
  // Variegated Japanese red pine: cultivar lives on the latin line.
  'pinus-densiflora-golden-ghost':           'Japanese Red Pine',
  // Leopard plant cultivar: drop the cultivar from the common name so it
  // fits the sign (latin line carries 'Osiris Fantaisie').
  'ligularia-dentata-osiris-fantaisie':      'Leopard Plant',
  // Little bluestem cultivar: drop the cultivar from the common name so it
  // fits the sign (latin line carries 'Standing Ovation').
  'schizachyrium-scoparium-standing-ovation': 'Little Bluestem',
};

// Per-plant plaque_w overrides (mm). Minimum is 175.
// Primary text (~9mm/char Barlow Condensed Bold) and secondary latin text
// (~4.5mm/char Barlow Condensed Italic) both checked. text_width = plaque_w - 39.
// When a slug is NOT listed here, calcPlaqueW() computes the width automatically.
function calcPlaqueW(signName, signLatin) {
  const primaryW = signName.length * 9;
  const latinW   = signLatin.length * 4.5;
  return Math.max(175, Math.ceil(Math.max(primaryW, latinW) + 39));
}

const PLAQUE_W = {
  // Width driven by common name length (latin is small text, not a constraint)
  'hylotelephium-telephium':                 175, // Orpine
  'actaea-racemosa':                         175, // Black Cohosh
  'ligularia-dentata':                       175, // Leopard Plant
  'salvia-nemorosa':                         175, // Woodland Sage
  'cercis-canadensis':                       175, // Eastern Redbud
  'ilex-crenata':                            175, // Japanese Holly
  'physostegia-virginiana':                  175, // Obedient Plant
  'hibiscus-syriacus-notwoodthree':          175, // Rose of Sharon
  'calendula-officinalis-geisha-girl':       175, // sign says "Calendula"
  // Cucumbers: common name is "Cucumber"; latin "Cucumis sativus '...'"
  'cucumis-sativus-unagi':                   175,
  'cucumis-sativus-suyo-long':               175,
  'cucumis-sativus-shintokiwa':              175,
  // Tomatoes: common name is "Tomato"; latin is now "S. lycopersicum '...'"
  'solanum-lycopersicum-carbon':             175,
  'solanum-lycopersicum-ukrainian-purple':   175,
  'solanum-lycopersicum-bumble-bee-purple':  175,
  'solanum-lycopersicum-bumble-bee-sunrise': 175,
  'helleborus-argutifolius':                 185, // Green Hellebore
  'pieris-japonica':                         185, // Japanese Pieris
  'hylotelephium-spectabile':                185, // Showy Stonecrop
  'anacis-verticillata-zagreb':              185, // Zagreb
  'phedimus-aizoon':                         190, // Aizoon Stonecrop
  'spiraea-japonica':                        190, // Japanese Spiraea
  'veronica-spicata':                        190, // Speedwell
  'viburnum-plicatum':                       200, // Japanese Snowball
  'thuja-occidentalis-emerald':              205, // Arborvitae
  'picea-pungens-pendula':                   210, // Weeping Blue Spruce
  'polygonatum-biflorum-var-commutatum':     215, // Giant Solomon's Seal
  'rhododendron-dauricum':                   225, // Dahurian Rhododendron
  'picea-pungens-glauca-globosa':             195, // "Globe Blue Spruce" (17 chars)
  'penstemon-hartwegii-arabesque-red':       175, // "Beardtongue" (11 chars)
  'chamaecyparis-pisifera-golden-mop':       175, // "False Cypress" (13 chars)
  // Heuchera: shortened name + latin, held at the 175 minimum to fit the sign.
  'heuchera-dolce-silver-gumdrop':           175,
  'heuchera-primo-black-pearl':              175,
  'heuchera-primo-pistachio-ambrosia':       175,
  // Leopard plant: shortened name held at the minimum to fit the sign.
  'ligularia-dentata-osiris-fantaisie':      175,
  // Preserve the manually tuned widths in the published SCAD files.
  'baptisia-decadence-lemon-meringue':       190,
  'hydrangea-quercifolia-alice':             220,
  'picea-sitchensis-silberzwerg':            180,
  'schizachyrium-scoparium-standing-ovation': 210,
  'tsuga-canadensis-moon-frost':             200,
  'veronica-pink-potion':                    190,
  'veronica-purple-illusion':                190,
};

// Glob all plant markdown files
const plantFiles = globSync('src/content/plants/*.md', { cwd: ROOT });
plantFiles.sort();

let generated = 0;
let skipped = 0;
const writtenFiles = new Set();

for (const relPath of plantFiles) {
  const slug = basename(relPath, '.md');
  const fullPath = join(ROOT, relPath);
  const md = readFileSync(fullPath, 'utf8');

  // Extract frontmatter fields
  const nameMatch = md.match(/^name:\s*["']?(.+?)["']?\s*$/m);
  const latinMatch = md.match(/^latinName:\s*["']?(.+?)["']?\s*$/m);
  const shortUrlMatch = md.match(/^shortUrl:\s*["']?(.+?)["']?\s*$/m);

  if (!nameMatch || !latinMatch) {
    console.warn(`[SKIP] ${slug}: missing name or latinName`);
    skipped++;
    continue;
  }

  const name = nameMatch[1].trim();
  const latinName = latinMatch[1].trim();
  const shortUrl = shortUrlMatch ? shortUrlMatch[1].trim() : `https://garden.shymoose.com/plants/${slug}`;

  // Website names can carry a quoted cultivar; the sign's Latin line already
  // identifies it. Match the whole suffix, including apostrophes in cultivars.
  const signName = SIGN_NAME[slug] ?? name.replace(/\s+'.*'$/, '');
  const signLatin = SIGN_LATIN[slug] ?? latinName;
  // Replace the per-plant variable lines in the template
  const plaqueW = PLAQUE_W[slug] ?? calcPlaqueW(signName, signLatin);
  const scad = template
    .replace(/^qr_url = ".*";$/m, `qr_url = "${escapeScad(shortUrl)}";`)
    .replace(/^common_name = ".*";$/m, `common_name = "${escapeScad(signName)}";`)
    .replace(/^scientific_name = ".*";$/m, `scientific_name = "${escapeScad(signLatin)}";`)
    .replace(/^plaque_w = \d+;$/m, `plaque_w = ${plaqueW};`);

  const outFilename = `${latinToSlug(latinName)}.scad`;
  const outPath = join(signsDir, outFilename);

  const widthNote = `  [plaque_w=${plaqueW}]`;
  const nameNote = signName !== name ? `  [name: "${signName}"]` : '';
  const latinNote = signLatin !== latinName ? `  [latin: "${signLatin}"]` : '';
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would write: signs/${outFilename}  (${name} / ${latinName})${nameNote}${latinNote}${widthNote}`);
  } else {
    writeFileSync(outPath, scad, 'utf8');
    writtenFiles.add(outFilename);
    console.log(`[OK] signs/${outFilename}  (${name} / ${latinName})${nameNote}${latinNote}${widthNote}`);
  }
  generated++;
}

console.log(`\nDone: ${generated} signs ${DRY_RUN ? 'would be ' : ''}generated, ${skipped} skipped.`);

// Remove any stale .scad files left over from the old slug-based naming
if (!DRY_RUN) {
  const existing = readdirSync(signsDir).filter(f => f.endsWith('.scad'));
  for (const f of existing) {
    if (!writtenFiles.has(f)) {
      rmSync(join(signsDir, f));
      console.log(`[REMOVED stale] signs/${f}`);
    }
  }
}
