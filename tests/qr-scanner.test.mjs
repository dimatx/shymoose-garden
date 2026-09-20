import assert from "node:assert/strict";
import test from "node:test";
import { createQRScanner, qrDestination, scanDimensions } from "../src/scripts/qr-scanner.ts";

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function camera() {
  const result = { stops: 0 };
  result.getTracks = () => [{ stop: () => result.stops++ }];
  return result;
}

function harness(overrides = {}) {
  const stream = camera();
  const frames = new Map();
  const state = { shown: false, status: "", attached: null, reads: 0, requests: 0, navigations: [], hides: [] };
  let id = 0;
  let value = null;
  const scanner = createQRScanner({
    loadDecoder: async () => () => null,
    getStream: async () => { state.requests++; return stream; },
    attachStream: (stream) => { state.attached = stream; },
    detachStream: () => { state.attached = null; },
    play: async () => {},
    readCode: () => { state.reads++; return value; },
    requestFrame: (callback) => { frames.set(++id, callback); return id; },
    cancelFrame: (id) => frames.delete(id),
    show: () => { state.shown = true; },
    hide: (restoreFocus) => { state.shown = false; state.hides.push(restoreFocus); },
    setStatus: (message) => { state.status = message; },
    navigate: (url) => state.navigations.push(url),
    ...overrides,
  });
  return {
    scanner, stream, state, frames,
    code: (code) => { value = code; },
    tick(time) {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(time));
    },
  };
}

test("closing during lazy import never requests a camera", async () => {
  const load = deferred();
  const h = harness({ loadDecoder: () => load.promise });
  const pending = h.scanner.open();
  h.scanner.close();
  load.resolve(() => null);
  await pending;
  assert.equal(h.state.requests, 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.state.shown, false);
});

test("closing during permission prompt stops the eventual stream", async () => {
  const permission = deferred();
  const h = harness({ getStream: () => permission.promise });
  const pending = h.scanner.open();
  await Promise.resolve();
  h.scanner.close();
  permission.resolve(h.stream);
  await pending;
  assert.equal(h.stream.stops, 1);
  assert.equal(h.state.attached, null);
  assert.equal(h.frames.size, 0);
});

test("closing during video.play prevents a late animation loop", async () => {
  const play = deferred();
  const h = harness({ play: () => play.promise });
  const pending = h.scanner.open();
  await Promise.resolve();
  await Promise.resolve();
  h.scanner.close();
  play.resolve();
  await pending;
  assert.equal(h.stream.stops, 1);
  assert.equal(h.state.attached, null);
  assert.equal(h.frames.size, 0);
});

test("play failure stops and detaches the stream while keeping the error visible", async () => {
  const h = harness({ play: async () => { throw new Error("play failed"); } });
  await h.scanner.open();
  assert.equal(h.stream.stops, 1);
  assert.equal(h.state.attached, null);
  assert.equal(h.frames.size, 0);
  assert.equal(h.state.shown, true);
  assert.match(h.state.status, /Couldn't start/);
});

test("old permission results cannot replace a reopened camera", async () => {
  const permission = deferred();
  const oldStream = camera();
  const newStream = camera();
  let requests = 0;
  const h = harness({ getStream: () => ++requests === 1 ? permission.promise : Promise.resolve(newStream) });
  const pending = h.scanner.open();
  await Promise.resolve();
  h.scanner.close();
  await h.scanner.open();
  permission.resolve(oldStream);
  await pending;
  assert.equal(oldStream.stops, 1);
  assert.equal(newStream.stops, 0);
  assert.equal(h.state.attached, newStream);
  assert.equal(h.frames.size, 1);
});

test("old play rejections cannot stop a reopened camera or overwrite its status", async () => {
  const play = deferred();
  let plays = 0;
  const h = harness({ play: () => ++plays === 1 ? play.promise : Promise.resolve() });
  const pending = h.scanner.open();
  await Promise.resolve();
  await Promise.resolve();
  h.scanner.close();
  await h.scanner.open();
  play.reject(new Error("old play failed"));
  await pending;
  assert.equal(h.state.attached, h.stream);
  assert.equal(h.state.status, "Point at a plant QR code");
  assert.equal(h.frames.size, 1);
  assert.equal(h.stream.stops, 1);
});

test("invalid QR reports an error and keeps scanning until an http(s) URL is found", async () => {
  const h = harness();
  await h.scanner.open();
  h.code("javascript:alert(1)");
  h.tick(0);
  assert.equal(h.state.shown, true);
  assert.equal(h.stream.stops, 0);
  assert.match(h.state.status, /isn't a web link/);
  assert.equal(h.frames.size, 1);
  h.code("https://s.shymoose.com/plant");
  h.tick(150);
  assert.deepEqual(h.state.navigations, ["https://s.shymoose.com/plant"]);
  assert.equal(h.state.shown, false);
  assert.equal(h.stream.stops, 1);
  assert.equal(h.frames.size, 0);
  assert.deepEqual(h.state.hides, [true]);
});

test("decoding is throttled and closing cancels the animation", async () => {
  const h = harness();
  await h.scanner.open();
  for (const time of [0, 16, 32, 100, 149, 150, 160, 299, 300]) h.tick(time);
  assert.equal(h.state.reads, 3);
  h.scanner.close();
  assert.equal(h.frames.size, 0);
  h.tick(450);
  assert.equal(h.state.reads, 3);
});

test("decoder failure releases the camera and reports a recoverable error", async () => {
  const h = harness({ readCode: () => { throw new Error("canvas unavailable"); } });
  await h.scanner.open();
  h.tick(0);
  assert.equal(h.stream.stops, 1);
  assert.equal(h.state.attached, null);
  assert.equal(h.frames.size, 0);
  assert.match(h.state.status, /Couldn't read/);
});

test("disposal invalidates pending work and prevents future starts", async () => {
  const permission = deferred();
  const h = harness({ getStream: () => permission.promise });
  const pending = h.scanner.open();
  await Promise.resolve();
  h.scanner.dispose();
  permission.resolve(h.stream);
  await pending;
  await h.scanner.open();
  assert.equal(h.stream.stops, 1);
  assert.equal(h.state.shown, false);
  assert.equal(h.frames.size, 0);
  assert.deepEqual(h.state.hides, [false]);
});

test("unavailable camera and decoder load failures leave a closable error", async () => {
  for (const overrides of [
    { getStream: undefined },
    { loadDecoder: async () => { throw new Error("offline"); } },
  ]) {
    const h = harness(overrides);
    await h.scanner.open();
    assert.equal(h.state.requests, 0);
    assert.equal(h.state.shown, true);
    assert.match(h.state.status, /https|Couldn't load/);
    h.scanner.close();
    assert.equal(h.state.shown, false);
  }
});

test("repeated opens do not acquire duplicate streams", async () => {
  const h = harness();
  await Promise.all([h.scanner.open(), h.scanner.open()]);
  assert.equal(h.state.requests, 1);
  assert.equal(h.frames.size, 1);
});

test("URL policy preserves arbitrary absolute http(s) destinations only", () => {
  assert.equal(qrDestination("http://example.org/a?q=1#plant"), "http://example.org/a?q=1#plant");
  assert.equal(qrDestination("https://external.example/"), "https://external.example/");
  for (const input of ["", "a plant", "/plants/maple", "//example.org", "data:text/html,test", "javascript:alert(1)", "ftp://example.org"]) {
    assert.equal(qrDestination(input), null, input);
  }
});

test("decode dimensions stay bounded, proportional, and never upscale", () => {
  assert.deepEqual(scanDimensions(3840, 2160), { width: 960, height: 540 });
  assert.deepEqual(scanDimensions(1080, 1920), { width: 540, height: 960 });
  assert.deepEqual(scanDimensions(640, 480), { width: 640, height: 480 });
  assert.equal(scanDimensions(0, 0), null);
});
