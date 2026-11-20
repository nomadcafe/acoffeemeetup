import { eq } from 'drizzle-orm';
import { type AuthEnv } from '../../_lib/auth';
import { getDb } from '../../_lib/db';
import { user } from '../../_lib/db/schema';
import { getSessionUser, jsonError } from '../../_lib/passport';
import { avatarKey, deleteAvatarObjects } from '../../_lib/avatarStore';
import { rateLimit, rateLimitResponse } from '../../_lib/rateLimit';

/**
 * Avatar upload + clear. Lives at `/api/account/avatar`.
 *
 *   POST: body is the raw image bytes. The client crops/resizes to
 *         ≤512px and re-encodes (webp, or jpeg on Safari, which can't
 *         encode webp from a canvas), so server-side we validate type /
 *         size / magic bytes and store it under the matching format.
 *         The response sets user.image to the public R2 URL.
 *
 *   DELETE: clears user.image AND deletes the R2 object(s). The URL
 *           pattern is predictable, so a photo left in the bucket after
 *           "remove" stayed publicly reachable.
 *
 * Why raw body, not multipart: the client always sends one image, no
 * other fields. Saves the multipart parser churn on Workers and keeps
 * the upload path one stream-copy.
 */

const MAX_BYTES = 2 * 1024 * 1024; // 2MB hard cap. Real uploads after
                                    // client resize land <100KB; 2MB
                                    // is the "user shoved a raw HEIC"
                                    // safety net.
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function publicUrlFor(env: AuthEnv, key: string): string | null {
  if (!env.AVATARS_PUBLIC_URL) return null;
  // Avoid double-slash if the env var was set with a trailing slash.
  const base = env.AVATARS_PUBLIC_URL.replace(/\/+$/, '');
  return `${base}/${key}`;
}

/** Uploads per user per hour — each one is a paid R2 write. */
const UPLOADS_PER_HOUR = 20;

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env, waitUntil }) => {
  const sessionUser = await getSessionUser(env, request);
  if (!sessionUser) return jsonError('Unauthorized', 401);

  const limit = await rateLimit(
    request,
    { waitUntil },
    { bucket: 'avatar-upload', limit: UPLOADS_PER_HOUR, windowSec: 3600, keyOverride: sessionUser.id },
  );
  if (!limit.ok) return rateLimitResponse(limit);

  if (!env.AVATARS || !env.AVATARS_PUBLIC_URL) {
    return jsonError('Avatar upload is not configured on this deployment', 503);
  }

  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!ACCEPTED_TYPES.has(contentType)) {
    return jsonError(
      `Unsupported image type. Accepts: ${[...ACCEPTED_TYPES].join(', ')}`,
      415,
    );
  }

  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return jsonError('Image is too large (2MB max)', 413);
  }

  // Read into a buffer so we can size-check before R2 write. ArrayBuffer
  // copy is fine for ≤2MB; streaming would only matter at 100MB+.
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    return jsonError('Image is too large (2MB max)', 413);
  }
  if (buffer.byteLength === 0) {
    return jsonError('Empty body', 400);
  }

  /* Magic-byte sniff. The Content-Type header is attacker-controlled, so
   * trusting it alone means an attacker can upload arbitrary bytes
   * (HTML, SVG with script, etc.) labelled `image/webp` and R2 will
   * happily serve them under a public URL embedded in shared profiles
   * — a stored-XSS vector. We force `Content-Type: image/webp` on the
   * R2 object regardless, so modern browsers won't sniff, but pinning
   * the actual bytes to a known image format is the right defence in
   * depth. Magic numbers per the formats we accept above. */
  const head = new Uint8Array(buffer.slice(0, 12));
  const sniff: 'webp' | 'png' | 'jpeg' | null =
    // WebP: bytes 0-3 = 'RIFF' (52 49 46 46), 8-11 = 'WEBP'
    head.length >= 12 &&
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
      ? 'webp'
      // PNG: 89 50 4E 47 0D 0A 1A 0A
      : head.length >= 8 &&
        head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
        head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
        ? 'png'
        // JPEG: FF D8 FF
        : head.length >= 3 &&
          head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
          ? 'jpeg'
          : null;
  if (sniff === null) {
    return jsonError('Image bytes do not match a supported format', 415);
  }
  // Header should match what the bytes actually are — disagreement is
  // either a bug or an attempted spoof. Hard-reject either way.
  const expectedType = `image/${sniff}`;
  if (contentType !== expectedType) {
    return jsonError(
      `Content-Type ${contentType} does not match the actual image format (${expectedType})`,
      415,
    );
  }

  const key = avatarKey(sessionUser.id, sniff);
  await env.AVATARS.put(key, buffer, {
    httpMetadata: {
      // The verified format — never a blanket label, so a jpeg from Safari
      // isn't served as webp.
      contentType: expectedType,
      // 1-day cache. Each upload gets a fresh ?v= URL so new photos show
      // at once; the shorter max-age bounds how long a removed photo can
      // linger in edge / browser caches after its object is deleted.
      cacheControl: 'public, max-age=86400',
    },
  });
  // Drop the previous upload if it was stored under another format.
  await deleteAvatarObjects(env, sessionUser.id, key);

  // Bust browser / edge caches by appending a version query — same R2
  // key gets overwritten in place but anyone holding the old URL keeps
  // serving the old image until the cache expires.
  const url = publicUrlFor(env, key);
  if (!url) return jsonError('Avatar URL configuration missing', 500);
  const versioned = `${url}?v=${Date.now()}`;

  const db = getDb(env);
  await db.update(user).set({ image: versioned, updatedAt: new Date() }).where(eq(user.id, sessionUser.id));

  return Response.json({ image: versioned });
};

/** Clear the user's avatar: null out user.image and delete the R2 object(s). */
export const onRequestDelete: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const sessionUser = await getSessionUser(env, request);
  if (!sessionUser) return jsonError('Unauthorized', 401);

  const db = getDb(env);
  await db.update(user).set({ image: null, updatedAt: new Date() }).where(eq(user.id, sessionUser.id));
  await deleteAvatarObjects(env, sessionUser.id);

  return new Response(null, { status: 204 });
};
