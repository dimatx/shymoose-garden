// @ts-check
/**
 * Read selected top-level, single-line scalar fields without interpreting the
 * rest of the YAML. Unsupported scalar syntax fails closed rather than silently
 * changing plant identities, URLs, or printed sign text.
 * @param {string} text
 * @param {readonly string[]} keys
 * @returns {Record<string, string | undefined>}
 */
export function readScalars(text, keys) {
  const match = text.match(/^\uFEFF?---\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m);
  if (!match || match.index !== 0) throw new Error("Missing frontmatter block.");
  /** @type {Record<string, string | undefined>} */
  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z][A-Za-z0-9]*):[ \t]*(.*)$/);
    if (!field || !keys.includes(field[1])) continue;
    const [, key, raw] = field;
    if (Object.hasOwn(result, key)) throw new Error(`Duplicate frontmatter field: ${key}`);
    result[key] = scalar(raw.trim(), key);
  }
  return result;
}

/**
 * @param {string} value
 * @param {string} key
 * @returns {string}
 */
function scalar(value, key) {
  if (value.startsWith('"')) {
    const quoted = value.match(/^("(?:[^"\\]|\\.)*")[ \t]*(?:#.*)?$/);
    if (quoted) {
      try { return JSON.parse(quoted[1]); } catch { /* fail below */ }
    }
  } else if (value.startsWith("'")) {
    const quoted = value.match(/^'((?:[^']|'')*)'[ \t]*(?:#.*)?$/);
    if (quoted) return quoted[1].replaceAll("''", "'");
  } else if (!/^[>|[{&*!]/.test(value)) {
    const plain = value.replace(/(?:^|[ \t]+)#.*$/, "").trim();
    return /^(?:null|~)$/i.test(plain) ? "" : plain;
  }
  throw new Error(`Unsupported single-line scalar for ${key}: use a plain or quoted string.`);
}
