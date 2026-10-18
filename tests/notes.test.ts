import assert from "node:assert/strict";
import test from "node:test";
import { noteEditorUrl } from "../src/lib/notes.ts";

test("new plant notes open the editor with the plant preselected", () => {
  assert.equal(
    noteEditorUrl("acer-crimson-queen"),
    "/admin/#/collections/notes/new?plant=acer-crimson-queen",
  );
});

test("existing notes open their actual file ID rather than creating a duplicate", () => {
  assert.equal(
    noteEditorUrl("acer-crimson-queen", "older-note"),
    "/admin/#/collections/notes/entries/older-note",
  );
});

test("note editor links encode values that could change the route", () => {
  assert.equal(
    noteEditorUrl("plant & cultivar"),
    "/admin/#/collections/notes/new?plant=plant+%26+cultivar",
  );
  assert.equal(
    noteEditorUrl("plant", "note?#"),
    "/admin/#/collections/notes/entries/note%3F%23",
  );
});
