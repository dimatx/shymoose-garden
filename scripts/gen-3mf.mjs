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

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), "..");
const signsDir = join(root, "signs");
const outputDir = join(signsDir, "3mf");
const cachePath = join(outputDir, ".cache.json");
const fontsDir = join(root, "scripts", "fonts");
const fonts = ["BarlowCondensed-Bold.ttf", "BarlowCondensed-Italic.ttf", "BarlowCondensed-Regular.ttf"];

function hash(...values) {
  const digest = createHash("sha256");
  for (const value of values) digest.update(value);
  return digest.digest("hex");
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

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Usage: npm run gen:3mf -- [--force] [sign-name[.scad] ...]\n" +
      "No names: export all signs. Names match filenames in signs/, not plant content IDs.\n" +
      "Outputs: signs/3mf/*.3mf. Unchanged files are skipped using a local hash cache.\n" +
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
      const outputName = file.replace(/\.scad$/, ".3mf");
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
      renameSync(temporaryOutput, outputPath);
      cache.entries[file] = { input: inputHash, output: hash(result) };
      // Save progress after each completed file so an interrupted batch can resume.
      const temporaryCache = join(tempDir, "cache.json");
      writeFileSync(temporaryCache, `${JSON.stringify(cache, null, 2)}\n`);
      renameSync(temporaryCache, cachePath);
      rendered++;
      console.log(`[OK] ${outputName} (${Math.round(result.length / 1024)} KB)`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  console.log(`\nDone: ${rendered} rendered, ${skipped} unchanged. Open the 3MFs in PrusaSlicer.`);
}

try {
  main();
} catch (error) {
  console.error(`\ngen:3mf failed: ${error.message}`);
  process.exitCode = 1;
}
