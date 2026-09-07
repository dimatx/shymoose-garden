#!/usr/bin/env node
// Audits src/assets/plants/*.{jpg,jpeg,png} for resolution that's too low to
// render sharply at the site's largest requested display size.
//
// Why 1200px: src/pages/plants/[slug].astro requests the detail-page hero at
// width={1200} (with widths=[480, 768, 1200]). If the source file is
// narrower than that, Astro/Sharp must upscale it, which blurs it — the
// exact defect a maintainer reported for the Blue-eyed Grass photo.
//
// Usage:
//   npm run check:photos            # human-readable table, exits 1 on any FAIL
//   npm run check:photos -- --json  # machine-readable output
//
// Run this whenever adding or replacing a plant photo (see AGENTS.md).

import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const PLANTS_DIR = new URL("../src/assets/plants/", import.meta.url);
const MIN_WIDTH = 1200; // matches the largest `width` requested in [slug].astro
const WARN_WIDTH = 1440; // comfortably above MIN_WIDTH; flag as "tight" rather than failing

const asJson = process.argv.includes("--json");

const files = (await readdir(PLANTS_DIR)).filter((f) =>
  /\.(jpe?g|png)$/i.test(f),
);

const results = [];
for (const file of files) {
  const filePath = fileURLToPath(new URL(file, PLANTS_DIR));
  const { width, height } = await sharp(filePath).metadata();
  const minDim = Math.min(width, height);
  let status = "OK";
  if (width < MIN_WIDTH) status = "FAIL";
  else if (width < WARN_WIDTH) status = "WARN";
  results.push({ file, width, height, minDim, status });
}

results.sort((a, b) => a.width - b.width);

const fails = results.filter((r) => r.status === "FAIL");
const warns = results.filter((r) => r.status === "WARN");

if (asJson) {
  console.log(JSON.stringify({ minWidth: MIN_WIDTH, warnWidth: WARN_WIDTH, results }, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(
    `Photo quality audit — minimum acceptable width: ${MIN_WIDTH}px (site's largest requested display size)\n`,
  );
  for (const r of results) {
    if (r.status === "OK") continue;
    const marker = r.status === "FAIL" ? "✗ FAIL" : "△ WARN";
    console.log(`${marker}  ${pad(r.file, 45)} ${r.width}x${r.height}`);
  }
  console.log(
    `\n${fails.length} failing (< ${MIN_WIDTH}px wide), ${warns.length} borderline (< ${WARN_WIDTH}px wide), ${
      results.length - fails.length - warns.length
    } OK, ${results.length} total.`,
  );
  if (fails.length > 0) {
    console.log(
      "\nReplace FAIL photos with a higher-resolution source before shipping a plant (see AGENTS.md § photo sourcing).",
    );
  }
}

process.exit(fails.length > 0 ? 1 : 0);
