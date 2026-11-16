import { jsonError } from './jsonError';

/**
 * Rejects browser requests made from another site. The paid-upstream
 * proxies (Routes, Place Photos, DeepSeek) are rate-limited per IP, but a
 * third-party page could make each of its visitors call them — a
 * text/plain POST or an <img> skips CORS preflight — multiplying the
 * per-IP budget by its traffic. Every modern browser sends
 * Sec-Fetch-Site; requests without it (curl, very old browsers) fall
 * through to the rate limiter as before.
 */
export function rejectCrossSite(request: Request): Response | null {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    return jsonError('Cross-site requests are not allowed', 403);
  }
  return null;
}
