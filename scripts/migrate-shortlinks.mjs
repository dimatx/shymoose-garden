#!/usr/bin/env node
// @ts-check
/**
 * One-time migration: recreate the 20 pre-existing Shlink short URLs so they
 * point to garden.shymoose.com plant pages (instead of external reference
 * sites), preserving the original short codes, then write shortUrl into each
 * plant's frontmatter.
 *
 * Before running:
 *   1. Delete the 20 old short URLs in Shlink (they used the same short codes).
 *   2. Make sure SHLINK_API_KEY is set in .env (the garden-script author-only key).
 *   3. Run: npm run migrate:shortlinks
 *
 * The script is safe to re-run: plants whose frontmatter already has shortUrl
 * are skipped, and Shlink will reject a duplicate customSlug with 409 (reported
 * as a warning, not a crash).
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

/**
 * Mapping of repo slug → pre-existing Shlink short code (from the CSV export).
 * The short codes are preserved exactly so QR codes / links already in the wild
 * continue to work.
 */
const EXISTING_CODES = {
  "false-cypress":           "c6fxB",
  "tomato-ukrainian-purple": "FdHQ5",
  "tomato-carbon":           "L4duY",
  "tomato-bumble-bee-purple":"X7WLf",
  "tomato-bumble-bee-sunrise":"8QUm7",
  "cucumber-suyo-long":      "r9WHy",
  "cucumber-shintokiwa":     "gwRhb",
  "cucumber-unagi":          "aJGtQ",
  "arborvitae":              "jyA7T",
  "rose-of-sharon":          "IhFSw",
  "showy-stonecrop":         "7YoTn",
  "orpine":                  "kRFav",
  "aizoon-stonecrop":        "GKR0f",
  "obedient-plant":          "Ld7dB",
  "speedwell":               "FQFOc",
  "japanese-snowball":       "IJxgv",
  "penstemon":               "LvrF3",
  "marigold":                "jWYcz",
  "green-hellebore":         "0LYOf",
  "zagreb":                  "kiGvx",
};

main().catch((err) => {
  console.error("\n✗ migrate-shortlinks failed:", err?.message ?? err);
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
    const customSlug = EXISTING_CODES[slug];
    if (!customSlug) continue; // not in the migration set

    const filePath = join(contentDir, filename);
    const content = await readFile(filePath, "utf8");

    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) {
      console.warn(`  ? ${filename}: no frontmatter found, skipping.`);
      continue;
    }

    const frontmatter = fmMatch[1];

    if (/^shortUrl:/m.test(frontmatter)) {
      console.log(`  • skip (already has shortUrl): ${slug}`);
      skipped++;
      continue;
    }

    const latinMatch =
      frontmatter.match(/^latinName:\s*"([^"]+)"/m) ||
      frontmatter.match(/^latinName:\s*'([^']+)'/m) ||
      frontmatter.match(/^latinName:\s*(.+)$/m);
    const latinName = latinMatch ? latinMatch[1].trim() : slug;

    const longUrl = `${SITE_URL}/plants/${slug}`;
    const shortUrl = `${SHLINK_BASE_URL}/${customSlug}`;

    if (DRY_RUN) {
      console.log(
        `  [dry] ${slug}:\n` +
          `        long  → ${longUrl}\n` +
          `        short → ${shortUrl}  (customSlug: ${customSlug})`
      );
      skipped++;
      continue;
    }

    const ok = await createShortUrl(longUrl, latinName, customSlug);
    if (!ok) {
      skipped++;
      continue;
    }

    const updated = content.replace(
      /^---\r?\n([\s\S]*?)\r?\n---/,
      `---\n${frontmatter}\nshortUrl: "${shortUrl}"\n---`
    );
    await writeFile(filePath, updated, "utf8");
    console.log(`  + ${slug}: ${shortUrl}`);
    created++;
  }

  console.log(
    `\nDone. Created: ${created}  Skipped: ${skipped}.` +
      (created > 0
        ? "\n\nRun `npm run build` to validate, then commit and push."
        : "")
  );
}

/**
 * @param {string} longUrl
 * @param {string} title
 * @param {string} customSlug
 * @returns {Promise<boolean>} true on success
 */
async function createShortUrl(longUrl, title, customSlug) {
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
      customSlug,
      tags: ["garden"],
    }),
  });

  if (res.status === 409) {
    console.warn(
      `  ! ${customSlug}: conflict — short code already exists in Shlink. ` +
        `Delete it first, then re-run.`
    );
    return false;
  }

  // Shlink returns 400 with "non-unique-slug" type when the custom slug is
  // already taken (same semantics as 409 for our purposes).
  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    if (body?.type?.includes("non-unique-slug")) {
      console.warn(
        `  ! ${customSlug}: slug already exists in Shlink — delete it first, then re-run.`
      );
      return false;
    }
    throw new Error(
      `Shlink API returned HTTP 400 for ${longUrl}:\n${JSON.stringify(body)}`
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(
      `Shlink API returned HTTP ${res.status} for ${longUrl}:\n${body}`
    );
  }

  const data = await res.json();
  if (typeof data?.shortUrl !== "string") {
    throw new Error(
      `Shlink response did not include a shortUrl:\n${JSON.stringify(data)}`
    );
  }

  return true;
}
