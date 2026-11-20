import { createContext, useContext, useEffect, useState } from 'react';

/** Default time a green success banner sticks before fading on its own.
 *  Long enough to read, short enough that it doesn't haunt the screen
 *  through the next interaction. Used by useAutoDismissOk below. */
export const STATUS_OK_AUTO_DISMISS_MS = 4000;

export type StatusBanner = { kind: 'ok' | 'err'; message: string } | null;

/** Cards call this after a successful save so the session — and with it the
 *  sidebar's setup-progress marks — reflects the new server state. */
export const AccountRefreshContext = createContext<() => void>(() => {});

export function useAccountRefresh(): () => void {
  return useContext(AccountRefreshContext);
}

/** Cards report whether they hold edits that differ from what's saved. The
 *  page uses it to mark sections "unsaved" in the sidebar and to warn
 *  before leaving with unsaved edits. */
/**
 * Serialized "what the server has" for a card. Follows the props (the
 * session) when they change, and can be set directly on a successful save
 * so the card reads clean immediately instead of flashing "unsaved" until
 * the session refetch lands.
 */
export function useSavedSnapshot(fromProps: string): [string, (key: string) => void] {
  const [saved, setSaved] = useState(fromProps);
  const [seenProps, setSeenProps] = useState(fromProps);
  if (fromProps !== seenProps) {
    setSeenProps(fromProps);
    setSaved(fromProps);
  }
  return [saved, setSaved];
}

export const DirtyContext = createContext<(sectionId: string, dirty: boolean) => void>(() => {});

export function useReportDirty(sectionId: string, dirty: boolean): void {
  const report = useContext(DirtyContext);
  useEffect(() => {
    report(sectionId, dirty);
  }, [report, sectionId, dirty]);
  useEffect(() => () => report(sectionId, false), [report, sectionId]);
}

/**
 * Drop a `kind:'ok'` status banner after a short delay. Centralised so
 * the AccountPage cards (avatar, basic profile, social links, featured
 * cafés, booking, calendar) all share one auto-dismiss policy instead of
 * each card leaving its "Saved" message stuck on screen forever.
 *
 * Errors do NOT auto-dismiss — those usually need a user retry, so we
 * keep the banner visible until the user acts.
 */
export function useAutoDismissOk(
  status: StatusBanner,
  setStatus: (s: StatusBanner) => void,
  ms: number = STATUS_OK_AUTO_DISMISS_MS,
): void {
  useEffect(() => {
    if (status?.kind !== 'ok') return;
    const id = window.setTimeout(() => setStatus(null), ms);
    return () => window.clearTimeout(id);
  }, [status, setStatus, ms]);
}

export function freshKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Better Auth additionalFields can come back as Date | number | string
 *  (ISO) | null depending on JSON serialisation path. Normalise to ms. */
export function msFromMaybe(v: string | Date | number | null | undefined): number | null {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : null;
}
