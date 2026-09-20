import assert from "node:assert/strict";
import test from "node:test";
import { createGeoTransform, getGeoTransform } from "../src/lib/geoCalibration.ts";
import { getMapFitZoom } from "../src/lib/mapViewport.ts";

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} should equal ${expected}`);
}

const west = { lat: 40, lng: -74, mapX: 100, mapY: 300 };
const east = { lat: 40, lng: -73.999, mapX: 200, mapY: 300 };

test("unconfigured, invalid and coincident calibrations disable GPS", () => {
  assert.equal(getGeoTransform(), null);
  assert.equal(createGeoTransform(null), null);
  assert.equal(createGeoTransform([west, west]), null);
  assert.equal(createGeoTransform([west, { ...east, mapX: 100 }]), null);
  for (const field of ["lat", "lng", "mapX", "mapY"]) {
    assert.equal(createGeoTransform([west, { ...east, [field]: NaN }]), null);
    assert.equal(createGeoTransform([west, { ...east, [field]: Infinity }]), null);
  }
  assert.equal(createGeoTransform([west, { ...east, lat: 91 }]), null);
  assert.equal(createGeoTransform([west, { ...east, lng: 181 }]), null);
});

test("calibration maps both references exactly and scales accuracy in meters", () => {
  const transform = createGeoTransform([west, east]);
  for (const point of [west, east]) {
    const actual = transform.toMapXY(point.lat, point.lng);
    close(actual.x, point.mapX);
    close(actual.y, point.mapY);
  }
  const referenceMeters = 6371000 * Math.PI / 180 * 0.001 * Math.cos(40 * Math.PI / 180);
  close(transform.metersToPixels(referenceMeters), 100);
  close(transform.metersToPixels(0), 0);
});

test("north lies above an east-west baseline, not mirrored below it", () => {
  const transform = createGeoTransform([west, east]);
  const north = transform.toMapXY(west.lat + 0.001, west.lng);
  const south = transform.toMapXY(west.lat - 0.001, west.lng);
  close(north.x, west.mapX);
  assert.ok(north.y < west.mapY);
  assert.ok(south.y > west.mapY);
});

test("rotated calibrations preserve handedness away from the reference line", () => {
  const transform = createGeoTransform([west, { ...east, mapX: 100, mapY: 400 }]);
  const north = transform.toMapXY(west.lat + 0.001, west.lng);
  assert.ok(north.x > west.mapX);
  close(north.y, west.mapY);
});

test("reversing equal-latitude reference points produces the same projection", () => {
  const a = createGeoTransform([west, east]).toMapXY(40.0005, -73.9995);
  const b = createGeoTransform([east, west]).toMapXY(40.0005, -73.9995);
  close(a.x, b.x);
  close(a.y, b.y);
});

test("fit zoom adapts downward after rotating to a narrower screen", () => {
  const wide = getMapFitZoom(1560, 1060, 1000, 800);
  const narrow = getMapFitZoom(1560, 1060, 360, 500);
  assert.ok(narrow < wide);
  for (const [w, h, zoom] of [[1000, 800, wide], [360, 500, narrow]]) {
    assert.ok(1560 * 2 ** zoom <= w);
    assert.ok(1060 * 2 ** zoom <= h);
    assert.equal(zoom % 0.25, -0);
  }
});

test("fit zoom respects both aspect ratios and snaps to quarter levels", () => {
  assert.equal(getMapFitZoom(1560, 1060, 1560, 1060), 0);
  assert.equal(getMapFitZoom(1560, 1060, 780, 530), -1);
  assert.equal(getMapFitZoom(1560, 1060, 3120, 2120), 1);
  assert.equal(getMapFitZoom(1560, 1060, 3120, 530), -1);
});

test("hidden or invalid containers do not establish an unusable fit zoom", () => {
  assert.equal(getMapFitZoom(1560, 1060, 0, 500), null);
  assert.equal(getMapFitZoom(1560, 1060, 300, 0), null);
  assert.equal(getMapFitZoom(1560, 1060, NaN, 500), null);
  assert.equal(getMapFitZoom(1560, 1060, 300, Infinity), null);
});
