#!/usr/bin/env node
// @ts-check
/**
 * Disaster-recovery helper for Shlink.
 *
 * If the Shlink database is lost/reset, every plant's short code is still
 * recorded in its frontmatter (`shortUrl:`). This script re-creates each of
 * those short URLs on the Shlink server using the SAME custom slug, pointing
 * at the same long URL — so the QR codes on already-printed physical signs
 * keep working.
 *
 * It does NOT modify any repo files; it only talks to the Shlink API.
 * Existing codes are verified against the intended destination. Mismatches or
 * failed verification count as failures; existing remote links are never edited.
 *
 * Usage:
 *   SHLINK_API_KEY=<key> node --env-file=.env scripts/recover-shortlinks.mjs
 *   DRY_RUN=1 node --env-file=.env scripts/recover-shortlinks.mjs   # preview
 */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { readScalars } from "./lib/frontmatter.mjs";
import { recoverShortUrl, validateShortUrl } from "./lib/shortlinks.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const contentDir = join(repoRoot, "src", "content", "plants");

const SHLINK_BASE_URL = (
  process.env.SHLINK_BASE_URL ?? "https://s.shymoose.com"
).replace(/\/+$/, "");
const SITE_URL = (process.env.SITE_URL ?? "https://garden.shymoose.com").replace(
  /\/+$/,
  ""
);
const API_KEY = process.env.SHLINK_API_KEY;
const DRY_RUN = process.env.DRY_RUN === "1";

main().catch((err) => {
  console.error("\n✗ recover-shortlinks failed:", err?.message ?? err);
  process.exitCode = 1;
});

async function main() {
  if (!API_KEY && !DRY_RUN) {
    throw new Error(
      "SHLINK_API_KEY env var is required (or set DRY_RUN=1 to preview)."
    );
  }

  const files = (await readdir(contentDir)).filter((f) => f.endsWith(".md")).sort();

  let recreated = 0;
  let already = 0;
  let skipped = 0;
  let failed = 0;

  for (const filename of files) {
    const slug = filename.replace(/\.md$/, "");
    const content = await readFile(join(contentDir, filename), "utf8");
    const fields = readScalars(content, ["shortUrl", "latinName"]);
    if (!fields.shortUrl) {
      // No recorded short code yet (e.g. brand-new plant) — nothing to recover.
      skipped++;
      continue;
    }

    const customSlug = new URL(validateShortUrl(fields.shortUrl)).pathname.replace(/^\/+/, "");
    const longUrl = `${SITE_URL}/plants/${slug}`;
    const title = fields.latinName || slug;

    if (DRY_RUN) {
      console.log(`  [dry] ${customSlug}  →  ${longUrl}`);
      recreated++;
      continue;
    }

    const result = await recreate(customSlug, longUrl, title);
    if (result === "created") {
      console.log(`  + ${customSlug}  →  ${longUrl}`);
      recreated++;
    } else if (result === "exists") {
      console.log(`  = ${customSlug}  (destination verified)`);
      already++;
    } else {
      console.error(`  ✗ ${customSlug}: ${result}`);
      failed++;
    }
  }

  console.log(
    `\nDone. Recreated: ${recreated}  Already present: ${already}  ` +
      `No code: ${skipped}  Failed: ${failed}.`
  );
  if (failed > 0) process.exitCode = 1;
}

/**
 * @param {string} customSlug
 * @param {string} longUrl
 * @param {string} title
 * @returns {Promise<"created" | "exists" | string>}
 */
async function recreate(customSlug, longUrl, title) {
  if (!API_KEY) throw new Error("SHLINK_API_KEY env var is required.");
  try {
    return await recoverShortUrl({
      baseUrl: SHLINK_BASE_URL, apiKey: API_KEY, customSlug, longUrl, title,
    });
  } catch (error) {
    return error instanceof Error ? error.message : "Unknown recovery failure.";
  }
}
