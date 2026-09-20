import assert from "node:assert/strict";
import test from "node:test";
import { createMapLifecycle } from "../src/lib/mapLifecycle.ts";

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function fixture(overrides = {}) {
  const state = {
    container: {},
    enabled: true,
    loads: 0,
    visibility: [],
    initialized: [],
    disposed: 0,
    errors: [],
  };
  const lifecycle = createMapLifecycle({
    getContainer: () => state.container,
    isEnabled: () => state.enabled,
    setVisibility: (enabled) => state.visibility.push(enabled),
    load: async () => { state.loads++; return "leaflet"; },
    initialize: (container, dependencies, signal) => {
      state.initialized.push({ container, dependencies, signal });
      signal.addEventListener("abort", () => state.disposed++);
    },
    onError: (error) => state.errors.push(error),
    ...overrides,
  });
  return { state, ...lifecycle };
}

test("locked map and non-map pages never load Leaflet", async () => {
  const f = fixture();
  f.state.enabled = false;
  await f.start();
  f.state.enabled = true;
  f.state.container = null;
  await f.start();
  assert.equal(f.state.loads, 0);
  assert.deepEqual(f.state.visibility, [false, true]);
});

test("beta flag and visibility are re-evaluated on every navigation", async () => {
  const f = fixture();
  f.state.enabled = false;
  await f.start();
  f.state.enabled = true;
  await f.start();
  f.state.enabled = false;
  await f.start();
  assert.deepEqual(f.state.visibility, [false, true, false]);
  assert.equal(f.state.initialized.length, 1);
  assert.equal(f.state.disposed, 1);
});

test("initial invocation and Astro page-load cannot double initialize", async () => {
  const pending = deferred();
  let loads = 0;
  const f = fixture({ load: () => { loads++; return pending.promise; } });
  const start = f.start();
  await f.start();
  pending.resolve("leaflet");
  await start;
  await f.start();
  assert.equal(loads, 1);
  assert.equal(f.state.initialized.length, 1);
});

test("navigation cancels initialization while dependencies are loading", async () => {
  const pending = deferred();
  const f = fixture({ load: () => pending.promise });
  const start = f.start();
  f.destroy();
  pending.resolve("leaflet");
  await start;
  assert.equal(f.state.initialized.length, 0);
});

test("a stale load cannot initialize or tear down the replacement page", async () => {
  const first = deferred();
  const second = deferred();
  let loads = 0;
  const f = fixture({ load: () => (++loads === 1 ? first.promise : second.promise) });
  const startFirst = f.start();
  f.state.container = {};
  const replacement = f.state.container;
  const startSecond = f.start();
  second.resolve("new");
  await startSecond;
  first.reject(new Error("obsolete network error"));
  await startFirst;
  assert.equal(f.state.initialized.length, 1);
  assert.equal(f.state.initialized[0].container, replacement);
  assert.equal(f.state.disposed, 0);
  assert.deepEqual(f.state.errors, []);
});

test("page swaps clean up once, and returning to the map starts a fresh lifetime", async () => {
  const f = fixture();
  await f.start();
  f.destroy();
  f.destroy();
  f.state.container = {};
  await f.start();
  assert.equal(f.state.initialized[0].signal.aborted, true);
  assert.equal(f.state.initialized[1].signal.aborted, false);
  assert.equal(f.state.disposed, 1);
});

test("initialization failure aborts partial resources and allows retry", async () => {
  let attempts = 0;
  let cleaned = 0;
  const f = fixture({
    initialize: (_container, _dependencies, signal) => {
      signal.addEventListener("abort", () => cleaned++);
      if (++attempts === 1) throw new Error("failed to initialize");
    },
  });
  await f.start();
  assert.equal(cleaned, 1);
  assert.equal(f.state.errors.length, 1);
  await f.start();
  assert.equal(attempts, 2);
  f.destroy();
  assert.equal(cleaned, 2);
});
