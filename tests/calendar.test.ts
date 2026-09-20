import assert from "node:assert/strict";
import { test } from "node:test";
import { monthAt, monthDistance, distanceToNext, distanceToRunEnd, orderRows } from "../src/lib/calendar-order.ts";

test("month arithmetic wraps in either direction", () => {
  assert.equal(monthAt(12, 1), 1);
  assert.equal(monthAt(1, -1), 12);
  assert.equal(monthAt(1, -25), 12);
  assert.equal(monthDistance(12, 2), 2);
});

test("winter runs wrap, empty and year-round calendars terminate", () => {
  assert.equal(distanceToNext([], 12), 12);
  assert.equal(distanceToRunEnd([], 12), 12);
  assert.equal(distanceToRunEnd([11, 12, 1, 2], 12), 2);
  assert.equal(distanceToRunEnd(Array.from({ length: 12 }, (_, i) => i + 1), 12), 11);
});

test("calendar sorts active, ending soon, upcoming, and alphabetical ties without mutation", () => {
  const rows = [
    { name: "Future", months: [3] },
    { name: "Winter", months: [11, 12, 1, 2] },
    { name: "Zebra", months: [12] },
    { name: "Alpha", months: [12] },
  ];
  assert.deepEqual(orderRows(rows, 12).map((row) => row.name), ["Alpha", "Zebra", "Winter", "Future"]);
  assert.equal(rows[0].name, "Future");
});
