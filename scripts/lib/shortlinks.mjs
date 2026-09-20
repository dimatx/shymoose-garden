// @ts-check
import { readScalars } from "./frontmatter.mjs";

/** @param {unknown} value */
export function validateShortUrl(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Invalid short URL.");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || /\s/.test(value)) {
    throw new Error("Short URL must be an HTTP(S) URL without credentials or whitespace.");
  }
  return value;
}

/**
 * @param {string} content
 * @param {string} shortUrl
 */
export function withShortUrl(content, shortUrl) {
  validateShortUrl(shortUrl);
  const fields = readScalars(content, ["shortUrl"]);
  if (fields.shortUrl) throw new Error("Plant already has a shortUrl.");
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const match = content.match(/^(\uFEFF?---\r?\n)([\s\S]*?)(^---[ \t]*(?:\r?\n|$))/m);
  if (!match) throw new Error("Missing frontmatter block.");
  const body = match[2].replace(/^shortUrl:[^\r\n]*(?:\r?\n|$)/m, "");
  // A callback keeps '$&', '$`', etc. in URLs/frontmatter literal.
  return content.replace(match[0], () =>
    `${match[1]}${body}shortUrl: ${JSON.stringify(shortUrl)}${eol}${match[3]}`);
}

/**
 * Restore a code without overwriting an existing link. A duplicate is only
 * recovered if its recorded destination exactly matches the requested one.
 * @param {{
 *   baseUrl: string,
 *   apiKey: string,
 *   customSlug: string,
 *   longUrl: string,
 *   title: string,
 *   fetchImpl?: typeof fetch
 * }} options
 * @returns {Promise<"created" | "exists">}
 */
export async function recoverShortUrl({
  baseUrl, apiKey, customSlug, longUrl, title, fetchImpl = fetch,
}) {
  const apiUrl = `${baseUrl.replace(/\/+$/, "")}/rest/v3/short-urls`;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Api-Key": apiKey,
  };
  const response = await fetchImpl(apiUrl, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    headers,
    body: JSON.stringify({ longUrl, title, customSlug, tags: ["garden"] }),
  });
  if (response.ok) return "created";

  const body = await response.text().catch(() => "");
  const duplicate = [400, 409].includes(response.status) &&
    /non[-_]unique[-_]slug|slug[-_]conflict|already in use/i.test(body);
  if (!duplicate) throw new Error(`Shlink recovery returned HTTP ${response.status}.`);

  let destination;
  try {
    const existing = await fetchImpl(`${apiUrl}/${encodeURIComponent(customSlug)}`, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers,
    });
    if (!existing.ok) throw new Error(`HTTP ${existing.status}`);
    /** @type {unknown} */
    const data = await existing.json();
    if (!data || typeof data !== "object" || !("longUrl" in data)) {
      throw new Error("response is missing longUrl");
    }
    destination = validateShortUrl(data.longUrl);
  } catch (error) {
    throw new Error(
      `Could not verify existing short URL ${customSlug}; left unchanged: ` +
      (error instanceof Error ? error.message : "unknown error"),
      { cause: error },
    );
  }
  if (destination !== longUrl) {
    throw new Error(`Existing short URL ${customSlug} points to a different destination; left unchanged.`);
  }
  return "exists";
}
