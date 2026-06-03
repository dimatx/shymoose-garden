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

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DRY_RUN = process.env.DRY_RUN === '1';

// Escape a value for use inside an OpenSCAD double-quoted string
function escapeScad(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
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
  'tomato-bumble-bee-purple':  "S. lycopersicum 'Bumble Bee Purple'",
  'tomato-bumble-bee-sunrise': "S. lycopersicum 'Bumble Bee Sunrise'",
  'tomato-carbon':             "S. lycopersicum 'Carbon'",
  'tomato-ukrainian-purple':   "S. lycopersicum 'Ukrainian Purple'",
};

// Per-plant common name override for the sign.
// When set, this replaces the name field on the sign only (latin name is unchanged).
const SIGN_NAME = {
  'cucumber-shintokiwa':       'Cucumber',
  'cucumber-suyo-long':        'Cucumber',
  'cucumber-unagi':            'Cucumber',
  'tomato-bumble-bee-purple':  'Tomato',
  'tomato-bumble-bee-sunrise': 'Tomato',
  'tomato-carbon':             'Tomato',
  'tomato-ukrainian-purple':   'Tomato',
};

// Per-plant plaque_w overrides (mm). Minimum is 175.
// Primary text (~9mm/char Barlow Condensed Bold) and secondary latin text
// (~4.5mm/char Barlow Condensed Italic) both checked. text_width = plaque_w - 39.
const PLAQUE_W = {
  // Width driven by common name length (latin is small text, not a constraint)
  'orpine':                     175,
  'black-cohosh':               175,
  'leopard-plant':              175,
  'woodland-sage':              175,
  'eastern-redbud':             175, // confirmed
  'japanese-holly':             175,
  'obedient-plant':             175,
  'rose-of-sharon':             175, // 14-char common name; latin is small text
  'marigold':                   175, // sign says "Calendula"; latin is small text
  // Cucumbers: common name is "Cucumber"; latin "Cucumis sativus '...'"
  'cucumber-unagi':             175,
  'cucumber-suyo-long':         175,
  'cucumber-shintokiwa':        175,
  // Tomatoes: common name is "Tomato"; latin is now "S. lycopersicum '...'"
  'tomato-carbon':              175,
  'tomato-ukrainian-purple':    175,
  'tomato-bumble-bee-purple':   175,
  'tomato-bumble-bee-sunrise':  175,
  'green-hellebore':            185,
  'japanese-pieris':            185,
  'showy-stonecrop':            185,
  'zagreb':                     185,
  'aizoon-stonecrop':           190,
  'japanese-spiraea':           190,
  'speedwell':                  190,
  'japanese-snowball':          200, // confirmed
  'arborvitae':                 205,
  'weeping-blue-spruce':        210,
  'giant-solomons-seal':        215, // confirmed
  'dahurian-rhododendron':      225,
  'penstemon':                  235, // "Arabesque Red Penstemon" (23 chars)
  'false-cypress':              240, // "Golden Mop False Cypress" (24 chars)
};

// Glob all plant markdown files
const plantFiles = globSync('src/content/plants/*.md', { cwd: ROOT });
plantFiles.sort();

let generated = 0;
let skipped = 0;

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

  const signName = SIGN_NAME[slug] ?? name;
  const signLatin = SIGN_LATIN[slug] ?? latinName;
  // Replace the per-plant variable lines in the template
  const plaqueW = PLAQUE_W[slug] ?? 195;
  const scad = template
    .replace(/^qr_url = ".*";$/m, `qr_url = "${escapeScad(shortUrl)}";`)
    .replace(/^common_name = ".*";$/m, `common_name = "${escapeScad(signName)}";`)
    .replace(/^scientific_name = ".*";$/m, `scientific_name = "${escapeScad(signLatin)}";`)
    .replace(/^plaque_w = \d+;$/m, `plaque_w = ${plaqueW};`);

  const outPath = join(signsDir, `${slug}.scad`);

  const widthNote = plaqueW !== 195 ? `  [plaque_w=${plaqueW}]` : '';
  const nameNote = signName !== name ? `  [name: "${signName}"]` : '';
  const latinNote = signLatin !== latinName ? `  [latin: "${signLatin}"]` : '';
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would write: signs/${slug}.scad  (${name} / ${latinName})${nameNote}${latinNote}${widthNote}`);
  } else {
    writeFileSync(outPath, scad, 'utf8');
    console.log(`[OK] signs/${slug}.scad  (${name} / ${latinName})${nameNote}${latinNote}${widthNote}`);
  }
  generated++;
}

console.log(`\nDone: ${generated} signs ${DRY_RUN ? 'would be ' : ''}generated, ${skipped} skipped.`);
