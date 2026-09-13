/**
 * Month maths shared by the calendar's server render and its client script.
 *
 * The calendars are cyclical: what matters in the garden isn't "January comes
 * first", it's "what's happening now, and what's coming next". Everything here
 * works in *distance from the current month* (0–11, wrapping past December) so
 * both the row order and the month columns can start at today.
 *
 * Kept free of `astro:` imports on purpose — the browser bundle imports it too,
 * so the ordering can be recomputed for the visitor's real current month
 * instead of whatever month the site was last built in.
 */

/** A row on a calendar: the months it's active, and a name to break ties. */
export interface MonthRow {
  name: string;
  months: number[]; // 1–12 (1 = January)
}

/**
 * How many months the chart shows at once. Two fixed sizes rather than
 * "however many fit": a window that sizes itself to the viewport lands on
 * awkward counts and leaves the columns too thin to read at a glance.
 *
 * Shared with the server render so the pre-hydration markup already shows the
 * right window — otherwise every desktop load would flash a denser chart
 * before the script trimmed it.
 */
export const WINDOW_WIDE = 6;
/** Fallback window for phone-width screens, where six columns won't fit. */
export const WINDOW_NARROW = 3;

/** Months from `from` to `to`, wrapping around the year end. 0–11. */
export function monthDistance(from: number, to: number): number {
  return (to - from + 12) % 12;
}

/** The month `distance` months after `from`. */
export function monthAt(from: number, distance: number): number {
  return ((from - 1 + distance) % 12 + 12) % 12 + 1;
}

/**
 * Months until this row is next active — 0 when it's active right now, 1 when
 * it starts next month, 11 when it only just finished.
 */
export function distanceToNext(months: number[], now: number): number {
  if (months.length === 0) return 12;
  return Math.min(...months.map((m) => monthDistance(now, m)));
}

/**
 * Months until the *end* of that same run of activity. Used to break ties so
 * that among plants active now, the ones finishing soonest come first.
 */
export function distanceToRunEnd(months: number[], now: number): number {
  const active = new Set(months);
  let distance = distanceToNext(months, now);
  if (distance >= 12) return 12;
  // Walk forward while the run continues, capped at a full year so a plant
  // that's active every month can't loop forever.
  while (distance < 11 && active.has(monthAt(now, distance + 1))) distance++;
  return distance;
}

/**
 * Order rows the way the garden reads in person: what's happening this month
 * at the top, then what's coming next, with whatever just wrapped up at the
 * bottom.
 */
export function orderRows<T extends MonthRow>(rows: readonly T[], now: number): T[] {
  return [...rows].sort((a, b) => {
    const nextA = distanceToNext(a.months, now);
    const nextB = distanceToNext(b.months, now);
    if (nextA !== nextB) return nextA - nextB;
    const endA = distanceToRunEnd(a.months, now);
    const endB = distanceToRunEnd(b.months, now);
    if (endA !== endB) return endA - endB;
    return a.name.localeCompare(b.name);
  });
}
