import type { StarredShopSnapshot, VisitedShopSnapshot } from '../types';
import type { VisitedShopWire } from './passportSync';
import type { StarredShopWire } from './starredSync';
import { mergeVisitHistory } from './visitMerge';

function shallowEqualNotes(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  if (a === b) return true;
  const aKeys = a ? Object.keys(a) : [];
  const bKeys = b ? Object.keys(b) : [];
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if ((a as Record<string, string>)[k] !== (b as Record<string, string> | undefined)?.[k]) {
      return false;
    }
  }
  return true;
}

function shallowEqualRatings(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined,
): boolean {
  if (a === b) return true;
  const aKeys = a ? Object.keys(a) : [];
  const bKeys = b ? Object.keys(b) : [];
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if ((a as Record<string, number>)[k] !== (b as Record<string, number> | undefined)?.[k]) {
      return false;
    }
  }
  return true;
}

function emptyToUndefined<T>(m: Record<string, T>): Record<string, T> | undefined {
  return Object.keys(m).length > 0 ? m : undefined;
}

function sameNumbers(a: readonly number[] | undefined, b: readonly number[] | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/**
 * Merge a delta of remote visited rows into the local list. Same rules as
 * the server (src/utils/visitMerge.ts): LWW per-row by `updatedAt` for
 * display fields + notes/ratings; visit history is visits minus removed,
 * unioned across both sides; tombstones (deleted=true) on the winning side
 * remove the row.
 */
export function mergeRemoteVisited(
  local: VisitedShopSnapshot[],
  remote: VisitedShopWire[],
): VisitedShopSnapshot[] {
  const byId = new Map(local.map((s) => [s.id, s] as const));
  for (const r of remote) {
    const cur = byId.get(r.id);
    if (!cur) {
      if (r.deleted || r.visits.length === 0) continue;
      byId.set(r.id, {
        id: r.id,
        name: r.name,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        googleMapsUri: r.googleMapsUri,
        visits: r.visits,
        removedVisits: r.removedVisits,
        visitNotes: r.visitNotes,
        visitRatings: r.visitRatings,
        city: undefined,
        updatedAt: r.updatedAt,
      });
      continue;
    }
    const remoteWins = r.updatedAt > cur.updatedAt;
    if (remoteWins && r.deleted) {
      byId.delete(r.id);
      continue;
    }
    const h = remoteWins ? mergeVisitHistory(r, cur) : mergeVisitHistory(cur, r);
    if (h.visits.length === 0) {
      byId.delete(r.id);
      continue;
    }
    const merged = {
      visits: h.visits,
      removedVisits: h.removedVisits.length > 0 ? h.removedVisits : undefined,
      visitNotes: emptyToUndefined(h.visitNotes),
      visitRatings: emptyToUndefined(h.visitRatings),
    };
    if (remoteWins) {
      byId.set(r.id, {
        id: r.id,
        name: r.name,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        googleMapsUri: r.googleMapsUri,
        ...merged,
        city: cur.city,
        updatedAt: r.updatedAt,
      });
    } else if (
      !sameNumbers(cur.visits, merged.visits) ||
      !sameNumbers(cur.removedVisits, merged.removedVisits) ||
      !shallowEqualNotes(cur.visitNotes, merged.visitNotes) ||
      !shallowEqualRatings(cur.visitRatings, merged.visitRatings)
    ) {
      // Local is newer (or tied) — keep local fields, adopt merged history.
      byId.set(r.id, { ...cur, ...merged });
    }
  }
  return Array.from(byId.values());
}

/** LWW merge for starred — no append-only fields, just newer-wins. */
export function mergeRemoteStarred(
  local: StarredShopSnapshot[],
  remote: StarredShopWire[],
): StarredShopSnapshot[] {
  const byId = new Map(local.map((s) => [s.id, s] as const));
  for (const r of remote) {
    const cur = byId.get(r.id);
    if (!cur) {
      if (r.deleted) continue;
      byId.set(r.id, {
        id: r.id,
        name: r.name,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        googleMapsUri: r.googleMapsUri,
        note: r.note,
        updatedAt: r.updatedAt,
      });
      continue;
    }
    if (r.updatedAt > cur.updatedAt) {
      if (r.deleted) {
        byId.delete(r.id);
        continue;
      }
      byId.set(r.id, {
        id: r.id,
        name: r.name,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        googleMapsUri: r.googleMapsUri,
        note: r.note,
        updatedAt: r.updatedAt,
      });
    }
  }
  return Array.from(byId.values());
}
