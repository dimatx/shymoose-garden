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
 *
 * Usage:
 *   SHLINK_API_KEY=<key> node --env-file=.env scripts/recover-shortlinks.mjs
 *   DRY_RUN=1 node --env-file=.env scripts/recover-shortlinks.mjs   # preview
 */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const contentDir = join(repoRoot, "src", "content", "plants");

const SHLINK_BASE_URL = (
  process.env.SHLINK_BASE_URL ?? "http://s.shymoose.com"
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
    const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";

    const shortMatch = fm.match(/^shortUrl:\s*"([^"]+)"/m);
    if (!shortMatch) {
      // No recorded short code yet (e.g. brand-new plant) — nothing to recover.
      skipped++;
      continue;
    }

    const customSlug = new URL(shortMatch[1]).pathname.replace(/^\/+/, "");
    const longUrl = `${SITE_URL}/plants/${slug}`;
    const latinMatch =
      fm.match(/^latinName:\s*"([^"]+)"/m) || fm.match(/^latinName:\s*(.+)$/m);
    const title = latinMatch ? latinMatch[1].trim() : slug;

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
      console.log(`  = ${customSlug}  (already present)`);
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
  const res = await fetch(`${SHLINK_BASE_URL}/rest/v3/short-urls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Api-Key": /** @type {string} */ (API_KEY),
    },
    body: JSON.stringify({ longUrl, title, customSlug, tags: ["garden"] }),
  });

  if (res.ok) return "created";

  const body = await res.text().catch(() => "");
  // A slug that already exists means it's already recovered — treat as success.
  if (res.status === 400 && /non-unique-slug|already in use/i.test(body)) {
    return "exists";
  }
  return `HTTP ${res.status}: ${body.slice(0, 200)}`;
}
