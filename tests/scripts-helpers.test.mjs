import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, normalizeLatin } from "../scripts/lib/sheet-csv.mjs";
import { readScalars } from "../scripts/lib/frontmatter.mjs";
import { validateShortUrl, withShortUrl } from "../scripts/lib/shortlinks.mjs";

test("CSV supports BOM, CRLF, embedded delimiters, escaped quotes and blank rows", () => {
  assert.deepEqual(parseCsv('\uFEFFname,latin\r\n"Common, name","Latin ""quoted""\r\nname"\r\n,,\r\nLast,Species'), [
    ["name", "latin"], ["Common, name", 'Latin "quoted"\nname'], ["Last", "Species"],
  ]);
});

for (const csv of ['name,"unfinished', 'name,"closed"junk', 'na"me,latin']) {
  test(`CSV rejects malformed input ${JSON.stringify(csv)}`, () => {
    assert.throws(() => parseCsv(csv), /Invalid CSV/);
  });
}

test("Latin matching preserves distinct cultivars", () => {
  assert.equal(normalizeLatin("Acer palmatum 'Inaba-shidare'"), normalizeLatin("Acer palmatum 'Inaba shidare'"));
  assert.notEqual(normalizeLatin("Acer 'Tamukeyama'"), normalizeLatin("Acer 'Crimson Queen'"));
});

test("scalar reader handles JSON escapes, YAML apostrophes, comments, CRLF and BOM", () => {
  const text = '\uFEFF---\r\nname: "Plant \\"Name\\"" # display\r\nlatinName: \'Solomon\'\'s Seal\'\r\nphoto: "../../a.jpg" # TODO\r\nshortUrl: https://example.com/a#part # note\r\ncare:\r\n  name: ignored\r\n---\r\nname: body\r\n';
  assert.deepEqual(readScalars(text, ["name", "latinName", "photo", "shortUrl"]), {
    name: 'Plant "Name"', latinName: "Solomon's Seal", photo: "../../a.jpg", shortUrl: "https://example.com/a#part",
  });
});

test("scalar reader fails closed on missing delimiters, duplicate keys and multiline fields", () => {
  for (const text of ["name: Nope", "---\nname: x\n---not-a-delimiter", "---\nname: x\nname: y\n---", "---\nname: >\n  folded\n---"]) {
    assert.throws(() => readScalars(text, ["name"]));
  }
  assert.deepEqual(readScalars("---\nname: x\nbody: |\n  multiline\n---", ["name"]), { name: "x" });
});

test("short URL insertion preserves body, CRLF, BOM and dollar replacement tokens", () => {
  const text = '\uFEFF---\r\nname: "Price $&"\r\nshortUrl: "" # not generated yet\r\n---\r\nBody $` and $\'\r\n';
  const url = "https://s.example.com/$&";
  const result = withShortUrl(text, url);
  assert.equal(result, '\uFEFF---\r\nname: "Price $&"\r\nshortUrl: "https://s.example.com/$&"\r\n---\r\nBody $` and $\'\r\n');
  assert.deepEqual(readScalars(result, ["shortUrl"]), { shortUrl: url });
  assert.throws(() => withShortUrl(result, url), /already/);
});

test("short URL insertion fills null values and appends absent fields", () => {
  for (const line of ["", "shortUrl:\n", "shortUrl: null\n", "shortUrl: ~\n"]) {
    assert.equal(withShortUrl(`---\nname: Plant\n${line}---\nBody`, "https://s.example/a"),
      '---\nname: Plant\nshortUrl: "https://s.example/a"\n---\nBody');
  }
});

test("short URL validation rejects empty, non-HTTP, credentialed and whitespace URLs", () => {
  for (const url of [null, "", "javascript:alert(1)", "https://user:pass@example.com/x", "https://example.com/a\nb", "not a URL"]) {
    assert.throws(() => validateShortUrl(url));
  }
  assert.equal(validateShortUrl("http://localhost/a"), "http://localhost/a");
});
