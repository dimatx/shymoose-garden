#!/usr/bin/env node
/**
 * Render the generated, self-contained signs/*.scad files as model-only 3MFs.
 * Requires OpenSCAD; printer and filament settings stay in PrusaSlicer.
 */
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  renameSync, rmSync, writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fetchCsv, parseCsv, normalizeLatin, normalizeUrl } from "./lib/sheet-csv.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), "..");
const signsDir = join(root, "signs");
const outputDir = join(signsDir, "3mf");
const contentDir = join(root, "src", "content", "plants");
const cachePath = join(outputDir, ".cache.json");
const fontsDir = join(root, "scripts", "fonts");
const fonts = ["BarlowCondensed-Bold.ttf", "BarlowCondensed-Italic.ttf", "BarlowCondensed-Regular.ttf"];

function hash(...values) {
  const digest = createHash("sha256");
  for (const value of values) digest.update(value);
  return digest.digest("hex");
}

/**
 * Windows antivirus (Defender) briefly locks freshly-written files to scan
 * them, which makes fs.renameSync throw a transient EPERM/EBUSY right after
 * a file is created. Retry a few times with a short backoff before giving up.
 */
function renameWithRetry(from, to, attempts = 5) {
  for (let i = 0; ; i++) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      const transient = error.code === "EPERM" || error.code === "EBUSY";
      if (!transient || i >= attempts - 1) throw error;
      const wait = 200 * (i + 1);
      const until = Date.now() + wait;
      while (Date.now() < until) { /* brief synchronous backoff */ }
    }
  }
}

function run(executable, args, timeout = 30_000) {
  const result = spawnSync(executable, args, {
    cwd: root, encoding: "utf8", windowsHide: true, timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status !== 0) {
    throw new Error(`${executable} failed (${result.status ?? result.signal}):\n${output}`);
  }
  return output;
}

function findOpenSCAD() {
  if (process.env.OPENSCAD_BIN) {
    const executable = process.env.OPENSCAD_BIN;
    return { executable, version: run(executable, ["--version"]) };
  }
  const binary = process.platform === "win32" ? "openscad.com" : "openscad";
  const toolsDir = join(root, ".tools");
  const portable = existsSync(toolsDir)
    ? readdirSync(toolsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^openscad/i.test(entry.name))
      .map((entry) => join(toolsDir, entry.name, binary)).sort().reverse()
    : [];
  const candidates = [...portable, binary];
  if (process.platform === "win32") {
    for (const directory of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
      if (directory) candidates.push(join(directory, "OpenSCAD", binary));
    }
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD");
  }
  for (const executable of candidates) {
    try {
      return { executable, version: run(executable, ["--version"]) };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new Error(
    "OpenSCAD was not found. Install it from https://openscad.org/downloads.html, " +
    "extract a portable Windows build into .tools/, or set OPENSCAD_BIN to its executable."
  );
}

function scadPath(path) {
  // OpenSCAD include/use directives accept forward slashes on every platform.
  const value = path.replaceAll("\\", "/");
  if (/[<>\r\n]/.test(value)) throw new Error(`Unsupported OpenSCAD include path: ${path}`);
  return value;
}

function loadCache(force) {
  const empty = { version: 1, entries: {} };
  if (!existsSync(cachePath)) return empty;
  let cache;
  try {
    cache = JSON.parse(readFileSync(cachePath, "utf8"));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    if (force) return empty;
    throw new Error("Invalid 3MF cache JSON. Run again with --force to rebuild it.", { cause: error });
  }
  if (cache?.version !== 1 || !cache.entries || typeof cache.entries !== "object" || Array.isArray(cache.entries)) {
    if (force) return empty;
    throw new Error("Invalid 3MF cache. Run again with --force to rebuild it.");
  }
  return cache;
}

/**
 * Build a map of normalized Latin name -> the leading number from the
 * sheet's "Filename" column (e.g. "74_Canadian Hemlock.3mf" -> "74"). Latin
 * name is the reliable join key — the sheet's "QR link" column is often
 * blank for newer rows, unlike "Latin name" which the sheet always has.
 * Returns an empty map (with a warning) if PLANTS_SHEET_CSV_URL isn't set.
 */
/**
 * Build maps from a plant's Full link / normalized Latin name to the leading
 * number in the sheet's "Filename" column (e.g. "74_Canadian Hemlock.3mf" ->
 * "74"). Two join keys, tried in order, mirror import-plants.mjs's own
 * matching: Full link is exact and unambiguous when present; normalized
 * Latin name is the fallback for rows the sheet has but our frontmatter has
 * enriched with cultivar trademark text (e.g. "Veronica 'Purple Illusion'"
 * in the sheet vs "Veronica Magic Show® 'Purple Illusion'" in frontmatter —
 * a URL match still lines them up). Returns two empty maps (with a warning)
 * if PLANTS_SHEET_CSV_URL isn't set.
 */
async function buildSheetNumberMaps() {
  const csvUrl = process.env.PLANTS_SHEET_CSV_URL;
  const byUrl = new Map();
  const byLatin = new Map();
  if (!csvUrl) {
    console.warn(
      "[WARN] PLANTS_SHEET_CSV_URL is not set — 3MFs will keep their current names " +
      "instead of getting the sheet's number prefix."
    );
    return { byUrl, byLatin };
  }
  const rows = parseCsv(await fetchCsv(csvUrl));
  const header = rows[0] ?? [];
  const find = (label) =>
    header.findIndex((h) => h.trim().toLowerCase() === label.toLowerCase());
  const latinIdx = find("Latin name");
  const urlIdx = find("Full link");
  const filenameIdx = find("Filename");
  if (latinIdx === -1 || filenameIdx === -1) {
    console.warn("[WARN] Sheet is missing a 'Latin name' or 'Filename' column — skipping number prefixes.");
    return { byUrl, byLatin };
  }
  for (const cells of rows.slice(1)) {
    const latin = (cells[latinIdx] ?? "").trim();
    const url = urlIdx !== -1 ? (cells[urlIdx] ?? "").trim() : "";
    const number = (cells[filenameIdx] ?? "").trim().match(/^(\d+)_/)?.[1];
    if (!number) continue;
    if (latin) byLatin.set(normalizeLatin(latin), number);
    if (url) byUrl.set(normalizeUrl(url), number);
  }
  return { byUrl, byLatin };
}

/** Read a plant's latinName straight from its content frontmatter. */
function getLatinName(slug) {
  const mdPath = join(contentDir, `${slug}.md`);
  if (!existsSync(mdPath)) return null;
  const match = readFileSync(mdPath, "utf8").match(/^latinName:\s*["']?(.+?)["']?\s*$/m);
  return match ? match[1].trim() : null;
}

/** Read a plant's learnMoreUrl straight from its content frontmatter. */
function getLearnMoreUrl(slug) {
  const mdPath = join(contentDir, `${slug}.md`);
  if (!existsSync(mdPath)) return null;
  const match = readFileSync(mdPath, "utf8").match(/^learnMoreUrl:\s*["']?(.+?)["']?\s*$/m);
  return match ? match[1].trim() : null;
}

/** Read a sign's qr_url value straight out of its rendered SCAD source. */
function getSignQrUrl(source) {
  const match = source.match(/^qr_url = "(.*)";$/m);
  return match ? match[1] : null;
}

/** Strip protocol/trailing slash so URL variants (http vs https) compare equal. */
function normalizeShortUrl(url) {
  return (url ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/**
 * Map every sign's qr_url to its content slug by matching against each
 * plant's shortUrl frontmatter. This is needed because a sign's filename is
 * derived from its Latin name (via gen-signs.mjs) and can differ from the
 * plant's content slug (e.g. veronica-magic-show-purple-illusion.scad for
 * src/content/plants/veronica-purple-illusion.md).
 */
function buildQrUrlToSlugMap() {
  const map = new Map();
  const files = readdirSync(contentDir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const text = readFileSync(join(contentDir, file), "utf8");
    const match = text.match(/^shortUrl:\s*["']?(.+?)["']?\s*$/m);
    if (!match) continue;
    map.set(normalizeShortUrl(match[1]), file.replace(/\.md$/, ""));
  }
  return map;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Usage: npm run gen:3mf -- [--force] [sign-name[.scad] ...]\n" +
      "No names: export all signs. Names match filenames in signs/, not plant content IDs.\n" +
      "Outputs: signs/3mf/*.3mf, prefixed with the plant's number from the\n" +
      "sheet's Filename column (e.g. 74_tsuga-canadensis-moon-frost.3mf) when a\n" +
      "matching plant is found; left as-is otherwise.\n" +
      "Unchanged files are skipped using a local hash cache.\n" +
      "OPENSCAD_BIN overrides executable discovery. --force rebuilds without the cache."
    );
    return;
  }
  const force = args.includes("--force");
  const requested = args.filter((arg) => arg !== "--force");
  const allFiles = readdirSync(signsDir).filter((file) => file.endsWith(".scad")).sort();
  for (const name of requested) {
    if (!allFiles.includes(name.endsWith(".scad") ? name : `${name}.scad`)) {
      throw new Error(`Unknown sign or option: ${name}. Use --help for usage.`);
    }
  }
  const selection = new Set(requested.map((name) => name.endsWith(".scad") ? name : `${name}.scad`));
  const files = selection.size ? allFiles.filter((file) => selection.has(file)) : allFiles;
  if (!files.length) throw new Error("No SCAD signs found. Run npm run gen:signs first.");

  const { byUrl, byLatin } = await buildSheetNumberMaps();
  const qrUrlToSlug = buildQrUrlToSlugMap();
  const unmatched = [];
  const outputNames = new Map(); // file (foo.scad) -> desired output filename ([N_]foo.3mf)
  for (const file of files) {
    const baseName = file.replace(/\.scad$/, "");
    const qrUrl = getSignQrUrl(readFileSync(join(signsDir, file), "utf8"));
    const slug = qrUrl ? qrUrlToSlug.get(normalizeShortUrl(qrUrl)) : null;
    const learnMoreUrl = slug ? getLearnMoreUrl(slug) : null;
    const latin = slug ? getLatinName(slug) : null;
    const number =
      (learnMoreUrl ? byUrl.get(normalizeUrl(learnMoreUrl)) : undefined) ??
      (latin ? byLatin.get(normalizeLatin(latin)) : undefined);
    if (number) {
      outputNames.set(file, `${number}_${baseName}.3mf`);
    } else {
      unmatched.push(baseName);
      outputNames.set(file, `${baseName}.3mf`);
    }
  }

  // Migrate already-rendered files from the old (unprefixed) name to the
  // sheet-numbered name, without forcing a re-render (content is unchanged).
  for (const file of files) {
    const legacyPath = join(outputDir, `${file.replace(/\.scad$/, "")}.3mf`);
    const desiredName = outputNames.get(file);
    const desiredPath = join(outputDir, desiredName);
    if (legacyPath !== desiredPath && existsSync(legacyPath) && !existsSync(desiredPath)) {
      renameWithRetry(legacyPath, desiredPath);
      console.log(`[RENAME] ${file.replace(/\.scad$/, "")}.3mf -> ${desiredName}`);
    }
  }

  const { executable, version } = findOpenSCAD();
  const help = run(executable, ["--help"]);
  const renderArgs = ["--hardwarnings"];
  if (help.includes("--backend")) renderArgs.push("--backend", "Manifold");
  const fingerprint = hash(
    readFileSync(scriptPath), version, JSON.stringify(renderArgs),
    ...fonts.map((font) => readFileSync(join(fontsDir, font)))
  );
  const cache = loadCache(force);

  mkdirSync(outputDir, { recursive: true });
  const tempDir = mkdtempSync(join(outputDir, ".render-"));
  let rendered = 0;
  let skipped = 0;
  console.log(`${version}\nExporting ${files.length} sign(s) to signs/3mf/`);
  try {
    for (const file of files) {
      const sourcePath = join(signsDir, file);
      const source = readFileSync(sourcePath, "utf8");
      // Included sources would need their own dependency hashes before caching.
      if (/^\s*(?:include|use)\s*</m.test(source)) {
        throw new Error(`${file} is not self-contained. Regenerate it with npm run gen:signs.`);
      }
      const inputHash = hash(fingerprint, source);
      const outputName = outputNames.get(file);
      const outputPath = join(outputDir, outputName);
      const cached = cache.entries[file];
      if (!force && cached?.input === inputHash && existsSync(outputPath) &&
          hash(readFileSync(outputPath)) === cached.output) {
        console.log(`[SKIP] ${outputName}`);
        skipped++;
        continue;
      }

      const wrapperPath = join(tempDir, "render.scad");
      writeFileSync(wrapperPath, [
        ...fonts.map((font) => `use <${scadPath(join(fontsDir, font))}>`),
        `include <${scadPath(sourcePath)}>`,
        "",
      ].join("\n"));
      const temporaryOutput = join(tempDir, outputName);
      const diagnostics = run(executable, [...renderArgs, "-o", temporaryOutput, wrapperPath], 30 * 60_000);
      if (/^(?:ERROR|WARNING):/m.test(diagnostics)) {
        throw new Error(`OpenSCAD reported a problem with ${file}:\n${diagnostics}`);
      }
      const result = readFileSync(temporaryOutput);
      if (result.length < 22 || result.readUInt32LE(0) !== 0x04034b50) {
        throw new Error(`OpenSCAD did not produce a 3MF ZIP archive for ${file}.`);
      }
      renameWithRetry(temporaryOutput, outputPath);
      cache.entries[file] = { input: inputHash, output: hash(result) };
      // Save progress after each completed file so an interrupted batch can resume.
      const temporaryCache = join(tempDir, "cache.json");
      writeFileSync(temporaryCache, `${JSON.stringify(cache, null, 2)}\n`);
      renameWithRetry(temporaryCache, cachePath);
      rendered++;
      console.log(`[OK] ${outputName} (${Math.round(result.length / 1024)} KB)`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  console.log(`\nDone: ${rendered} rendered, ${skipped} unchanged. Open the 3MFs in PrusaSlicer.`);
  if (unmatched.length) {
    console.log(
      `\n[WARN] No sheet number found for ${unmatched.length} sign(s) — left unprefixed:\n` +
      unmatched.map((name) => `  - ${name}`).join("\n")
    );
  }
}

main().catch((error) => {
  console.error(`\ngen:3mf failed: ${error.message}`);
  process.exitCode = 1;
});
