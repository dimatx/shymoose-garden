import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function missingDependencies(packages) {
  const missing = [];
  for (const [location, entry] of Object.entries(packages)) {
    for (const dependency of Object.keys(entry.dependencies ?? {})) {
      const ancestors = location.split("/");
      let found = false;
      while (true) {
        const candidate = [...ancestors.filter(Boolean), "node_modules", dependency].join("/");
        if (Object.hasOwn(packages, candidate)) {
          found = true;
          break;
        }
        if (ancestors.length === 0) break;
        ancestors.pop();
      }
      if (!found) missing.push(`${location || "(root)"} -> ${dependency}`);
    }
  }
  return missing;
}

test("lockfile includes required dependencies of every package, including other platforms", () => {
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.deepEqual(missingDependencies(lock.packages), []);
});

test("missing dependencies of optional platform packages are not silently ignored", () => {
  assert.deepEqual(missingDependencies({
    "node_modules/@img/sharp-wasm32": {
      optional: true,
      cpu: ["wasm32"],
      dependencies: { "@emnapi/runtime": "^1.7.0" },
    },
  }), ["node_modules/@img/sharp-wasm32 -> @emnapi/runtime"]);
});

test("both nested and hoisted required dependencies resolve", () => {
  assert.deepEqual(missingDependencies({
    "": { dependencies: { outer: "*" } },
    "node_modules/outer": { dependencies: { inner: "*" } },
    "node_modules/outer/node_modules/inner": {
      dependencies: { "@scope/nested": "*", hoisted: "*" },
    },
    "node_modules/outer/node_modules/@scope/nested": {},
    "node_modules/hoisted": {},
  }), []);
});
