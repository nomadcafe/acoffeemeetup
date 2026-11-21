import { DISPOSABLE_DOMAINS_RAW } from './disposableDomains.generated';

/**
 * Throwaway-inbox detection for the magic-link sign-in path. Scam
 * profiles are cheapest to mint with 10-minute mailboxes; refusing them
 * up front means a banned actor has to burn a real inbox per account.
 *
 * List: scripts/update-disposable-domains.mjs (vendored upstream list).
 * EXTRA_BLOCKED is for domains we see abused that upstream hasn't picked
 * up yet — keep it short and upstream them when possible.
 */
const EXTRA_BLOCKED: readonly string[] = [];

let blocked: Set<string> | null = null;
function blockedSet(): Set<string> {
  // Built lazily so isolates that never hit sign-in skip the ~10k-entry parse.
  if (!blocked) {
    blocked = new Set(DISPOSABLE_DOMAINS_RAW.split('\n').filter(Boolean));
    for (const d of EXTRA_BLOCKED) blocked.add(d);
  }
  return blocked;
}

/** True when the address's domain — or any parent domain, so
 *  `x.mailinator.com` matches `mailinator.com` — is on the blocklist. */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const domain = email.slice(at + 1).trim().toLowerCase().replace(/\.+$/, '');
  if (!domain) return false;
  const set = blockedSet();
  const parts = domain.split('.');
  // Stop before the bare TLD — never match on "com" alone.
  for (let i = 0; i < parts.length - 1; i++) {
    if (set.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}
