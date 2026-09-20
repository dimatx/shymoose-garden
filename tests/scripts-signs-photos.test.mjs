import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { generateSigns } from "../scripts/gen-signs.mjs";
import { auditPhotos, classifyPhoto } from "../scripts/check-photo-quality.mjs";

// libvips otherwise retains open fixture files on Windows until process exit.
sharp.cache(false);

async function fixture(t) {
  const root = fileURLToPath(new URL(`.scripts-fixture-${randomUUID()}/`, import.meta.url));
  await mkdir(root);
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return root;
}

test("sign preflight preserves outputs for invalid plants, duplicate filenames and empty collections", async (t) => {
  const root = await fixture(t);
  const contentDirectory = join(root, "plants");
  const outputDirectory = join(root, "signs");
  await mkdir(contentDirectory);
  await mkdir(outputDirectory);
  await writeFile(join(outputDirectory, "keep.scad"), "original");
  const generate = () => generateSigns({ contentDirectory, outputDirectory, dryRun: false });
  assert.throws(generate, /No plants/);
  const plant = '---\nname: Plant\nlatinName: "Species \'Cultivar\'"\n---\n';
  await writeFile(join(contentDirectory, "a.md"), plant);
  await writeFile(join(contentDirectory, "z.md"), "---\nname: Missing Latin\n---\nlatinName: Not frontmatter");
  assert.throws(generate, /missing name or latinName/);
  await writeFile(join(contentDirectory, "z.md"), plant);
  assert.throws(generate, /Duplicate sign filename/);
  assert.deepEqual(await readdir(outputDirectory), ["keep.scad"]);
  assert.equal(await readFile(join(outputDirectory, "keep.scad"), "utf8"), "original");
});

test("sign generation preserves overrides and literal dollars, and dry run creates no outputs", async (t) => {
  const root = await fixture(t);
  const outputDirectory = join(root, "not-created");
  await writeFile(join(root, "tsuga-canadensis-moon-frost.md"), '---\nname: "Hemlock \'Moon Frost\'"\nlatinName: "Tsuga canadensis \'Moon Frost\'"\nshortUrl: "https://s.example/$&"\n---\n');
  const [sign] = generateSigns({ contentDirectory: root, outputDirectory, dryRun: true });
  assert.equal(sign.filename, "tsuga-canadensis-moon-frost.scad");
  assert.match(sign.content, /^plaque_w = 200;$/m);
  assert.match(sign.content, /^common_name = "Hemlock";$/m);
  assert.match(sign.content, /^qr_url = "https:\/\/s.example\/\$&";$/m);
  await assert.rejects(readdir(outputDirectory), { code: "ENOENT" });
});

test("photo classification uses oriented dimensions and exact quality thresholds", () => {
  assert.equal(classifyPhoto({ width: 1199, height: 1600 }).status, "FAIL");
  assert.equal(classifyPhoto({ width: 1200, height: 1600 }).status, "WARN");
  assert.equal(classifyPhoto({ width: 1440, height: 1600 }).status, "OK");
  for (const orientation of [5, 6, 7, 8]) {
    const rotated = classifyPhoto({ width: 1600, height: 800, orientation });
    assert.equal(rotated.width, 800);
    assert.equal(rotated.status, "FAIL");
  }
  assert.throws(() => classifyPhoto({ height: 1600 }), /dimensions/);
});

test("photo audit handles URL-sensitive filenames, new formats and unreadable images", async (t) => {
  const root = await fixture(t);
  await sharp({ create: { width: 1500, height: 1200, channels: 3, background: "#fff" } })
    .webp().toFile(join(root, "plant#1.webp"));
  await writeFile(join(root, "broken.jpg"), "not an image");
  const results = await auditPhotos(root);
  assert.equal(results.length, 2);
  assert.equal(results.find(r => r.file === "plant#1.webp").status, "OK");
  const broken = results.find(r => r.file === "broken.jpg");
  assert.equal(broken.status, "FAIL");
  assert.ok(broken.error);
});
