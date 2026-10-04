import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const dir = new URL("../src/content/plants/", import.meta.url);

test("every plant has a plausible dateAdded for the Recently added sort", () => {
  const today = new Date();
  today.setDate(today.getDate() + 1);
  const problems = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const match = readFileSync(new URL(file, dir), "utf8").match(/^dateAdded:\s*(\d{4}-\d{2}-\d{2})\s*$/m);
    if (!match) problems.push(`${file}: missing dateAdded`);
    else if (new Date(match[1]) > today) problems.push(`${file}: dateAdded ${match[1]} is in the future`);
  }
  assert.deepEqual(problems, []);
});
