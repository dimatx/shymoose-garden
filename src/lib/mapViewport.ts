/** CRS.Simple fit zoom, independent of the map's previous min/max zoom limits. */
export function getMapFitZoom(
  mapWidth: number,
  mapHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  zoomSnap = 0.25,
): number | null {
  if (![mapWidth, mapHeight, viewportWidth, viewportHeight, zoomSnap].every(
    (value) => Number.isFinite(value) && value > 0,
  )) return null;

  const zoom = Math.log2(Math.min(viewportWidth / mapWidth, viewportHeight / mapHeight));
  return Math.floor(zoom / zoomSnap) * zoomSnap;
}
