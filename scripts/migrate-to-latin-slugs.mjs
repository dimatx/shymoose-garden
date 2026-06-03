#!/usr/bin/env node
/**
 * One-time migration: renames every plant .md file and its photo asset from
 * common-name slugs to latin-name slugs, updates the photo path in frontmatter,
 * and retargets the Shlink redirect for each plant.
 *
 * Run with: node --env-file=.env scripts/migrate-to-latin-slugs.mjs
 * Dry-run:  DRY_RUN=1 node --env-file=.env scripts/migrate-to-latin-slugs.mjs
 *
 * Safe to re-run: files already at the latin slug are detected and skipped.
 */

import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DRY_RUN = process.env.DRY_RUN === '1';

const SHLINK_BASE_URL = (process.env.SHLINK_BASE_URL ?? 'http://s.shymoose.com').replace(/\/$/, '');
const SITE_URL = (process.env.SITE_URL ?? 'https://garden.shymoose.com').replace(/\/$/, '');
const API_KEY = process.env.SHLINK_API_KEY;

if (!API_KEY && !DRY_RUN) {
  console.error('Error: SHLINK_API_KEY is required. Use DRY_RUN=1 to preview.');
  process.exit(1);
}

function latinToSlug(latin) {
  return latin
    .toLowerCase()
    .replace(/[''®.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function patchShlink(shortCode, newLongUrl) {
  const url = `${SHLINK_BASE_URL}/rest/v3/short-urls/${shortCode}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ longUrl: newLongUrl }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shlink PATCH ${shortCode} failed (${res.status}): ${body}`);
  }
  return await res.json();
}

const plantFiles = globSync('src/content/plants/*.md', { cwd: ROOT });
plantFiles.sort();

let updated = 0;
let skipped = 0;

for (const relPath of plantFiles) {
  const oldSlug = basename(relPath, '.md');
  const fullMdPath = join(ROOT, relPath);
  const md = readFileSync(fullMdPath, 'utf8');

  const latinMatch = md.match(/^latinName:\s*["']?(.+?)["']?\s*$/m);
  if (!latinMatch) {
    console.warn(`[SKIP] ${oldSlug}: no latinName`);
    skipped++;
    continue;
  }

  const latinName = latinMatch[1].trim();
  const newSlug = latinToSlug(latinName);

  if (oldSlug === newSlug) {
    console.log(`[OK]   ${oldSlug} — already at latin slug`);
    skipped++;
    continue;
  }

  // --- Extract short code from shortUrl frontmatter ---
  const shortUrlMatch = md.match(/^shortUrl:\s*["']?https?:\/\/[^/]+\/([^"'\s]+)["']?\s*$/m);
  const shortCode = shortUrlMatch ? shortUrlMatch[1] : null;

  // --- Photo rename ---
  const photoMatch = md.match(/^photo:\s*["'](.+?)["']\s*$/m);
  const oldPhotoSuffix = photoMatch ? photoMatch[1].replace('../../assets/plants/', '') : null;
  const oldPhotoPath = oldPhotoSuffix ? join(ROOT, 'src/assets/plants', oldPhotoSuffix) : null;
  const newPhotoFilename = oldPhotoSuffix ? oldPhotoSuffix.replace(oldSlug, newSlug) : null;
  const newPhotoPath = newPhotoFilename ? join(ROOT, 'src/assets/plants', newPhotoFilename) : null;
  const newPhotoFrontmatter = newPhotoFilename ? `"../../assets/plants/${newPhotoFilename}"` : null;

  // --- New .md path ---
  const contentDir = join(ROOT, 'src/content/plants');
  const newMdPath = join(contentDir, `${newSlug}.md`);

  console.log(`[RENAME] ${oldSlug} → ${newSlug}`);
  if (oldPhotoSuffix) console.log(`         photo: ${oldPhotoSuffix} → ${newPhotoFilename}`);
  if (shortCode) console.log(`         shlink: /${shortCode} → ${SITE_URL}/plants/${newSlug}`);

  if (!DRY_RUN) {
    // 1. Rename photo asset
    if (oldPhotoPath && newPhotoPath && existsSync(oldPhotoPath)) {
      renameSync(oldPhotoPath, newPhotoPath);
    }

    // 2. Update photo path in frontmatter and write
    let newMd = md;
    if (photoMatch && newPhotoFrontmatter) {
      newMd = newMd.replace(photoMatch[0], `photo: ${newPhotoFrontmatter}`);
    }
    writeFileSync(fullMdPath, newMd, 'utf8');

    // 3. Rename .md file
    renameSync(fullMdPath, newMdPath);

    // 4. Update Shlink redirect
    if (shortCode) {
      try {
        await patchShlink(shortCode, `${SITE_URL}/plants/${newSlug}`);
        console.log(`         shlink OK`);
      } catch (e) {
        console.error(`         shlink ERROR: ${e.message}`);
      }
    }
  }

  updated++;
}

console.log(`\nDone: ${updated} renamed, ${skipped} skipped.`);
if (DRY_RUN) console.log('(DRY RUN — no files or URLs were changed)');
