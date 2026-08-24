/**
 * Ties the garden map's own pixel coordinate space (see public/map/garden-map.svg
 * and its 1560×1060 viewBox — the same space every plant's mapX/mapY is
 * plotted in) to real-world GPS coordinates, so a phone's GPS fix can be
 * drawn as a "you are here" dot on the map.
 *
 * HOW TO CALIBRATE (fill in REF_POINTS below):
 * 1. Pick two distinct, easy-to-stand-at spots on the property, as far apart
 *    from each other as practical (accuracy improves the farther apart they
 *    are). Two opposite house corners are a natural choice, since we
 *    already know their exact pixel position from the SVG trace: the
 *    current house footprint's far corners are at (455, 300) and (985, 600)
 *    — see public/map/garden-map.svg. Any two well-separated, identifiable
 *    spots work, though; they don't have to be those two.
 * 2. Physically stand at each spot and get a GPS reading — e.g. drop a pin
 *    in Google/Apple Maps and read its lat/lng, or use a phone GPS app.
 * 3. Fill in REF_POINTS with both points' {lat, lng, mapX, mapY}.
 *
 * Two points are enough to solve for rotation + scale + translation (a
 * "Helmert"/similarity transform) between GPS space and map-pixel space —
 * the SVG trace isn't aligned to true north, so a plain linear scale isn't
 * enough, but a residential yard is small enough that this rigid transform
 * (no independent stretch per axis, no distortion) is a very good fit.
 */
export interface GeoRefPoint {
  lat: number;
  lng: number;
  mapX: number;
  mapY: number;
}

// TODO: fill these in once you have two real GPS readings (see above).
// Leaving this null disables "locate me" entirely — its button simply
// doesn't render (see map.astro) — so nothing else depends on it.
export const REF_POINTS: [GeoRefPoint, GeoRefPoint] | null = null;

export interface GeoTransform {
  /** Convert a GPS fix to {x, y} in the map's pixel space. */
  toMapXY(lat: number, lng: number): { x: number; y: number };
  /** Convert a GPS accuracy radius (meters) to the equivalent radius in map
   * pixels, for drawing an accuracy circle around the "you are here" dot. */
  metersToPixels(meters: number): number;
}

const EARTH_RADIUS_M = 6371000;

// Equirectangular approximation of lat/lng -> local flat meters, centered on
// a reference origin. Earth's curvature is negligible at a residential-lot
// scale (a few hundred feet), so this is plenty accurate here.
function toLocalMeters(
  lat: number,
  lng: number,
  originLat: number,
  originLng: number,
) {
  const latRad = (originLat * Math.PI) / 180;
  const dLat = ((lat - originLat) * Math.PI) / 180;
  const dLng = ((lng - originLng) * Math.PI) / 180;
  return {
    x: dLng * Math.cos(latRad) * EARTH_RADIUS_M,
    y: dLat * EARTH_RADIUS_M,
  };
}

let cachedTransform: GeoTransform | null | undefined;

/**
 * Returns null (and caches that) when REF_POINTS isn't configured yet, so
 * callers can just check `getGeoTransform() !== null` to decide whether to
 * show any "locate me" UI at all.
 */
export function getGeoTransform(): GeoTransform | null {
  if (cachedTransform !== undefined) return cachedTransform;

  if (!REF_POINTS) {
    cachedTransform = null;
    return null;
  }

  const [a, b] = REF_POINTS;
  const bMeters = toLocalMeters(b.lat, b.lng, a.lat, a.lng);

  const dMeters = { x: bMeters.x, y: bMeters.y }; // aMeters is always {0,0}
  const dPixels = { x: b.mapX - a.mapX, y: b.mapY - a.mapY };
  const meterDist = Math.hypot(dMeters.x, dMeters.y);
  const pixelDist = Math.hypot(dPixels.x, dPixels.y);

  if (meterDist === 0 || pixelDist === 0) {
    // Degenerate calibration (identical points) — treat as unconfigured
    // rather than dividing by zero.
    cachedTransform = null;
    return null;
  }

  const scale = pixelDist / meterDist; // pixels per meter
  const rotation =
    Math.atan2(dPixels.y, dPixels.x) - Math.atan2(dMeters.y, dMeters.x);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  cachedTransform = {
    toMapXY(lat, lng) {
      const m = toLocalMeters(lat, lng, a.lat, a.lng);
      const scaledX = m.x * scale;
      const scaledY = m.y * scale;
      return {
        x: a.mapX + (scaledX * cos - scaledY * sin),
        y: a.mapY + (scaledX * sin + scaledY * cos),
      };
    },
    metersToPixels(meters) {
      return meters * scale;
    },
  };
  return cachedTransform;
}
