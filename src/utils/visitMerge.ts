/**
 * Passport merge rules, shared verbatim by the client (src/utils/syncMerge.ts)
 * and the server (functions/_lib/passport.ts) so both sides converge on the
 * same row no matter which one merges first. Pure — no imports.
 *
 * Model per shop row:
 *   - `visits` + `removedVisits` form a two-phase set: a timestamp is alive
 *     iff some side has stamped it and no side has removed it. Removals are
 *     grow-only, so a deleted visit can't be resurrected by a stale device.
 *   - `visitNotes` / `visitRatings` follow the row's LWW winner (newer
 *     `updatedAt`). The loser only contributes entries for visits the winner
 *     has never seen — so an offline device's note on a brand-new visit
 *     survives, but a deliberate clear / edit on the winner is respected.
 */

export const VISIT_DEDUPE_MS = 60_000;
/** Bound on the tombstone list so a row can't grow without limit. */
export const MAX_REMOVED_VISITS = 2000;

function finiteOnly(xs: readonly number[] | undefined): number[] {
  return (xs ?? []).filter((n) => typeof n === 'number' && Number.isFinite(n));
}

/** Union, sort newest-first, collapse stamps within 60s of a kept one (double-tap). */
export function mergeVisits(a: readonly number[], b: readonly number[]): number[] {
  const all = [...finiteOnly(a), ...finiteOnly(b)].sort((x, y) => y - x);
  const out: number[] = [];
  for (const ts of all) {
    if (out.length === 0 || out[out.length - 1] - ts >= VISIT_DEDUPE_MS) out.push(ts);
  }
  return out;
}

/** Exact-value union of removal tombstones, newest-first, capped. */
export function mergeRemoved(a: readonly number[] | undefined, b: readonly number[] | undefined): number[] {
  return [...new Set([...finiteOnly(a), ...finiteOnly(b)])]
    .sort((x, y) => y - x)
    .slice(0, MAX_REMOVED_VISITS);
}

export interface VisitSide<N, R> {
  visits: readonly number[];
  removedVisits?: readonly number[];
  visitNotes?: Readonly<Record<string, N>>;
  visitRatings?: Readonly<Record<string, R>>;
}

function mergeMap<T>(
  winner: Readonly<Record<string, T>> | undefined,
  loser: Readonly<Record<string, T>> | undefined,
  winnerKnown: ReadonlySet<string>,
  alive: ReadonlySet<string>,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(winner ?? {})) {
    if (alive.has(k)) out[k] = v;
  }
  for (const [k, v] of Object.entries(loser ?? {})) {
    if (alive.has(k) && !winnerKnown.has(k) && out[k] === undefined) out[k] = v;
  }
  return out;
}

/**
 * Merge the visit history of two copies of one shop row. `winner` is the
 * side with the newer row `updatedAt` (ties → pass the server/prev side).
 */
export function mergeVisitHistory<N, R>(
  winner: VisitSide<N, R>,
  loser: VisitSide<N, R>,
): {
  visits: number[];
  removedVisits: number[];
  visitNotes: Record<string, N>;
  visitRatings: Record<string, R>;
} {
  const removedVisits = mergeRemoved(winner.removedVisits, loser.removedVisits);
  const removed = new Set(removedVisits);
  // Dedupe first, then drop removed — removing the kept stamp of a
  // double-tap pair must not let its 30s-older twin reappear.
  const visits = mergeVisits(winner.visits, loser.visits).filter((ts) => !removed.has(ts));
  const alive = new Set(visits.map(String));
  const winnerKnown = new Set(
    [...finiteOnly(winner.visits), ...finiteOnly(winner.removedVisits)].map(String),
  );
  return {
    visits,
    removedVisits,
    visitNotes: mergeMap(winner.visitNotes, loser.visitNotes, winnerKnown, alive),
    visitRatings: mergeMap(winner.visitRatings, loser.visitRatings, winnerKnown, alive),
  };
}
