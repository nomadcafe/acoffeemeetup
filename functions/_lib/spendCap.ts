import type { AuthEnv } from './auth';

/**
 * Global daily ceilings for paid Google calls made by public proxies.
 * Per-IP rate limits stop one client; this stops many (botnets, a viral
 * embed, a bug in our own client) from running up an unbounded bill.
 *
 * Units are what Google bills: Routes = matrix elements, photos = one
 * cache miss (Place Details + Photo Media). Defaults are deliberately
 * modest; override per environment with the env vars below.
 */
export type SpendSku = 'routes_elements' | 'place_photo';

const DEFAULT_CAPS: Record<SpendSku, number> = {
  // ~$50/day at the $5 / 1k Routes Matrix Essentials rate.
  routes_elements: 10_000,
  // ~$15/day at roughly $7 / 1k for Details + Photo.
  place_photo: 2_000,
};

const ENV_KEYS: Record<SpendSku, keyof SpendCapEnv> = {
  routes_elements: 'ROUTES_DAILY_ELEMENT_CAP',
  place_photo: 'PLACE_PHOTO_DAILY_CAP',
};

export interface SpendCapEnv {
  ROUTES_DAILY_ELEMENT_CAP?: string;
  PLACE_PHOTO_DAILY_CAP?: string;
}

function capFor(env: SpendCapEnv, sku: SpendSku): number {
  const raw = Number(env[ENV_KEYS[sku]]);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_CAPS[sku];
}

/**
 * Atomically adds `units` to today's (UTC) counter and reports whether the
 * total is still within the cap. One D1 round-trip, only on the paid
 * (cache-miss) path. Fails open if the counter can't be written (e.g. the
 * migration hasn't been applied yet) — a broken meter shouldn't take ETAs
 * or photos down with it.
 */
export async function reserveDailySpend(
  env: AuthEnv & SpendCapEnv,
  sku: SpendSku,
  units: number,
): Promise<boolean> {
  if (units <= 0) return true;
  const day = new Date().toISOString().slice(0, 10);
  try {
    const row = await env.DB.prepare(
      `INSERT INTO api_spend (day, sku, units) VALUES (?1, ?2, ?3)
       ON CONFLICT (day, sku) DO UPDATE SET units = units + excluded.units
       RETURNING units`,
    )
      .bind(day, sku, units)
      .first<{ units: number }>();
    const total = row?.units ?? 0;
    const cap = capFor(env, sku);
    if (total > cap) {
      console.warn(`[spendCap] ${sku} over daily cap: ${total} > ${cap}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[spendCap] counter unavailable, failing open', e);
    return true;
  }
}
