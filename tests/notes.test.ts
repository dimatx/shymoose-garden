import assert from "node:assert/strict";
import test from "node:test";
import {
  commitMessage,
  decodeBase64Utf8,
  encodeBase64Utf8,
  noteChange,
  noteEditorUrl,
  notePath,
  parseNote,
  serializeNote,
} from "../src/lib/notes.ts";

test("plant pages link to the editor for their own plant", () => {
  assert.equal(noteEditorUrl("acer-crimson-queen"), "/admin/?plant=acer-crimson-queen");
  assert.equal(noteEditorUrl("plant & cultivar"), "/admin/?plant=plant+%26+cultivar");
});

test("each plant has exactly one note file, named by its slug", () => {
  assert.equal(notePath("allium-avatar"), "src/content/notes/allium-avatar.md");
});

test("notes round-trip through the content collection's file format", () => {
  const file = serializeNote("allium-avatar", "  First line\r\n\r\n- bloomed **early**  \n");
  assert.equal(file, "---\nplant: allium-avatar\n---\n\nFirst line\n\n- bloomed **early**\n");
  assert.equal(parseNote(file), "First line\n\n- bloomed **early**");
});

test("existing notes written by the old editor still parse", () => {
  assert.equal(parseNote("\uFEFF---\r\nplant: allium-avatar\r\n---\r\n\r\nTest notes from Dima\r\n"), "Test notes from Dima");
  assert.equal(parseNote("---\nplant: x\n---"), "");
});

test("GitHub base64 content keeps non-ASCII characters intact", () => {
  const text = "Ünd — frost ❄️ on 3/14 🌱";
  assert.equal(decodeBase64Utf8(encodeBase64Utf8(text)), text);
  const wrapped = encodeBase64Utf8(text).replace(/(.{8})/g, "$1\n");
  assert.equal(decodeBase64Utf8(wrapped), text);
});

test("publishing chooses add, update, or remove from what is already published", () => {
  assert.equal(noteChange(false, "  "), undefined);
  assert.equal(noteChange(false, "New"), "add");
  assert.equal(noteChange(true, "Changed"), "update");
  assert.equal(noteChange(true, "\n"), "remove");
  assert.equal(commitMessage("add", "Allium 'Avatar'"), "Add garden notes for Allium 'Avatar'");
  assert.equal(commitMessage("remove", "Hosta"), "Remove garden notes for Hosta");
});
