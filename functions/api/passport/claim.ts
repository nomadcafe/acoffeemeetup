import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { visitedShops } from '../../_lib/db/schema';
import {
  VisitedShopWireSchema,
  buildVisitedWrite,
  getSessionUser,
  jsonError,
  asMs,
  mergeVisitedRow,
  rowToWire,
} from '../../_lib/passport';

const InputSchema = z.object({
  shops: z.array(VisitedShopWireSchema).max(1000),
});

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const user = await getSessionUser(env, request);
  if (!user) return jsonError('Unauthorized', 401);

  let input: z.infer<typeof InputSchema>;
  try {
    input = InputSchema.parse(await request.json());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Invalid request body', 400);
  }

  const db = getDb(env);

  // Load the user's whole passport rather than `placeId IN (…)`: D1 caps
  // bound parameters at 100 per query, and a claim can carry 1000 ids.
  const existing = await db
    .select()
    .from(visitedShops)
    .where(eq(visitedShops.userId, user.id));
  const existingByPlaceId = new Map(existing.map((r) => [r.placeId, r] as const));

  // Merge in memory, then write everything in one D1 batch — a claim can
  // carry up to 1000 rows, and one query per row would blow through the
  // per-invocation query limit (and take 1000 sequential round trips).
  type BatchStmt = Parameters<typeof db.batch>[0][number];
  const writes: BatchStmt[] = [];
  for (const shop of input.shops) {
    const prev = existingByPlaceId.get(shop.id);
    const merged = mergeVisitedRow(prev, shop);
    if (!prev && merged.visits.length === 0 && !merged.deleted) continue;
    writes.push(buildVisitedWrite(db, user.id, shop.id, !!prev, merged) as BatchStmt);
  }
  if (writes.length > 0) {
    await db.batch(writes as [BatchStmt, ...BatchStmt[]]);
  }

  // Cursor over EVERY row (incl. tombstones) so the client's pull cursor
  // starts past anything currently on the server.
  const allRows = await db
    .select()
    .from(visitedShops)
    .where(eq(visitedShops.userId, user.id));
  let cursor = 0;
  for (const r of allRows) cursor = Math.max(cursor, asMs(r.serverUpdatedAt));

  const alive = allRows.filter((r) => !r.deleted);
  return Response.json({ shops: alive.map(rowToWire), cursor });
};
