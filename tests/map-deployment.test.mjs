import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rules = [];
for (const line of readFileSync(new URL("../public/_headers", import.meta.url), "utf8").split(/\r?\n/)) {
  if (!line.trim() || line.startsWith("#")) continue;
  if (!/^\s/.test(line)) {
    const pattern = line.trim().split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    rules.push({ path: new RegExp(`^${pattern}$`), headers: [] });
  } else {
    const [, name, value] = line.match(/^\s+([^:]+):\s*(.*)$/);
    rules.at(-1).headers.push([name.toLowerCase(), value]);
  }
}

function headersFor(path, name) {
  return rules.filter((rule) => rule.path.test(path))
    .flatMap((rule) => rule.headers)
    .filter(([key]) => key === name)
    .map(([, value]) => value);
}

test("deployed map permits same-origin GPS without permitting third-party location", () => {
  assert.deepEqual(headersFor("/map/", "permissions-policy"), [
    "geolocation=(self), microphone=(), camera=(self)",
  ]);
});

test("clean HTML routes receive background revalidation caching", () => {
  for (const path of ["/", "/404.html", "/plants/example/", "/plants/example/index.html", "/map", "/map/", "/bloom", "/bloom/", "/pruning", "/pruning/"]) {
    assert.deepEqual(headersFor(path, "cache-control"), [
      "public, max-age=0, stale-while-revalidate=60",
    ], path);
  }
});

test("HTML caching does not override immutable bundles or target the map SVG", () => {
  assert.deepEqual(headersFor("/_astro/map.abc123.js", "cache-control"), [
    "public, max-age=31536000, immutable",
  ]);
  assert.deepEqual(headersFor("/map/garden-map.svg", "cache-control"), []);
});
