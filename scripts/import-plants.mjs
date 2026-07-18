#!/usr/bin/env node
// @ts-check
/**
 * Dev-only helper: pull NEW plants from the ShyMoose Google Sheet and scaffold
 * draft Markdown files for them. This is a one-way, manual import — the live
 * site has no knowledge of Google Sheets and never fetches anything at runtime.
 *
 * Workflow:
 *   1. npm run import:plants
 *   2. Review the draft files written to drafts/plants/.
 *   3. For each draft you want to keep: drop a photo into src/assets/plants/,
 *      fill in the TODO fields, then move the .md into src/content/plants/.
 *   4. Commit as usual.
 *
 * Matching: a sheet row is considered "already in the repo" when its Full link
 * (learnMoreUrl) OR its normalized Latin name matches an existing plant file.
 * Only unmatched rows are scaffolded, so re-running is safe and idempotent.
 *
 * Re-running also prunes itself: any leftover draft whose plant has since been
 * published (i.e. now matches a file in src/content/plants/) is deleted, so
 * finished drafts don't pile up in drafts/plants/ after you publish them.
 *
 * The sheet CSV URL must be provided via the PLANTS_SHEET_CSV_URL env var
 * (e.g. in your local .env). It is intentionally not hardcoded in source.
 */

import { readFile, readdir, writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const contentDir = join(repoRoot, "src", "content", "plants");
const draftsDir = join(repoRoot, "drafts", "plants");

const CSV_URL = process.env.PLANTS_SHEET_CSV_URL;
if (!CSV_URL) {
  console.error(
    "\n✗ PLANTS_SHEET_CSV_URL env var is required.\n" +
      "  Set it in your local .env (the published Google Sheet CSV URL),\n" +
      "  e.g. PLANTS_SHEET_CSV_URL=https://docs.google.com/.../pub?...output=csv\n"
  );
  process.exit(1);
}

/** Column headers we care about, as they appear in the sheet. */
const COL = {
  qrLink: "QR link",
  commonName: "Common name",
  latinName: "Latin name",
  fullLink: "Full link",
  filename: "Filename",
};

main().catch((err) => {
  console.error("\n✗ import-plants failed:", err?.message ?? err);
  process.exitCode = 1;
});

async function main() {
  console.log(`Fetching sheet…\n  ${CSV_URL}\n`);
  const csv = await fetchCsv(CSV_URL);
  const rows = parseCsv(csv);
  if (rows.length === 0) throw new Error("Sheet appears to be empty.");

  const header = rows[0];
  const idx = indexHeader(header);
  const records = rows
    .slice(1)
    .map((cells) => rowToRecord(cells, idx))
    // A usable plant needs BOTH a common name and a Latin name. The Latin name
    // is the stable identifier used for matching; the common name drives the
    // slug and display, so we skip rows missing either.
    .filter((r) => r.commonName && r.latinName);

  const existing = await loadExistingPlants();

  // Self-cleaning: drop any leftover drafts whose plant is now published.
  await pruneStaleDrafts(existing);

  /** @type {ReturnType<typeof rowToRecord>[]} */
  const newPlants = [];
  for (const rec of records) {
    if (isKnown(rec, existing)) continue;
    newPlants.push(rec);
  }

  console.log(
    `Sheet rows with both names:   ${records.length}` +
      `\nAlready in repo:               ${records.length - newPlants.length}` +
      `\nNew to scaffold:              ${newPlants.length}\n`
  );

  if (newPlants.length === 0) {
    console.log("Nothing new — the repo is up to date with the sheet. ✓");
    return;
  }

  await mkdir(draftsDir, { recursive: true });

  const usedSlugs = new Set(existing.map((p) => p.slug));
  const written = [];
  for (const rec of newPlants) {
    const slug = uniqueSlug(rec, usedSlugs);
    usedSlugs.add(slug);
    const file = join(draftsDir, `${slug}.md`);
    if (existsSync(file)) {
      console.log(`  • skip (draft already exists): drafts/plants/${slug}.md`);
      continue;
    }
    await writeFile(file, renderDraft(rec, slug), "utf8");
    written.push({ slug, rec });
    console.log(
      `  + drafts/plants/${slug}.md  ←  ${rec.commonName || rec.latinName}`
    );
  }

  if (written.length > 0) {
    console.log(
      `\nWrote ${written.length} draft(s) to drafts/plants/.` +
        `\nFinish each one (add a photo to src/assets/plants/, fill the TODOs),` +
        `\nthen move it into src/content/plants/ to publish it.`
    );
  }
}

/* --------------------------------- fetch --------------------------------- */

async function fetchCsv(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} fetching the sheet.`);
  }
  return await res.text(); // fetch decodes as UTF-8 → ®, ™ come through clean
}

/* ---------------------------- CSV parsing -------------------------------- */

/**
 * Minimal RFC-4180 CSV parser: handles quoted fields, escaped quotes (""),
 * and commas/newlines inside quotes. Returns an array of string[] rows.
 * @param {string} text
 * @returns {string[][]}
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  // Normalize newlines so \r\n and \r both behave.
  const s = text.replace(/\r\n?/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // Flush the final field/row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop entirely blank rows (the sheet has trailing empty ones).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Map known column names to their position in the header row. */
function indexHeader(header) {
  const find = (label) =>
    header.findIndex((h) => h.trim().toLowerCase() === label.toLowerCase());
  return {
    qrLink: find(COL.qrLink),
    commonName: find(COL.commonName),
    latinName: find(COL.latinName),
    fullLink: find(COL.fullLink),
    filename: find(COL.filename),
  };
}

function rowToRecord(cells, idx) {
  const at = (i) => (i >= 0 && i < cells.length ? cells[i].trim() : "");
  return {
    qrLink: at(idx.qrLink),
    commonName: at(idx.commonName),
    latinName: at(idx.latinName),
    fullLink: at(idx.fullLink),
    filename: at(idx.filename),
  };
}

/* ----------------------- existing-plant matching ------------------------- */

async function loadExistingPlants() {
  let files = [];
  try {
    files = (await readdir(contentDir)).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  const plants = [];
  for (const file of files) {
    const text = await readFile(join(contentDir, file), "utf8");
    const fm = frontmatter(text);
    plants.push({
      slug: file.replace(/\.md$/, ""),
      latinKey: normalizeLatin(fm.latinName ?? ""),
      urlKey: normalizeUrl(fm.learnMoreUrl ?? ""),
    });
  }
  return plants;
}

/**
 * Remove drafts that have already been published. A draft is considered
 * published once a file in src/content/plants/ matches its learnMoreUrl or
 * normalized Latin name — the same matching used for sheet rows. This keeps
 * drafts/plants/ from accumulating finished scaffolds after you move the real
 * file into the content collection (or recreate it there under a new slug).
 * @param {Awaited<ReturnType<typeof loadExistingPlants>>} existing
 */
async function pruneStaleDrafts(existing) {
  let files = [];
  try {
    files = (await readdir(draftsDir)).filter((f) => f.endsWith(".md"));
  } catch {
    return; // no drafts dir yet — nothing to prune
  }

  let removed = 0;
  for (const file of files) {
    const fm = frontmatter(await readFile(join(draftsDir, file), "utf8"));
    // Reuse the sheet-row matcher: isKnown reads `fullLink` + `latinName`.
    const rec = {
      fullLink: fm.learnMoreUrl ?? "",
      latinName: fm.latinName ?? "",
    };
    if (!isKnown(rec, existing)) continue;
    await unlink(join(draftsDir, file));
    removed++;
    console.log(`  - drafts/plants/${file}  (already published — removed)`);
  }

  if (removed > 0) {
    console.log(`Pruned ${removed} published draft(s) from drafts/plants/.\n`);
  }
}

/** Pull a few scalar frontmatter values without a YAML dependency. */
function frontmatter(text) {
  const normalized = text.replace(/\r\n?/g, "\n");
  const m = normalized.match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    const fm = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (!fm) continue; // ignore nested/indented lines like care: fields
    let val = fm[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[fm[1]] = val;
  }
  return out;
}

function isKnown(rec, existing) {
  const url = normalizeUrl(rec.fullLink);
  const latin = normalizeLatin(rec.latinName);
  return existing.some(
    (p) =>
      (url && p.urlKey && p.urlKey === url) ||
      (latin && p.latinKey && p.latinKey === latin)
  );
}

function normalizeUrl(url) {
  if (!url) return "";
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

/** Normalize a Latin name for comparison, KEEPING the cultivar.
 *
 * Different cultivars of the same species (e.g. Acer palmatum 'Crimson Queen'
 * vs 'Inaba-shidare' vs 'Tamukeyama', or the Heuchera / tomato / cucumber
 * cultivars) are DISTINCT plants. Stripping the cultivar collapses them all to
 * one key ("acer palmatum"), so as soon as one is published every other
 * cultivar in the sheet matches it and is silently skipped as a duplicate —
 * i.e. new plants go missing. Instead we flatten trademark marks, `var.`, and
 * all punctuation (including the cultivar quotes) to spaces and keep the
 * cultivar words, so "Acer palmatum 'Inaba-shidare'" and
 * "Acer palmatum 'Inaba shidare'" still compare equal, while 'Tamukeyama'
 * stays distinct. */
function normalizeLatin(name) {
  return name
    .toLowerCase()
    .replace(/[®™©]/g, " ")
    .replace(/\bvar\.?\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/* ------------------------------ scaffolding ------------------------------ */

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['’]/g, "") // Solomon's → solomons
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueSlug(rec, used) {
  // Prefer the common name. But when several cultivars share one common name
  // (e.g. three "Japanese Maple"s), the common-name slug collides — fall back
  // to the full Latin name WITH its cultivar so each cultivar gets its own
  // meaningful slug (acer-palmatum-tamukeyama) instead of "japanese-maple-2".
  const commonBase = slugify(rec.commonName);
  const latinBase = slugify(rec.latinName);
  let base =
    (commonBase && !used.has(commonBase) ? commonBase : "") ||
    latinBase ||
    commonBase ||
    "plant";
  let slug = base;
  let n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  return slug;
}

/** Render a draft Markdown file matching the content collection schema. */
function renderDraft(rec, slug) {
  const learnMore = rec.fullLink
    ? `learnMoreUrl: ${JSON.stringify(rec.fullLink)}\n`
    : "";
  const refLines = [
    `# Imported from the garden sheet — finish the TODOs, add a photo, then`,
    `# move this file into src/content/plants/ to publish it.`,
    rec.qrLink ? `# QR link: ${rec.qrLink}` : null,
    rec.filename ? `# Model file: ${rec.filename}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `---
${refLines}
name: ${JSON.stringify(rec.commonName || "TODO common name")}
latinName: ${JSON.stringify(rec.latinName)}
type: "TODO" # e.g. Perennial, Annual, Shrub, Vegetable, Succulent
nativeRange: "TODO"
photo: "../../assets/plants/${slug}.jpg" # TODO: add this image to src/assets/plants/
photoAlt: "TODO"
photoCredit: "TODO"
shortDescription: "TODO"
care:
  water: "TODO"
  soil: "TODO"
  sunlight: "TODO"
  hardiness: "TODO"
  size: "TODO"
  bloom: "TODO"
  pruning: "TODO"
bloomMonths: [] # months 1–12 the plant is in flower; omit for non-flowering
pruneMonths: [] # months 1–12 for main pruning; omit if not applicable
tags: []
featured: false
${learnMore}---

TODO: write the longer "keep reading" description for ${
    rec.commonName || rec.latinName
  } here.
`;
}
