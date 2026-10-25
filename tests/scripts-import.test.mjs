import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { main } from "../scripts/import-plants.mjs";
import { readScalars } from "../scripts/lib/frontmatter.mjs";
import { parse } from "yaml";

async function fixture(t) {
  const root = fileURLToPath(new URL(`.scripts-fixture-${randomUUID()}/`, import.meta.url));
  const plantsDirectory = join(root, "plants");
  const draftsDirectory = join(root, "drafts");
  await mkdir(plantsDirectory, { recursive: true });
  await mkdir(draftsDirectory);
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return {
    plantsDirectory, draftsDirectory,
    run: (csv) => main({ plantsDirectory, draftsDirectory, csvUrl: "https://unused.invalid", fetchSheet: async () => csv }),
  };
}

test("import deduplicates rows, keeps reordered drafts, and reserves draft photo names", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.draftsDirectory, "edited.md"), '---\nname: Edited\nlatinName: "Acer \'First\'"\nphoto: "../../assets/plants/maple.jpg" # draft photo\n---\nMy research\n');
  const header = "Common name,Latin name,Full link\n";
  const first = "Maple,Acer 'First',https://example.com/first\n";
  const second = "Maple,Acer 'Second',https://example.com/second\n";
  await f.run(header + second + first + second);
  assert.deepEqual((await readdir(f.draftsDirectory)).sort(), ["acer-second.md", "edited.md"]);
  const before = await readFile(join(f.draftsDirectory, "acer-second.md"), "utf8");
  await f.run(header + first + second);
  assert.equal(await readFile(join(f.draftsDirectory, "acer-second.md"), "utf8"), before);
  assert.match(await readFile(join(f.draftsDirectory, "edited.md"), "utf8"), /My research/);
  assert.equal(readScalars(before, ["photo"]).photo, "../../assets/plants/acer-second.jpg");
  const data = parse(before.split("---")[1]);
  assert.equal("type" in data, false);
  for (const field of ["growthForms", "lifeCycle", "plantGroups", "foliage", "sunExposure",
    "photoAlt", "photoCredit", "dateAdded", "bloomMonths", "pruneMonths", "bloomCalendarNote", "pruneCalendarNote"]) {
    assert.ok(field in data, `Draft is missing ${field}`);
  }
  for (const field of ["water", "soil", "sunlight", "hardiness", "size", "bloom", "pruning",
    "spacing", "propagation", "petSafety", "petSafetyNotes", "petSafetyInfo", "petSafetySources"]) {
    assert.ok(field in data.care, `Draft is missing care.${field}`);
  }
  assert.match(before, /AGENTS\.md/);
});

test("import prunes published drafts and matches quoted names correctly", async (t) => {
  const f = await fixture(t);
  const published = '---\nlatinName: "Plant \\"Special\\""\nlearnMoreUrl: https://example.com/plant\nphoto: "../../assets/plants/photo.jpg"\n---\n';
  await writeFile(join(f.plantsDirectory, "published.md"), published);
  await writeFile(join(f.draftsDirectory, "old.md"), published);
  await f.run('Common name,Latin name,Full link\nNew label,Plant Special,https://different.example.com\n');
  assert.deepEqual(await readdir(f.draftsDirectory), []);
});

test("bad headers and malformed CSV fail before draft pruning", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.draftsDirectory, "keep.md"), "---\nlatinName: Existing\n---\n");
  for (const csv of ["<html>login page</html>", 'Common name,Latin name\nPlant,"Unfinished']) {
    await assert.rejects(f.run(csv));
  }
  assert.deepEqual(await readdir(f.draftsDirectory), ["keep.md"]);
});

test("missing published directory is an error, not an empty garden", async (t) => {
  const f = await fixture(t);
  await rm(f.plantsDirectory, { recursive: true });
  await assert.rejects(f.run("Common name,Latin name\nPlant,Species\n"), { code: "ENOENT" });
});
