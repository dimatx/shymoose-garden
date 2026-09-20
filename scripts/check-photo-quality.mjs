#!/usr/bin/env node
// Audits src/assets/plants/*.{jpg,jpeg,png,webp,avif,tif,tiff} for resolution that's too low to
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
import { join, resolve } from "node:path";
import sharp from "sharp";

const PLANTS_DIR = new URL("../src/assets/plants/", import.meta.url);
const MIN_WIDTH = 1200; // matches the largest `width` requested in [slug].astro
const WARN_WIDTH = 1440; // comfortably above MIN_WIDTH; flag as "tight" rather than failing

export async function auditPhotos(directory = fileURLToPath(PLANTS_DIR)) {
  const files = (await readdir(directory)).filter((f) =>
    /\.(jpe?g|png|webp|avif|tiff?)$/i.test(f),
  );
  const results = [];
  for (const file of files) {
    try {
      const metadata = await sharp(join(directory, file)).metadata();
      results.push({ file, ...classifyPhoto(metadata) });
    } catch (error) {
      results.push({ file, width: null, height: null, minDim: null, status: "FAIL", error: error.message });
    }
  }
  return results.sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
}

export function classifyPhoto(metadata) {
  // EXIF orientation 5–8 swaps the displayed axes after auto-orientation.
  const swap = metadata.orientation >= 5 && metadata.orientation <= 8;
  const width = swap ? metadata.height : metadata.width;
  const height = swap ? metadata.width : metadata.height;
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error("Image has no valid dimensions.");
  }
  const minDim = Math.min(width, height);
  let status = "OK";
  if (width < MIN_WIDTH) status = "FAIL";
  else if (width < WARN_WIDTH) status = "WARN";
  return { width, height, minDim, status };
}

async function main() {
  const asJson = process.argv.includes("--json");
  const results = await auditPhotos();
  if (!results.length) throw new Error("No plant photos found.");
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
      console.log(`${marker}  ${pad(r.file, 45)} ${r.error ?? `${r.width}x${r.height}`}`);
    }
    console.log(
      `\n${fails.length} failing (unreadable or < ${MIN_WIDTH}px wide), ${warns.length} borderline (< ${WARN_WIDTH}px wide), ${
        results.length - fails.length - warns.length
      } OK, ${results.length} total.`,
    );
    if (fails.length > 0) {
      console.log(
        "\nReplace FAIL photos with a higher-resolution source before shipping a plant (see AGENTS.md § photo sourcing).",
      );
    }
  }

  process.exitCode = fails.length > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`check:photos failed: ${error.message}`);
    process.exitCode = 1;
  });
}
