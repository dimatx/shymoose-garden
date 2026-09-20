import assert from "node:assert/strict";
import { test } from "node:test";
import { compareCatalogItems, isSortMode, type SortMode } from "../src/lib/catalog.ts";

const plants = [
  { name: "Archived", archived: true, added: 300 },
  { name: "Undated", archived: false, added: 0 },
  { name: "Beta", archived: false, added: 200 },
  { name: "Alpha", archived: false, added: 100 },
  { name: "Alpine", archived: false, added: 100 },
];

for (const [mode, expected] of [
  ["name", ["Alpha", "Alpine", "Beta", "Undated", "Archived"]],
  ["name-desc", ["Undated", "Beta", "Alpine", "Alpha", "Archived"]],
  ["recent", ["Beta", "Alpha", "Alpine", "Undated", "Archived"]],
  ["oldest", ["Alpha", "Alpine", "Beta", "Undated", "Archived"]],
] satisfies [SortMode, string[]][]) {
  test(`catalog ${mode} preserves archive, date and tie ordering`, () => {
    assert.deepEqual([...plants].sort((a, b) => compareCatalogItems(a, b, mode)).map((p) => p.name), expected);
  });
}

test("only supported sort modes are accepted", () => {
  assert.equal(isSortMode("recent"), true);
  assert.equal(isSortMode("unknown"), false);
  assert.equal(isSortMode(undefined), false);
});
