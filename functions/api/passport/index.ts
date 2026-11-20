import { and, eq, gte } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { visitedShops } from '../../_lib/db/schema';
import { asMs, getSessionUser, jsonError, rowToWire } from '../../_lib/passport';

/* Re-send a short window before the cursor on every delta pull. Writes from
 * concurrent requests can commit slightly out of serverUpdatedAt order; the
 * overlap catches those, and re-sent rows merge idempotently on the client. */
const CURSOR_OVERLAP_MS = 2 * 60_000;

/**
 * Two modes:
 *  - No `?since`: return alive rows only. Used to bootstrap a fresh client.
 *  - `?since=<ms>`: delta — every row the server wrote after the cursor
 *    (minus a small overlap), including tombstones (deleted=true), so
 *    cross-device deletes propagate. The cursor is the server's clock
 *    (`serverUpdatedAt`), never a client's `updatedAt`.
 *
 * Response includes `cursor` so the client can persist it for the next call.
 */
export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const user = await getSessionUser(env, request);
  if (!user) return jsonError('Unauthorized', 401);

  const url = new URL(request.url);
  const sinceRaw = url.searchParams.get('since');
  const since = sinceRaw != null ? Number(sinceRaw) : null;
  if (sinceRaw != null && (!Number.isFinite(since) || since! < 0)) {
    return jsonError('Invalid since', 400);
  }

  const db = getDb(env);
  const rows = since != null
    ? await db
        .select()
        .from(visitedShops)
        .where(
          and(
            eq(visitedShops.userId, user.id),
            gte(visitedShops.serverUpdatedAt, new Date(Math.max(0, since - CURSOR_OVERLAP_MS))),
          ),
        )
    : await db
        .select()
        .from(visitedShops)
        .where(and(eq(visitedShops.userId, user.id), eq(visitedShops.deleted, false)));

  let cursor = since ?? 0;
  for (const r of rows) cursor = Math.max(cursor, asMs(r.serverUpdatedAt));

  return Response.json({ shops: rows.map(rowToWire), cursor });
};
