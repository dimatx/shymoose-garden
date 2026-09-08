// @ts-check
/**
 * Shared helpers for reading the ShyMoose Google Sheet CSV export.
 * Used by scripts/import-plants.mjs and scripts/gen-3mf.mjs.
 */

/** @param {string} url */
export async function fetchCsv(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} fetching the sheet.`);
  }
  return await res.text(); // fetch decodes as UTF-8 → ®, ™ come through clean
}

/**
 * Minimal RFC-4180 CSV parser: handles quoted fields, escaped quotes (""),
 * and commas/newlines inside quotes. Returns an array of string[] rows.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  // Normalize newlines so \r\n and \r both behave.
  const s = text.replace(/\r\n?/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // Flush the final field/row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop entirely blank rows (the sheet has trailing empty ones).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Normalize a Latin name for comparison, KEEPING the cultivar.
 *
 * Different cultivars of the same species (e.g. Acer palmatum 'Crimson Queen'
 * vs 'Inaba-shidare' vs 'Tamukeyama', or the Heuchera / tomato / cucumber
 * cultivars) are DISTINCT plants. Stripping the cultivar collapses them all to
 * one key ("acer palmatum"), so as soon as one is published every other
 * cultivar in the sheet matches it and is silently skipped as a duplicate —
 * i.e. new plants go missing. Instead we flatten trademark marks, `var.`, and
 * all punctuation (including the cultivar quotes) to spaces and keep the
 * cultivar words, so "Acer palmatum 'Inaba-shidare'" and
 * "Acer palmatum 'Inaba shidare'" still compare equal, while 'Tamukeyama'
 * stays distinct.
 * @param {string} name
 */
export function normalizeLatin(name) {
  return name
    .toLowerCase()
    .replace(/[®™©]/g, " ")
    .replace(/\bvar\.?\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Normalize a URL for loose comparison (protocol/www/trailing-slash
 * insensitive). Used to match a plant's learnMoreUrl against the sheet's
 * "Full link" column.
 * @param {string} url
 */
export function normalizeUrl(url) {
  if (!url) return "";
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}
