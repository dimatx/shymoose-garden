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

// Per-plant plaque_w overrides (mm). Default in template is 195.
// Calibrated from confirmed values: Eastern Redbud (14 chars)=175,
// Japanese Snowball (17 chars)=200, Giant Solomon's Seal (20 chars)=215.
// Formula: max(145, round5(chars * 7 + 78)). Latin name width checked
// as secondary constraint (smaller text, ~3.4mm/char).
const PLAQUE_W = {
  // 6 chars — "Orpine"
  'orpine':                     145,
  // 9 chars — "Calendula" (latin "Calendula officinalis 'Geisha Girl'" drives min)
  'marigold':                   160,
  // 12 chars — "Black Cohosh"
  'black-cohosh':               160,
  // 13 chars — Leopard Plant, Carbon Tomato, Woodland Sage
  'leopard-plant':              170,
  'tomato-carbon':              170,
  'woodland-sage':              170,
  // 14 chars — Eastern Redbud, Unagi Cucumber, Japanese Holly, Obedient Plant, Rose of Sharon
  'eastern-redbud':             175, // confirmed
  'cucumber-unagi':             175,
  'japanese-holly':             175,
  'obedient-plant':             175,
  'rose-of-sharon':             175,
  // 15 chars — Green Hellebore, Japanese Pieris, Showy Stonecrop, Zagreb Tickseed
  'green-hellebore':            185,
  'japanese-pieris':            185,
  'showy-stonecrop':            185,
  'zagreb':                     185,
  // 16 chars — Aizoon Stonecrop, Japanese Spiraea, Spiked Speedwell
  'aizoon-stonecrop':           190,
  'japanese-spiraea':           190,
  'speedwell':                  190,
  // 17 chars — Globe Blue Spruce stays at default 195; Japanese Snowball confirmed 200
  'japanese-snowball':          200, // confirmed
  // 18 chars — Emerald Arborvitae, Suyo Long Cucumber
  'arborvitae':                 205,
  'cucumber-suyo-long':         205,
  // 19 chars — Shintokiwa Cucumber, Weeping Blue Spruce
  'cucumber-shintokiwa':        210,
  'weeping-blue-spruce':        210,
  // 20 chars — Giant Solomon's Seal
  'giant-solomons-seal':        215, // confirmed
  // 21 chars — Dahurian Rhododendron
  'dahurian-rhododendron':      225,
  // 23 chars — Arabesque Red Penstemon, Ukrainian Purple Tomato
  'penstemon':                  240,
  'tomato-ukrainian-purple':    240,
  // 24 chars — Golden Mop False Cypress, Purple Bumble Bee Tomato
  'false-cypress':              245,
  'tomato-bumble-bee-purple':   245,
  // 25 chars — Sunrise Bumble Bee Tomato
  'tomato-bumble-bee-sunrise':  255,
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

  // Replace the per-plant variable lines in the template
  const plaqueW = PLAQUE_W[slug] ?? 195;
  const scad = template
    .replace(/^qr_url = ".*";$/m, `qr_url = "${escapeScad(shortUrl)}";`)
    .replace(/^common_name = ".*";$/m, `common_name = "${escapeScad(name)}";`)
    .replace(/^scientific_name = ".*";$/m, `scientific_name = "${escapeScad(latinName)}";`)
    .replace(/^plaque_w = \d+;$/m, `plaque_w = ${plaqueW};`);

  const outPath = join(signsDir, `${slug}.scad`);

  const widthNote = plaqueW !== 195 ? `  [plaque_w=${plaqueW}]` : '';
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would write: signs/${slug}.scad  (${name} / ${latinName})${widthNote}`);
  } else {
    writeFileSync(outPath, scad, 'utf8');
    console.log(`[OK] signs/${slug}.scad  (${name} / ${latinName})${widthNote}`);
  }
  generated++;
}

console.log(`\nDone: ${generated} signs ${DRY_RUN ? 'would be ' : ''}generated, ${skipped} skipped.`);
