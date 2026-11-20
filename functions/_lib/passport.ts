import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { createAuth, type AuthEnv } from './auth';
import type { getDb } from './db';
import { bookings, visitedShops } from './db/schema';
import {
  MAX_REMOVED_VISITS,
  mergeRemoved,
  mergeVisitHistory,
  mergeVisits,
} from '../../src/utils/visitMerge';

export { mergeVisits };

// Wire format mirrors `VisitedShopSnapshot` in src/types/index.ts.
// DB stores visits as JSON; the client always sees number[].
// `updatedAt` is the LWW key for non-visit fields. Visit history merges as a
// two-phase set (visits minus removedVisits) — see src/utils/visitMerge.ts.
export const VisitedShopWireSchema = z.object({
  id: z.string().min(1).max(256),
  name: z.string().min(1).max(512),
  address: z.string().max(1024),
  lat: z.number().finite(),
  lng: z.number().finite(),
  googleMapsUri: z.string().url().max(1024).optional(),
  city: z.string().max(128).optional(),
  visits: z.array(z.number().int().nonnegative()).max(2000),
  /* Visit timestamps the user deleted. Grow-only; older clients omit it. */
  removedVisits: z.array(z.number().int().nonnegative()).max(MAX_REMOVED_VISITS).optional(),
  /* Map of `{ visitTs: noteText }` — only for visits that have a note. Each
   * note capped to 500 chars; the whole map at 200 keys to bound payload. */
  visitNotes: z.record(z.string(), z.string().max(500)).optional(),
  /* Per-visit star rating, 1–5. Same sparse keying as visitNotes. */
  visitRatings: z.record(z.string(), z.number().int().min(1).max(5)).optional(),
  updatedAt: z.number().int().nonnegative(),
  deleted: z.boolean().optional(),
});
export type VisitedShopWire = z.infer<typeof VisitedShopWireSchema>;

export type VisitedShopRow = typeof visitedShops.$inferSelect;
type Db = ReturnType<typeof getDb>;

export function rowToWire(row: VisitedShopRow): VisitedShopWire {
  const notes = parseNotes(row.visitNotes);
  const ratings = parseRatings(row.visitRatings);
  const removed = parseVisits(row.removedVisits);
  return {
    id: row.placeId,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    googleMapsUri: row.googleMapsUri ?? undefined,
    city: row.city ?? undefined,
    visits: parseVisits(row.visits),
    removedVisits: removed.length > 0 ? removed : undefined,
    visitNotes: Object.keys(notes).length > 0 ? notes : undefined,
    visitRatings: Object.keys(ratings).length > 0 ? ratings : undefined,
    updatedAt: asMs(row.updatedAt),
    deleted: row.deleted || undefined,
  };
}

function parseVisits(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n) => typeof n === 'number' && Number.isFinite(n));
  } catch {
    return [];
  }
}

function parseNotes(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.length > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function parseRatings(raw: string): Record<string, number> {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 1 && n <= 5) out[k] = Math.round(n);
    }
    return out;
  } catch {
    return {};
  }
}

export function asMs(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  return 0;
}

/** Column values for an insert/update of one visited_shops row. */
export interface MergedVisitedRow {
  name: string;
  address: string;
  lat: number;
  lng: number;
  googleMapsUri: string | null;
  city: string | null;
  visits: number[];
  removedVisits: number[];
  visitNotes: Record<string, string>;
  visitRatings: Record<string, number>;
  updatedAt: Date;
  deleted: boolean;
}

function rowSide(row: VisitedShopRow) {
  return {
    visits: parseVisits(row.visits),
    removedVisits: parseVisits(row.removedVisits),
    visitNotes: parseNotes(row.visitNotes),
    visitRatings: parseRatings(row.visitRatings),
  };
}

/**
 * LWW row merge for visited_shops. Display fields + notes/ratings take the
 * side with the newer `updatedAt` (ties keep the stored row); visit history
 * merges as visits ∪ visits minus removed ∪ removed, so an offline-queued
 * upsert never loses a visit the user recorded, and a deleted visit stays
 * deleted.
 */
export function mergeVisitedRow(
  prev: VisitedShopRow | undefined,
  incoming: VisitedShopWire,
): MergedVisitedRow {
  const incomingSide = {
    visits: incoming.visits,
    removedVisits: incoming.removedVisits ?? [],
    visitNotes: incoming.visitNotes ?? {},
    visitRatings: incoming.visitRatings ?? {},
  };
  if (!prev) {
    const h = mergeVisitHistory(incomingSide, { visits: [] });
    return {
      name: incoming.name,
      address: incoming.address,
      lat: incoming.lat,
      lng: incoming.lng,
      googleMapsUri: incoming.googleMapsUri ?? null,
      city: incoming.city ?? null,
      ...h,
      updatedAt: new Date(incoming.updatedAt),
      deleted: incoming.deleted ?? false,
    };
  }
  const prevTs = asMs(prev.updatedAt);
  const incomingWins = incoming.updatedAt > prevTs;
  const prevSide = rowSide(prev);
  const h = incomingWins
    ? mergeVisitHistory(incomingSide, prevSide)
    : mergeVisitHistory(prevSide, incomingSide);
  if (incomingWins) {
    return {
      name: incoming.name || prev.name,
      address: incoming.address || prev.address,
      lat: incoming.lat,
      lng: incoming.lng,
      googleMapsUri: incoming.googleMapsUri ?? prev.googleMapsUri,
      city: incoming.city ?? prev.city,
      ...h,
      updatedAt: new Date(incoming.updatedAt),
      deleted: incoming.deleted ?? false,
    };
  }
  return {
    name: prev.name,
    address: prev.address,
    lat: prev.lat,
    lng: prev.lng,
    googleMapsUri: prev.googleMapsUri,
    city: prev.city,
    ...h,
    updatedAt: new Date(prevTs),
    deleted: prev.deleted,
  };
}

/**
 * Build the insert/update for a merged row (unexecuted, so callers can
 * `db.batch()` many of them). Always bumps `serverUpdatedAt` — the
 * delta-pull cursor — even when the incoming side lost LWW: its visits may
 * still have changed the row, and other devices must see that.
 */
export function buildVisitedWrite(
  db: Db,
  userId: string,
  placeId: string,
  exists: boolean,
  merged: MergedVisitedRow,
) {
  const cols = {
    name: merged.name,
    address: merged.address,
    lat: merged.lat,
    lng: merged.lng,
    googleMapsUri: merged.googleMapsUri,
    city: merged.city,
    visits: JSON.stringify(merged.visits),
    removedVisits: JSON.stringify(merged.removedVisits),
    visitNotes: JSON.stringify(merged.visitNotes),
    visitRatings: JSON.stringify(merged.visitRatings),
    updatedAt: merged.updatedAt,
    serverUpdatedAt: new Date(),
    deleted: merged.deleted,
  };
  return exists
    ? db
        .update(visitedShops)
        .set(cols)
        .where(and(eq(visitedShops.userId, userId), eq(visitedShops.placeId, placeId)))
    : db.insert(visitedShops).values({ userId, placeId, ...cols });
}

/**
 * Tombstone a whole shop row. Every visit it held moves into removedVisits,
 * so a stale device re-sending those stamps can't resurrect the history,
 * while a genuinely new visit after the delete still starts a fresh row.
 */
export function tombstoneColumns(prev: VisitedShopRow, tsMs: number) {
  const side = rowSide(prev);
  return {
    visits: '[]',
    removedVisits: JSON.stringify(mergeRemoved(side.removedVisits, side.visits)),
    visitNotes: '{}',
    visitRatings: '{}',
    deleted: true,
    updatedAt: new Date(tsMs),
    serverUpdatedAt: new Date(),
  };
}

export interface StampPlace {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  googleMapsUri?: string | null;
}

/**
 * Server-originated visit stamp (a booked coffee that actually happened).
 * Goes through the same merge as client writes so a visit the user already
 * removed stays removed, and user-edited display fields aren't overwritten.
 */
export async function stampVisit(db: Db, userId: string, place: StampPlace, ts: number) {
  const [prev] = await db
    .select()
    .from(visitedShops)
    .where(and(eq(visitedShops.userId, userId), eq(visitedShops.placeId, place.placeId)));
  if (prev) {
    const side = rowSide(prev);
    if (side.removedVisits.includes(ts)) return;
    const visits = mergeVisits(side.visits, [ts]);
    await db
      .update(visitedShops)
      .set({
        visits: JSON.stringify(visits),
        googleMapsUri: prev.googleMapsUri ?? place.googleMapsUri ?? null,
        deleted: false,
        // Bump the LWW key so a revived tombstone row wins over the delete.
        updatedAt: new Date(Math.max(Date.now(), asMs(prev.updatedAt) + 1)),
        serverUpdatedAt: new Date(),
      })
      .where(and(eq(visitedShops.userId, userId), eq(visitedShops.placeId, place.placeId)));
    return;
  }
  await db.insert(visitedShops).values({
    userId,
    placeId: place.placeId,
    name: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    googleMapsUri: place.googleMapsUri ?? null,
    city: null,
    visits: JSON.stringify([ts]),
    removedVisits: '[]',
    visitNotes: '{}',
    visitRatings: '{}',
    updatedAt: new Date(),
    serverUpdatedAt: new Date(),
    deleted: false,
  });
}

/** Undo a server stamp (booking cancelled after it was stamped). */
export async function unstampVisit(db: Db, userId: string, placeId: string, ts: number) {
  const [prev] = await db
    .select()
    .from(visitedShops)
    .where(and(eq(visitedShops.userId, userId), eq(visitedShops.placeId, placeId)));
  if (!prev) return;
  const side = rowSide(prev);
  if (!side.visits.includes(ts)) return;
  const h = mergeVisitHistory({ ...side, removedVisits: [...side.removedVisits, ts] }, { visits: [] });
  await db
    .update(visitedShops)
    .set({
      visits: JSON.stringify(h.visits),
      removedVisits: JSON.stringify(h.removedVisits),
      visitNotes: JSON.stringify(h.visitNotes),
      visitRatings: JSON.stringify(h.visitRatings),
      deleted: h.visits.length === 0 ? true : prev.deleted,
      updatedAt: new Date(Math.max(Date.now(), asMs(prev.updatedAt) + 1)),
      serverUpdatedAt: new Date(),
    })
    .where(and(eq(visitedShops.userId, userId), eq(visitedShops.placeId, placeId)));
}

export async function getSessionUser(env: AuthEnv, request: Request) {
  const auth = createAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}

/** Like getSessionUser but also returns the active session id so callers can
 *  highlight or protect the current session in management UIs. */
export async function getSessionContext(env: AuthEnv, request: Request) {
  const auth = createAuth(env);
  const result = await auth.api.getSession({ headers: request.headers });
  if (!result?.user) return null;
  return { user: result.user, sessionId: (result.session as { id?: string } | undefined)?.id ?? null };
}

/* jsonError + jsonErrorCoded live in ./jsonError now so endpoints that
 * only need an error helper don't transitively pull in Better Auth +
 * the Resend SDK via this module. Re-exported here so existing call
 * sites that import { jsonError } from passport keep working. */
export { jsonError, jsonErrorCoded } from './jsonError';

/**
 * A cancelled booking's passport stamp (if it got one — either from the
 * nightly post-meeting stamp, or from the old approve-time stamp) is no
 * longer a coffee that happened. Best-effort: never fails the cancel.
 */
export async function unstampCancelledBooking(
  db: Db,
  row: typeof bookings.$inferSelect,
): Promise<void> {
  if (!row.passportStampedAt || !row.placeId) return;
  try {
    await unstampVisit(db, row.organizerUserId, row.placeId, asMs(row.scheduledAt));
    await db.update(bookings).set({ passportStampedAt: null }).where(eq(bookings.id, row.id));
  } catch (e) {
    console.error('[passport] unstamp on cancel failed', {
      bookingId: row.id,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
