import type { AuthEnv } from './auth';

/**
 * R2 layout for user avatars: one object per user at
 * `avatars/<userId>.<ext>`, ext matching the stored format (webp from most
 * browsers, jpeg from Safari, which can't encode webp from a canvas).
 */
export type AvatarFormat = 'webp' | 'jpeg' | 'png';

const EXT: Record<AvatarFormat, string> = { webp: 'webp', jpeg: 'jpg', png: 'png' };

export function avatarKey(userId: string, format: AvatarFormat): string {
  return `avatars/${userId}.${EXT[format]}`;
}

/** Every key a user's avatar may live under (current + other formats). */
export function allAvatarKeys(userId: string): string[] {
  return (Object.keys(EXT) as AvatarFormat[]).map((f) => avatarKey(userId, f));
}

/**
 * Delete the user's avatar objects. Removing a photo (or the account) must
 * make it unreachable — the URL pattern is predictable, so leaving the
 * object behind kept "deleted" photos public. Best-effort: a failure is
 * logged, never thrown, so it can't block the user's action. (Edge caches
 * may keep serving an already-fetched copy until its max-age runs out.)
 */
export async function deleteAvatarObjects(
  env: AuthEnv,
  userId: string,
  keep?: string,
): Promise<void> {
  if (!env.AVATARS) return;
  const keys = allAvatarKeys(userId).filter((k) => k !== keep);
  try {
    await env.AVATARS.delete(keys);
  } catch (e) {
    console.error('[avatar] R2 delete failed', {
      userId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
