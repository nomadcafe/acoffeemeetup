

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export interface DaySlot {
  enabled: boolean;
  start: string;
  end: string;
}

export type Availability = Record<Weekday, DaySlot>;

const DEFAULT_SLOT: DaySlot = { enabled: false, start: '14:00', end: '17:00' };

function emptyAvailability(): Availability {
  const out = {} as Availability;
  for (const d of WEEKDAYS) out[d] = { ...DEFAULT_SLOT };
  return out;
}

export function parseInitialAvailability(raw: string | undefined): Availability {
  const out = emptyAvailability();
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return out;
    for (const d of WEEKDAYS) {
      const slot = (parsed as Record<string, unknown>)[d];
      if (
        slot &&
        typeof slot === 'object' &&
        typeof (slot as DaySlot).enabled === 'boolean' &&
        typeof (slot as DaySlot).start === 'string' &&
        typeof (slot as DaySlot).end === 'string'
      ) {
        out[d] = { ...(slot as DaySlot) };
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}
