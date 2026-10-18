/**
 * Pure rules for the garden notes editor at /admin/. Notes live in
 * `src/content/notes/<plant-slug>.md` as a one-line frontmatter (`plant`) plus a
 * Markdown body, and are read and written through the GitHub Contents API.
 */
export const NOTES_REPO = "dimatx/shymoose-garden";
export const NOTES_BRANCH = "main";
export const NOTES_DIR = "src/content/notes";

export function notePath(plantId: string): string {
  return `${NOTES_DIR}/${plantId}.md`;
}

/** Line endings and surrounding blank space never count as a change. */
export function normalizeNote(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

export function serializeNote(plantId: string, body: string): string {
  return `---\nplant: ${plantId}\n---\n\n${normalizeNote(body)}\n`;
}

export function parseNote(file: string): string {
  const text = file.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const frontmatter = /^---\n[\s\S]*?\n---(?:\n|$)/.exec(text);
  return normalizeNote(frontmatter ? text.slice(frontmatter[0].length) : text);
}

export function encodeBase64Utf8(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** GitHub wraps base64 content at 60 columns; whitespace is not data. */
export function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export type NoteChange = "add" | "update" | "remove";

export function noteChange(hasPublishedNote: boolean, body: string): NoteChange | undefined {
  const empty = normalizeNote(body) === "";
  if (!hasPublishedNote) return empty ? undefined : "add";
  return empty ? "remove" : "update";
}

export function commitMessage(change: NoteChange, plantName: string): string {
  const verb = { add: "Add", update: "Update", remove: "Remove" }[change];
  return `${verb} garden notes for ${plantName}`;
}

/** Editor link for a plant; the editor loads that plant's published note itself. */
export function noteEditorUrl(plantId: string): string {
  return `/admin/?${new URLSearchParams({ plant: plantId })}`;
}