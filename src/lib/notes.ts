export function noteEditorUrl(plantId: string, noteId?: string): string {
  const collection = "/admin/#/collections/notes";
  return noteId
    ? `${collection}/entries/${encodeURIComponent(noteId)}`
    : `${collection}/new?${new URLSearchParams({ plant: plantId })}`;
}
