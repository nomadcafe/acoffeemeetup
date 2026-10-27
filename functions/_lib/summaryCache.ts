/**
 * Edge cache for AI review summaries, keyed by placeId + locale + a hash of
 * the reviews that produced the summary. The reviews are client-supplied, so
 * keying on placeId alone would let anyone POST fabricated reviews for a real
 * café and have that summary served to every visitor for 30 days. With the
 * hash in the key, honest clients (who all get the same reviews from Places)
 * still share one entry, while a forged payload only ever hits itself.
 *
 * Cache is per-colo; propagation isn't global but CF's popular-content routing
 * means a frequently-read key often hits the same tier-1 cache for nearby users.
 */

const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function key(placeId: string, locale: string, inputHash: string): Request {
  return new Request(
    `https://cache.internal/ai/summary/v2/${encodeURIComponent(locale)}/${encodeURIComponent(placeId)}/${inputHash}`,
    { method: 'GET' },
  );
}

export async function readSummaryCache(
  placeId: string,
  locale: string,
  inputHash: string,
): Promise<string | null> {
  const hit = await caches.default.match(key(placeId, locale, inputHash));
  if (!hit) return null;
  try {
    const body = (await hit.json()) as { summary?: unknown };
    return typeof body.summary === 'string' ? body.summary : null;
  } catch {
    return null;
  }
}

export function writeSummaryCache(
  placeId: string,
  locale: string,
  inputHash: string,
  summary: string,
  waitUntil: (p: Promise<unknown>) => void,
): void {
  const response = Response.json(
    { summary },
    {
      headers: {
        'cache-control': `public, max-age=${TTL_SECONDS}, s-maxage=${TTL_SECONDS}`,
        'content-type': 'application/json',
      },
    },
  );
  waitUntil(caches.default.put(key(placeId, locale, inputHash), response));
}

/** Hex SHA-256 of the summarizer input (name + reviews), for the cache key. */
export async function hashSummaryInput(input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
