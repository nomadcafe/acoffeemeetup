/**
 * Opening-hours checks against the café's own clock.
 *
 * Places (New) `regularOpeningHours.periods` are expressed in the place's
 * local wall time (day 0–6, Sunday = 0). The old check compared them with
 * the *browser's* clock, so searching Tokyo from Beijing was an hour off
 * and planning a trip abroad could be wrong all day. Everything here works
 * in café-local wall time: "now" is shifted by the place's
 * `utcOffsetMinutes`, and a planned meeting time is taken as the wall time
 * the user typed — "Saturday 15:00" means 15:00 where the café is.
 */

/** Compact copy of one Places period: [day, minutes since midnight]. */
export interface OpeningPeriod {
  open: [number, number];
  /** Absent = open 24h from `open`. */
  close?: [number, number];
}

/** A moment as café-local wall time. */
export interface WallTime {
  day: number;
  minutes: number;
}

const MINUTES_PER_WEEK = 7 * 24 * 60;

export function periodsFromPlace(
  periods: google.maps.places.OpeningHoursPeriod[] | null | undefined,
): OpeningPeriod[] | undefined {
  if (!periods || periods.length === 0) return undefined;
  const out: OpeningPeriod[] = [];
  for (const p of periods) {
    if (!p.open) continue;
    out.push({
      open: [p.open.day, (p.open.hour ?? 0) * 60 + (p.open.minute ?? 0)],
      close: p.close ? [p.close.day, (p.close.hour ?? 0) * 60 + (p.close.minute ?? 0)] : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

/** True / false when the hours are known, undefined when they aren't. */
export function isOpenAt(periods: OpeningPeriod[] | undefined, at: WallTime): boolean | undefined {
  if (!periods) return undefined;
  const t = at.day * 1440 + at.minutes;
  for (const p of periods) {
    const start = p.open[0] * 1440 + p.open[1];
    // Google's convention: a single period with no close is open 24/7.
    if (!p.close) {
      if (periods.length === 1) return true;
      if (p.open[0] === at.day) return true;
      continue;
    }
    let end = p.close[0] * 1440 + p.close[1];
    // Wraps past the end of the week (Sat 22:00 → Sun 02:00).
    if (end <= start) end += MINUTES_PER_WEEK;
    if ((t >= start && t < end) || (t + MINUTES_PER_WEEK >= start && t + MINUTES_PER_WEEK < end)) {
      return true;
    }
  }
  return false;
}

/** Café-local wall time for an absolute instant. Falls back to the
 *  browser's clock when the place's offset is unknown. */
export function wallTimeAt(instantMs: number, utcOffsetMinutes: number | undefined): WallTime {
  if (utcOffsetMinutes == null) {
    const d = new Date(instantMs);
    return { day: d.getDay(), minutes: d.getHours() * 60 + d.getMinutes() };
  }
  const d = new Date(instantMs + utcOffsetMinutes * 60_000);
  return { day: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/** Parses the `<input type="datetime-local">` value ("2026-11-21T15:00"). */
export function parseMeetAt(value: string | null | undefined): { y: number; mo: number; d: number; h: number; mi: number } | null {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return { y, mo, d, h, mi };
}

/** The meeting time as café-local wall time (the typed value, as-is). */
export function meetAtWallTime(value: string): WallTime | null {
  const p = parseMeetAt(value);
  if (!p) return null;
  // Day of week of a calendar date doesn't depend on timezone.
  const day = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
  return { day, minutes: p.h * 60 + p.mi };
}

/** The meeting time as an absolute instant, read as the café's local time
 *  (browser-local when the offset is unknown). Used for proposals. */
export function meetAtInstant(value: string, utcOffsetMinutes: number | undefined): number | null {
  const p = parseMeetAt(value);
  if (!p) return null;
  if (utcOffsetMinutes == null) return new Date(p.y, p.mo - 1, p.d, p.h, p.mi).getTime();
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - utcOffsetMinutes * 60_000;
}

/** "Sat 15:00" in the UI locale, showing exactly the typed wall time. */
export function formatMeetAt(value: string, locale: string): string {
  const p = parseMeetAt(value);
  if (!p) return value;
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : locale, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi));
}
