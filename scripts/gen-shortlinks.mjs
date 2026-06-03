#!/usr/bin/env node
// @ts-check
/**
 * Dev-only helper: create Shlink short URLs for any plant that doesn't have
 * one yet, then write the resulting shortUrl back into the plant's frontmatter.
 *
 * Usage:
 *   SHLINK_API_KEY=<key> npm run gen:shortlinks
 *
 * Optional env vars:
 *   SHLINK_BASE_URL  — base URL of your Shlink instance
 *                      (default: http://s.shymoose.com)
 *   SITE_URL         — base URL of the garden site
 *                      (default: https://garden.shymoose.com)
 *   DRY_RUN          — set to "1" to print what would happen without calling
 *                      the API or writing any files
 *
 * The script is idempotent:
 *   • Plants whose frontmatter already has a `shortUrl:` field are skipped.
 *   • If a short URL for the same long URL already exists in Shlink
 *     (`findIfExists: true`), the existing one is returned rather than
 *     creating a duplicate.
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const contentDir = join(repoRoot, "src", "content", "plants");

const SHLINK_BASE_URL = (
  process.env.SHLINK_BASE_URL ?? "http://s.shymoose.com"
).replace(/\/$/, "");

const SITE_URL = (
  process.env.SITE_URL ?? "https://garden.shymoose.com"
).replace(/\/$/, "");

const API_KEY = process.env.SHLINK_API_KEY;
const DRY_RUN = process.env.DRY_RUN === "1";

main().catch((err) => {
  console.error("\n✗ gen-shortlinks failed:", err?.message ?? err);
  process.exitCode = 1;
});

async function main() {
  if (!API_KEY && !DRY_RUN) {
    throw new Error(
      "SHLINK_API_KEY env var is required.\n" +
        "  Set DRY_RUN=1 to preview what would happen without calling the API."
    );
  }

  const files = (await readdir(contentDir))
    .filter((f) => f.endsWith(".md"))
    .sort();

  let created = 0;
  let skipped = 0;

  for (const filename of files) {
    const slug = filename.replace(/\.md$/, "");
    const filePath = join(contentDir, filename);
    const content = await readFile(filePath, "utf8");

    // Locate the frontmatter block (between the first two --- delimiters).
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) {
      console.warn(`  ? ${filename}: no frontmatter found, skipping.`);
      continue;
    }

    const frontmatter = fmMatch[1];

    // Already has a shortUrl — nothing to do.
    if (/^shortUrl:/m.test(frontmatter)) {
      skipped++;
      continue;
    }

    // Extract latinName to use as the Shlink title (matches the examples in
    // the screenshot). Falls back to slug if the field can't be parsed.
    const latinMatch =
      frontmatter.match(/^latinName:\s*"([^"]+)"/m) ||
      frontmatter.match(/^latinName:\s*'([^']+)'/m) ||
      frontmatter.match(/^latinName:\s*(.+)$/m);
    const latinName = latinMatch ? latinMatch[1].trim() : slug;

    const longUrl = `${SITE_URL}/plants/${slug}`;

    if (DRY_RUN) {
      console.log(
        `  [dry] ${slug}:\n` +
          `        long  → ${longUrl}\n` +
          `        title → ${latinName}`
      );
      skipped++;
      continue;
    }

    const shortUrl = await createShortUrl(longUrl, latinName);

    // Append shortUrl as the last field before the closing ---.
    const updated = content.replace(
      /^---\r?\n([\s\S]*?)\r?\n---/,
      `---\n${frontmatter}\nshortUrl: "${shortUrl}"\n---`
    );
    await writeFile(filePath, updated, "utf8");

    console.log(`  + ${slug}: ${shortUrl}`);
    created++;
  }

  console.log(
    `\nDone. Created: ${created}  Already had one / dry-run: ${skipped}.`
  );
}

/**
 * Call the Shlink REST API to create (or retrieve) a short URL.
 *
 * @param {string} longUrl   The destination URL.
 * @param {string} title     The human-readable title stored in Shlink.
 * @returns {Promise<string>} The resulting short URL.
 */
async function createShortUrl(longUrl, title) {
  const apiUrl = `${SHLINK_BASE_URL}/rest/v3/short-urls`;

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Api-Key": API_KEY,
    },
    body: JSON.stringify({
      longUrl,
      title,
      tags: ["garden"],
      // Return the existing short URL instead of creating a duplicate if
      // this long URL was already shortened in Shlink.
      findIfExists: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(
      `Shlink API returned HTTP ${res.status} for ${longUrl}:\n${body}`
    );
  }

  const data = await res.json();

  if (typeof data?.shortUrl !== "string") {
    throw new Error(
      `Shlink response did not include a shortUrl field:\n${JSON.stringify(data)}`
    );
  }

  return data.shortUrl;
}
