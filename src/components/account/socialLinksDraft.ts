import { normalizeSocialLinks, type SocialPlatformId } from '../../utils/socialPlatforms';
import { freshKey } from './shared';

/**
 * Held in form state. The `_key` is local — never sent to the server —
 * and gives React a stable identity per row so removing the first row
 * doesn't shift inputs from the second row into the first one's slot
 * (which keying by array index would do, with real data-loss potential
 * if the user is mid-typing in row 2 when they delete row 1).
 */
export interface SocialLinkDraft {
  _key: string;
  platform: SocialPlatformId;
  /** Raw input — a handle, "@handle", or a pasted profile URL. */
  handle: string;
}

export function parseInitialSocialLinks(raw: string | undefined): SocialLinkDraft[] {
  // Accepts both the current {platform, handle} rows and legacy {label, url}
  // rows; legacy links that aren't on an allowlisted platform drop out.
  return normalizeSocialLinks(raw ?? '[]').map((l) => ({
    _key: freshKey(),
    platform: l.platform,
    handle: l.handle,
  }));
}
