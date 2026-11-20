import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { authClient, useSession } from '../utils/authClient';
import { usePassportStats } from '../hooks/usePassportStats';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { PASSPORT_PATH } from '../routes';
import { formatAbsoluteDate, formatAbsoluteDateTime } from '../utils/relativeTime';
import { track } from '../utils/analytics';
import { AccountMenu } from './AccountMenu';
import { HeaderNavLinks } from './HeaderNavLinks';
import { SkipToContent } from './SkipToContent';
import { LanguageSwitcher } from './LanguageSwitcher';
import { GithubLink } from './GithubLink';
import { SyncIndicator } from './SyncIndicator';
import styles from './AccountPage.module.css';
import {
  AccountRefreshContext,
  DirtyContext,
  msFromMaybe,
  STATUS_OK_AUTO_DISMISS_MS,
} from './account/shared';
import { AccountToc } from './account/AccountToc';
import { AvatarCard } from './account/AvatarCard';
import { BasicProfileCard } from './account/BasicProfileCard';
import { BookingSetupCard } from './account/BookingSetupCard';
import { CalendarSyncCard } from './account/CalendarSyncCard';
import { DeleteAccountModal } from './account/DeleteAccountModal';
import { FeaturedCafesCard } from './account/FeaturedCafesCard';
import { ProfileVisibilityCard } from './account/ProfileVisibilityCard';
import {
  BOOKING_SECTION_IDS,
  scrollToSection,
  SECTION_HASH_ALIASES,
  type SectionStatusMap,
  TOC_IDS,
} from './account/sections';
import { SocialLinksCard } from './account/SocialLinksCard';
import { THEME_PRESETS, type ThemePreset } from './account/themePresets';
import { ThemeCard } from './account/ThemeCard';
import { parseInitialAvailability, WEEKDAYS } from './account/availability';
import { parseInitialSocialLinks } from './account/socialLinksDraft';

const USERNAME_REGEX = /^[a-z][a-z0-9_-]{3,29}$/;

const CHECK_DEBOUNCE_MS = 350;

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; value: string | null }
  | { kind: 'error'; message: string };

type AvailabilityState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'unavailable'; reason: 'invalid' | 'reserved' | 'taken' };

interface SessionRow {
  id: string;
  device: string;
  ipAddress: string | null;
  createdAt: number;
  current: boolean;
}

type SessionsState =
  | { kind: 'loading' }
  | { kind: 'ready'; sessions: SessionRow[] }
  | { kind: 'error' };

export function AccountPage() {
  const { t, locale } = useI18n();
  const { visitedShops } = useApp();
  const { data: session, isPending, refetch: refetchSession } = useSession();
  const stats = usePassportStats(visitedShops);
  const homeHref = buildLocalizedPathname('/', locale);
  const passportHref = buildLocalizedPathname(PASSPORT_PATH, locale);

  // Better Auth additionalFields → username sits on session.user.
  const sessionUser = session?.user as
    | { email?: string; createdAt?: string | Date; username?: string | null }
    | undefined;
  const initialUsername = sessionUser?.username ?? '';

  const [draft, setDraft] = useState<string>(initialUsername);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [availability, setAvailability] = useState<AvailabilityState>({ kind: 'idle' });
  // Username "Saved" toast auto-fades — same policy as the per-card
  // status banners. Errors stay until the user types again.
  useEffect(() => {
    if (save.kind !== 'saved') return;
    const id = window.setTimeout(
      () => setSave({ kind: 'idle' }),
      STATUS_OK_AUTO_DISMISS_MS,
    );
    return () => window.clearTimeout(id);
  }, [save]);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // ----- Loading skeleton -----
  if (isPending) {
    return (
      <div className={styles.app}>
        <SkipToContent />
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <a className={styles.logo} href={homeHref} aria-label={t('app.logoAlt')}>
              <span className={styles.logoWordmark}>ACoffee</span>
            </a>
            <HeaderNavLinks />
            <div className={styles.headerAside}>
              <LanguageSwitcher />
              <GithubLink />
              {import.meta.env.VITE_AUTH_ENABLED === 'true' ? (
                <>
                  <SyncIndicator />
                  <AccountMenu />
                </>
              ) : null}
            </div>
          </div>
        </header>
        <main id="content" tabIndex={-1} className={styles.main} aria-busy="true">
          <div className={styles.hero}>
            <div className={`${styles.skeletonRow} ${styles.skeletonRowMed}`} />
            <div
              className={`${styles.skeletonRow} ${styles.skeletonRowShort}`}
              style={{ marginTop: '0.5rem' }}
            />
          </div>
          {[0, 1, 2].map((i) => (
            <section key={i} className={styles.card}>
              <div className={`${styles.skeletonRow} ${styles.skeletonRowShort}`} />
              <div className={styles.skeletonRow} style={{ marginTop: '0.6rem' }} />
              <div
                className={`${styles.skeletonRow} ${styles.skeletonRowMed}`}
                style={{ marginTop: '0.4rem' }}
              />
            </section>
          ))}
        </main>
      </div>
    );
  }

  // ----- Signed out -----
  if (!sessionUser?.email) {
    return (
      <div className={styles.app}>
        <SkipToContent />
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <a className={styles.logo} href={homeHref} aria-label={t('app.logoAlt')}>
              <span className={styles.logoWordmark}>ACoffee</span>
            </a>
            <HeaderNavLinks />
            <div className={styles.headerAside}>
              <LanguageSwitcher />
              <GithubLink />
              {import.meta.env.VITE_AUTH_ENABLED === 'true' ? (
                <>
                  <SyncIndicator />
                  <AccountMenu />
                </>
              ) : null}
            </div>
          </div>
        </header>
        <main id="content" tabIndex={-1} className={styles.main}>
          <div className={styles.signedOut}>
            <p>{t('account.signInRequired')}</p>
            <a className={styles.signedOutCta} href={homeHref}>
              {t('account.goHome')}
            </a>
          </div>
        </main>
      </div>
    );
  }

  // ----- Signed in -----
  return (
    <SignedInAccountPage
      draft={draft}
      setDraft={setDraft}
      save={save}
      setSave={setSave}
      availability={availability}
      setAvailability={setAvailability}
      deleteOpen={deleteOpen}
      setDeleteOpen={setDeleteOpen}
      sessionUser={sessionUser}
      initialUsername={initialUsername}
      stats={stats}
      passportHref={passportHref}
      homeHref={homeHref}
      onRefetchSession={() => void refetchSession?.()}
    />
  );
}

/**
 * Body extracted as a child component so we can use hooks (debounce effect)
 * unconditionally — the loading/signed-out branches above return early before
 * any hooks that would otherwise need to live below them.
 */
interface SignedInProps {
  draft: string;
  setDraft: (v: string) => void;
  save: SaveState;
  setSave: (s: SaveState) => void;
  availability: AvailabilityState;
  setAvailability: (s: AvailabilityState) => void;
  deleteOpen: boolean;
  setDeleteOpen: (v: boolean) => void;
  sessionUser: {
    email?: string;
    createdAt?: string | Date;
    username?: string | null;
    profilePublic?: boolean;
    profileSuspendedAt?: string | Date | null;
    image?: string | null;
    displayName?: string | null;
    bio?: string | null;
    socialLinks?: string;
    homeBaseAddress?: string | null;
    availabilitySlots?: string;
    timezone?: string | null;
    busyCalendarIcsUrl?: string | null;
    busyCalendarSyncedAt?: string | Date | number | null;
    busyCalendarLastError?: string | null;
    busyCalendarLastErrorAt?: string | Date | number | null;
  };
  initialUsername: string;
  stats: ReturnType<typeof usePassportStats>;
  passportHref: string;
  homeHref: string;
  onRefetchSession: () => void;
}

function SignedInAccountPage({
  draft,
  setDraft,
  save,
  setSave,
  availability,
  setAvailability,
  deleteOpen,
  setDeleteOpen,
  sessionUser,
  initialUsername,
  stats,
  passportHref,
  homeHref,
  onRefetchSession,
}: SignedInProps) {
  const { t, locale } = useI18n();
  const { visitedShops, starredShops } = useApp();
  const [sessionsState, setSessionsState] = useState<SessionsState>({ kind: 'loading' });
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  // Ref for the slug input so the home-page CTA's `?focus=username`
  // landing can scroll it into view and put the cursor in it on first
  // paint. Mount-time effect below consumes this.
  const usernameInputRef = useRef<HTMLInputElement>(null);

  // Bookings are optional, so for someone who has never touched them the
  // booking + calendar cards collapse into one short invitation. Anything
  // already set up (or a deep link into that group) keeps them open.
  const bookingTouched =
    !!sessionUser.homeBaseAddress?.trim() ||
    WEEKDAYS.some((d) => parseInitialAvailability(sessionUser.availabilitySlots)[d].enabled) ||
    !!sessionUser.busyCalendarIcsUrl?.trim();
  const [bookingExpanded, setBookingExpanded] = useState(() => {
    const raw = decodeURIComponent(window.location.hash.slice(1));
    const id = SECTION_HASH_ALIASES[raw] ?? raw;
    return bookingTouched || BOOKING_SECTION_IDS.includes(id);
  });
  /** Scroll to a section, expanding the booking group first if needed. */
  const goToSection = useCallback(
    (id: string, behavior: ScrollBehavior = 'smooth'): boolean => {
      if (BOOKING_SECTION_IDS.includes(id) && !bookingExpanded) {
        setBookingExpanded(true);
        // Two frames: one for React to render the cards, one for layout.
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => scrollToSection(id, behavior)),
        );
        return true;
      }
      return scrollToSection(id, behavior);
    },
    [bookingExpanded],
  );

  // Honour `/account#<section>` deep links. The cards only exist once the
  // session has loaded, so the browser's own jump-to-anchor on page load
  // finds nothing — redo it after the first paint.
  useEffect(() => {
    const raw = decodeURIComponent(window.location.hash.slice(1));
    if (!raw) return;
    const id = SECTION_HASH_ALIASES[raw] ?? raw;
    if (!TOC_IDS.includes(id)) return;
    const frame = window.requestAnimationFrame(() => scrollToSection(id, 'auto'));
    return () => window.cancelAnimationFrame(frame);
    // Mount-only: later navigation goes through goToSection.
  }, []);

  // Honour `?focus=username` from the home profile-slide CTA callback URL:
  // scroll the slug card into view, focus the input, then strip the param
  // so a page refresh / share doesn't re-trigger the auto-focus. Runs once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('focus') !== 'username') return;
    // Wait a frame so the lazy AccountPage has had a chance to render the
    // username card before we try to scroll/focus it.
    const id = window.requestAnimationFrame(() => {
      const el = usernameInputRef.current;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus({ preventScroll: true });
      }
    });
    params.delete('focus');
    const nextSearch = params.toString();
    const target = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', target);
    return () => window.cancelAnimationFrame(id);
  }, []);

  const trimmed = draft.trim().toLowerCase();
  const cleared = trimmed === '';
  const sameAsCurrent = trimmed === (initialUsername ?? '').toLowerCase();
  const validFormat = cleared || USERNAME_REGEX.test(trimmed);

  // Debounced live availability check. Skip when cleared or unchanged so we
  // don't ping the server for "current name still available".
  useEffect(() => {
    if (cleared || sameAsCurrent) {
      setAvailability({ kind: 'idle' });
      return;
    }
    if (!validFormat) {
      setAvailability({ kind: 'unavailable', reason: 'invalid' });
      return;
    }
    setAvailability({ kind: 'checking' });
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/account/username?value=${encodeURIComponent(trimmed)}`,
          { signal: ctrl.signal },
        );
        // Stale-response guard: a slow response from a superseded request
        // could otherwise overwrite a fresh "checking" / "available" set
        // by the next debounce window with stale data — including
        // letting the user submit a name the new server response would
        // have called taken. Bail before any setAvailability if the
        // controller has been aborted by the next cleanup.
        if (ctrl.signal.aborted) return;
        if (!res.ok) {
          setAvailability({ kind: 'idle' });
          return;
        }
        const json = (await res.json()) as
          | { available: true }
          | { available: false; reason: 'invalid' | 'reserved' | 'taken' };
        if (ctrl.signal.aborted) return;
        setAvailability(
          json.available ? { kind: 'available' } : { kind: 'unavailable', reason: json.reason },
        );
      } catch (err) {
        // AbortError is expected when the next debounce supersedes us;
        // leave the indicator alone so the next effect's "checking" is
        // not flapped back to idle.
        if (
          err instanceof DOMException && err.name === 'AbortError' ||
          ctrl.signal.aborted
        ) {
          return;
        }
        // Real network error — server will re-validate on submit, so
        // a quiet idle is the right UX here.
        setAvailability({ kind: 'idle' });
      }
    }, CHECK_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [trimmed, validFormat, cleared, sameAsCurrent, setAvailability]);

  const canSubmit =
    save.kind !== 'saving' &&
    !sameAsCurrent &&
    (cleared || availability.kind === 'available');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSave({ kind: 'saving' });
    try {
      const res = await fetch('/api/account/username', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: cleared ? null : trimmed }),
      });
      if (!res.ok) {
        let message = t('account.usernameSaveFailed');
        let body: { error?: string; reason?: string } = {};
        try {
          body = (await res.json()) as { error?: string; reason?: string };
        } catch {
          /* ignore */
        }
        if (res.status === 409) message = t('account.usernameTaken');
        else if (res.status === 400) {
          // Reserved names get a softer "contact us" message; anything
          // else 400 is a format/validation problem.
          message = body.reason === 'reserved'
            ? t('account.usernameReserved')
            : t('account.usernameInvalid');
        } else if (body.error) {
          message = body.error;
        }
        setSave({ kind: 'error', message });
        return;
      }
      const j = (await res.json()) as { username: string | null };
      track('username_set', { hasName: j.username != null });
      setSave({ kind: 'saved', value: j.username });
      onRefetchSession();
    } catch (err) {
      setSave({
        kind: 'error',
        message: err instanceof Error ? err.message : t('account.usernameSaveFailed'),
      });
    }
  }

  async function handleSignOut() {
    // Always navigate home, even if signOut throws — keeps the user from
    // being stranded on a logged-in-only page when a network blip causes
    // the request to fail. Server cookie may persist a bit longer; the
    // home page's session check will clean that up on next interaction.
    try {
      await authClient.signOut();
    } catch {
      /* ignore — navigate anyway */
    }
    window.location.href = homeHref;
  }

  // Fetch active sessions on mount. Re-fetched after a successful revoke so
  // the list stays accurate without a separate refresh button.
  const refreshSessions = async () => {
    try {
      const res = await fetch('/api/account/sessions');
      if (!res.ok) {
        setSessionsState({ kind: 'error' });
        return;
      }
      const json = (await res.json()) as { sessions: SessionRow[] };
      setSessionsState({ kind: 'ready', sessions: json.sessions });
    } catch {
      setSessionsState({ kind: 'error' });
    }
  };
  useEffect(() => {
    void refreshSessions();
  }, []);

  async function handleRevokeSession(s: SessionRow) {
    if (revokingId) return;
    // Revoking the *current* session signs the user out — that's a real
    // surprise if they tapped Revoke while scanning the device list. Gate
    // it with a native confirm dialog (sufficient for low-frequency
    // destructive ops; building a custom modal here just to ask "are you
    // sure" feels disproportionate). Other-device revokes don't sign the
    // user out, so they don't need a confirm.
    if (s.current) {
      const ok = window.confirm(t('account.sessionsRevokeConfirm'));
      if (!ok) return;
    }
    setRevokeError(null);
    setRevokingId(s.id);
    try {
      const res = await fetch(`/api/account/sessions/${encodeURIComponent(s.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        // Failure path used to silently no-op; user clicks Revoke and
        // nothing happens, no clue why. Surface a banner so they know
        // to retry instead of staring at an unchanged list.
        setRevokeError(t('account.sessionsRevokeFailed'));
        return;
      }
      track('session_revoked', { wasCurrent: s.current });
      if (s.current) {
        // Revoking ourselves — clear cookie + bounce home.
        await authClient.signOut().catch(() => undefined);
        window.location.href = homeHref;
        return;
      }
      await refreshSessions();
    } catch {
      setRevokeError(t('account.sessionsRevokeFailed'));
    } finally {
      setRevokingId(null);
    }
  }

  function handleExportAll() {
    setExportError(null);
    let url: string | null = null;
    let anchor: HTMLAnchorElement | null = null;
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        version: 1,
        account: {
          email: sessionUser.email,
          createdAt: sessionUser.createdAt ?? null,
          username: sessionUser.username ?? null,
        },
        visited: visitedShops,
        starred: starredShops,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      url = URL.createObjectURL(blob);
      anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `acoffee-account-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      track('account_data_exported', {
        shopCount: visitedShops.length,
        starredCount: starredShops.length,
      });
    } catch {
      // Browser denied download / blob alloc failed / JSON.stringify
      // hit a circular shape — anything in this path used to silently
      // do nothing. Make the failure visible instead.
      setExportError(t('account.exportFailed'));
    } finally {
      if (anchor && anchor.parentNode) anchor.parentNode.removeChild(anchor);
      if (url) URL.revokeObjectURL(url);
    }
  }

  const createdAtRaw = sessionUser.createdAt;
  const createdAt = createdAtRaw
    ? typeof createdAtRaw === 'string'
      ? new Date(createdAtRaw).getTime()
      : createdAtRaw.getTime()
    : null;

  // Show the public link based on the just-saved value first, falling back to
  // the session's persisted value — covers the "saved seconds ago, session
  // refetch hasn't returned yet" gap.
  const effectiveUsername =
    save.kind === 'saved' ? save.value : (sessionUser.username ?? null);
  const profileHref = effectiveUsername
    ? buildLocalizedPathname(`/${effectiveUsername}`, locale)
    : null;

  // Setup progress shown in the sidebar. Derived from the session, which
  // every card refreshes after a successful save (AccountRefreshContext).
  const bookingAvailability = parseInitialAvailability(sessionUser.availabilitySlots);
  const sectionStatus: SectionStatusMap = {
    'account-username': effectiveUsername ? 'done' : 'todo',
    'account-visibility': sessionUser.profilePublic ? 'done' : 'todo',
    'account-avatar': sessionUser.image ? 'done' : 'todo',
    'account-basic': sessionUser.displayName?.trim() || sessionUser.bio?.trim() ? 'done' : 'todo',
    // Collapsed = the user hasn't opted into bookings: no nagging dot.
    ...(bookingExpanded
      ? {
          'account-booking':
            sessionUser.homeBaseAddress?.trim() &&
            WEEKDAYS.some((d) => bookingAvailability[d].enabled)
              ? ('done' as const)
              : ('todo' as const),
        }
      : {}),
  };

  // Sections with unsaved edits, reported by the cards via DirtyContext.
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(() => new Set());
  const reportDirty = useCallback((id: string, dirty: boolean) => {
    setDirtyIds((prev) => {
      if (prev.has(id) === dirty) return prev;
      const next = new Set(prev);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  // The username card's state lives in this component, so it's folded in
  // here rather than reported through the context.
  const usernameDirty =
    save.kind !== 'saving' && draft.trim().toLowerCase() !== (effectiveUsername ?? '');
  const unsavedIds = useMemo(() => {
    const all = new Set(dirtyIds);
    if (usernameDirty) all.add('account-username');
    return all;
  }, [dirtyIds, usernameDirty]);
  const hasUnsaved = unsavedIds.size > 0;

  // Leaving the page (reload, close, or any full navigation — the header
  // links are plain anchors) with unsaved edits asks first.
  useEffect(() => {
    if (!hasUnsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsaved]);

  const [linkCopied, setLinkCopied] = useState(false);
  async function copyProfileLink() {
    if (!effectiveUsername) return;
    try {
      await navigator.clipboard.writeText(`https://acoffee.com/${effectiveUsername}`);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* clipboard can reject outside secure contexts — the link is still visible */
    }
  }

  return (
    <AccountRefreshContext.Provider value={onRefetchSession}>
    <DirtyContext.Provider value={reportDirty}>
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.logo} href={homeHref} aria-label={t('app.logoAlt')}>
            <span className={styles.logoWordmark}>ACoffee</span>
          </a>
          <HeaderNavLinks />
          <div className={styles.headerAside}>
            <LanguageSwitcher />
            <GithubLink />
            {import.meta.env.VITE_AUTH_ENABLED === 'true' ? (
              <>
                <SyncIndicator />
                <AccountMenu />
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={styles.pageTitle}>{t('account.title')}</h1>
          <p className={styles.lead}>{t('account.lead')}</p>
        </div>

        <div className={styles.layout}>
          <AccountToc status={sectionStatus} unsaved={unsavedIds} onNavigate={goToSection} />
          <div className={styles.content}>

        {/* Summary only once there's something in it — a brand-new account
            would otherwise open on a row of zeros above the username. */}
        {stats.total > 0 || stats.shops > 0 ? (
        <section id="account-stats" className={styles.card} aria-label={t('account.statsTitle')}>
          <h2 className={styles.cardTitle}>{t('account.statsTitle')}</h2>
          <div className={styles.statsRow}>
            <a href={passportHref} className={`${styles.statCell} ${styles.statCellLink}`}>
              <div className={styles.statCellValue}>{stats.shops}</div>
              <div className={styles.statCellLabel}>{t('passport.statShops')}</div>
            </a>
            <a href={passportHref} className={`${styles.statCell} ${styles.statCellLink}`}>
              <div className={styles.statCellValue}>{stats.total}</div>
              <div className={styles.statCellLabel}>{t('passport.statVisits')}</div>
            </a>
            <a href={passportHref} className={`${styles.statCell} ${styles.statCellLink}`}>
              <div className={styles.statCellValue}>{stats.streak}</div>
              <div className={styles.statCellLabel}>{t('passport.statStreak')}</div>
            </a>
          </div>
        </section>
        ) : null}


        <section id="account-username" className={styles.card} aria-label={t('account.usernameTitle')}>
          <h2 className={styles.cardTitle}>{t('account.usernameTitle')}</h2>
          <form className={styles.usernameForm} onSubmit={handleSubmit}>
            <div className={styles.usernamePrefix}>
              <span className={styles.usernamePrefixLabel}>acoffee.com/</span>
              <input
                ref={usernameInputRef}
                className={styles.usernameInput}
                type="text"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={t('account.usernamePlaceholder')}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (save.kind !== 'idle') setSave({ kind: 'idle' });
                }}
                aria-invalid={availability.kind === 'unavailable' || undefined}
                aria-describedby="username-hint username-availability"
              />
            </div>

            <p
              id="username-availability"
              className={styles.availability}
              aria-live="polite"
              role="status"
            >
              {renderAvailability(availability, t)}
            </p>

            <p className={styles.usernameHint} id="username-hint">
              {t('account.usernameHint')}
            </p>

            <div className={styles.formRow}>
              <button type="submit" className={styles.saveButton} disabled={!canSubmit}>
                {save.kind === 'saving'
                  ? t('account.saving')
                  : cleared && initialUsername
                    ? t('account.clearUsername')
                    : t('account.saveUsername')}
              </button>
              {save.kind === 'error' ? (
                <p className={styles.errorMsg} role="alert">{save.message}</p>
              ) : null}
              {save.kind === 'saved' ? (
                <p className={styles.successMsg} role="status">
                  {save.value
                    ? t('account.usernameSaved', { username: save.value })
                    : t('account.usernameCleared')}
                </p>
              ) : null}
            </div>

            {effectiveUsername ? (
              <div className={styles.publicLink}>
                <span aria-hidden>🔗</span>
                <span>
                  {t('account.publicLink')}{' '}
                  <a
                    className={styles.publicLinkUrl}
                    href={profileHref ?? undefined}
                    target="_blank"
                    rel="noopener"
                  >
                    acoffee.com/{effectiveUsername}
                  </a>
                </span>
                <button
                  type="button"
                  className={styles.publicLinkCopy}
                  onClick={() => void copyProfileLink()}
                >
                  {linkCopied ? t('account.linkCopied') : t('account.copyLink')}
                </button>
              </div>
            ) : null}
          </form>
        </section>

        <ProfileVisibilityCard
          hasUsername={!!effectiveUsername}
          username={effectiveUsername}
          initial={
            (sessionUser as { profilePublic?: boolean }).profilePublic === true
          }
          suspended={!!sessionUser.profileSuspendedAt}
        />

        <AvatarCard initialImage={(sessionUser as { image?: string | null }).image ?? null} />

        <BasicProfileCard
          initialDisplayName={
            (sessionUser as { displayName?: string | null }).displayName ?? ''
          }
          initialBio={(sessionUser as { bio?: string | null }).bio ?? ''}
        />

        <SocialLinksCard
          initialSocialLinks={parseInitialSocialLinks(
            (sessionUser as { socialLinks?: string }).socialLinks,
          )}
          initialShowSocialLinks={
            (sessionUser as { showSocialLinks?: boolean }).showSocialLinks !== false
          }
        />

        <ThemeCard
          initialPreset={
            (THEME_PRESETS.some(
              (p) => p.value === (sessionUser as { themePreset?: string }).themePreset,
            )
              ? (sessionUser as { themePreset?: ThemePreset }).themePreset
              : 'default') ?? 'default'
          }
          username={effectiveUsername}
          displayName={sessionUser.displayName ?? null}
          bio={sessionUser.bio ?? null}
          image={sessionUser.image ?? null}
        />

        <FeaturedCafesCard />

        {bookingExpanded ? (
          <>
            <BookingSetupCard
              initialAddress={
                (sessionUser as { homeBaseAddress?: string | null }).homeBaseAddress ?? ''
              }
              initialAvailability={parseInitialAvailability(
                (sessionUser as { availabilitySlots?: string }).availabilitySlots,
              )}
              username={sessionUser.username ?? ''}
              profilePublic={!!sessionUser.profilePublic}
              timezone={sessionUser.timezone ?? null}
            />

            <CalendarSyncCard
              initialUrl={sessionUser.busyCalendarIcsUrl ?? ''}
              initialSyncedAt={msFromMaybe(sessionUser.busyCalendarSyncedAt)}
              initialLastError={sessionUser.busyCalendarLastError ?? null}
              initialLastErrorAt={msFromMaybe(sessionUser.busyCalendarLastErrorAt)}
              bookingOpen={sectionStatus['account-booking'] === 'done'}
            />
          </>
        ) : (
          <section id="account-booking" className={styles.card} aria-label={t('account.bookingTitle')}>
            <h2 className={styles.cardTitle}>{t('account.bookingTitle')}</h2>
            <p className={styles.usernameHint} style={{ marginTop: 0 }}>
              {t('account.bookingTeaser')}
            </p>
            <div className={styles.formRow}>
              <button
                type="button"
                className={styles.saveButton}
                onClick={() => goToSection('account-booking')}
              >
                {t('account.bookingTeaserCta')}
              </button>
            </div>
          </section>
        )}


        <section id="account-identity" className={styles.card} aria-label={t('account.identityTitle')}>
          <h2 className={styles.cardTitle}>{t('account.identityTitle')}</h2>
          <div className={styles.identityRow}>
            <span className={styles.identityKey}>{t('account.email')}</span>
            <span className={styles.identityValue}>{sessionUser.email}</span>
          </div>
          {createdAt != null ? (
            <div className={styles.identityRow}>
              <span className={styles.identityKey}>{t('account.memberSince')}</span>
              <span className={styles.identityValue}>{formatAbsoluteDate(createdAt, locale)}</span>
            </div>
          ) : null}
        </section>

        <section id="account-export" className={styles.card} aria-label={t('account.exportTitle')}>
          <h2 className={styles.cardTitle}>{t('account.exportTitle')}</h2>
          <p className={styles.dangerHint} style={{ color: 'var(--ac-text-muted)' }}>
            {t('account.exportHint')}
          </p>
          <button
            type="button"
            className={styles.saveButton}
            onClick={handleExportAll}
            style={{ alignSelf: 'flex-start' }}
          >
            {t('account.exportButton')}
          </button>
          {exportError ? (
            <p className={styles.sessionsRevokeError} role="alert">
              {exportError}
            </p>
          ) : null}
        </section>

        <section id="account-sessions" className={styles.card} aria-label={t('account.sessionsTitle')}>
          <h2 className={styles.cardTitle}>{t('account.sessionsTitle')}</h2>
          {sessionsState.kind === 'loading' ? (
            <p className={styles.sessionLoading}>{t('account.sessionsLoading')}</p>
          ) : sessionsState.kind === 'error' ? (
            <div className={styles.sessionsErrorBlock} role="alert">
              <p className={styles.sessionsErrorText}>{t('account.sessionsError')}</p>
              <button
                type="button"
                className={styles.sessionsErrorRetry}
                onClick={() => {
                  setSessionsState({ kind: 'loading' });
                  void refreshSessions();
                }}
              >
                {t('errors.retry')}
              </button>
            </div>
          ) : sessionsState.sessions.length === 0 ? (
            <p className={styles.sessionEmpty}>{t('account.sessionsEmpty')}</p>
          ) : (
            <ul className={styles.sessionList}>
              {sessionsState.sessions.map((s) => (
                <li key={s.id} className={styles.sessionRow}>
                  <div className={styles.sessionMain}>
                    <div className={styles.sessionDevice}>
                      {s.device}
                      {s.current ? (
                        <span className={styles.sessionCurrent}>
                          {t('account.sessionsCurrent')}
                        </span>
                      ) : null}
                    </div>
                    <div className={styles.sessionMeta}>
                      {formatAbsoluteDateTime(s.createdAt, locale)}
                      {s.ipAddress ? <> · {s.ipAddress}</> : null}
                    </div>
                  </div>
                  {/* The current device signs out with the button below the
                      list, so its row doesn't repeat it. */}
                  {s.current ? null : (
                    <button
                      type="button"
                      className={styles.sessionRevoke}
                      onClick={() => void handleRevokeSession(s)}
                      disabled={revokingId != null}
                      aria-label={t('account.sessionsRevokeAria', { device: s.device })}
                    >
                      {revokingId === s.id
                        ? t('account.sessionsRevoking')
                        : t('account.sessionsRevoke')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {revokeError ? (
            <p className={styles.sessionsRevokeError} role="alert">
              {revokeError}
            </p>
          ) : null}
          {/* Sign out of this device — used to be a card of its own holding
              just this button. */}
          <div className={styles.formRow} style={{ marginTop: 'var(--ac-space-3)' }}>
            <button type="button" className={styles.signOutButton} onClick={() => void handleSignOut()}>
              {t('auth.signOut')}
            </button>
          </div>
        </section>

        <section
          id="account-danger"
          className={`${styles.card} ${styles.dangerCard}`}
          aria-label={t('account.deleteTitle')}
        >
          <h2 className={styles.cardTitle}>{t('account.deleteTitle')}</h2>
          <p className={styles.dangerHint}>{t('account.deleteHint')}</p>
          <button
            type="button"
            className={styles.dangerButton}
            onClick={() => setDeleteOpen(true)}
          >
            {t('account.deleteButton')}
          </button>
        </section>
          </div>
        </div>
      </main>

      {deleteOpen ? (
        <DeleteAccountModal
          onClose={() => setDeleteOpen(false)}
          onConfirmed={() => {
            // After deletion the session is gone server-side; clear client state too.
            void authClient.signOut().finally(() => {
              window.location.href = homeHref;
            });
          }}
        />
      ) : null}
    </div>
    </DirtyContext.Provider>
    </AccountRefreshContext.Provider>
  );
}

function renderAvailability(state: AvailabilityState, t: (k: string) => string) {
  switch (state.kind) {
    case 'idle':
      return <>&nbsp;</>; // reserve vertical space so layout doesn't jump
    case 'checking':
      return (
        <span className={styles.availabilityChecking}>{t('account.usernameChecking')}</span>
      );
    case 'available':
      return (
        <span className={styles.availabilityOk}>
          <span className={styles.availabilityIcon} aria-hidden>✓</span>
          {t('account.usernameAvailable')}
        </span>
      );
    case 'unavailable': {
      const key =
        state.reason === 'taken'
          ? 'account.usernameTaken'
          : state.reason === 'reserved'
            ? 'account.usernameReserved'
            : 'account.usernameInvalid';
      return (
        <span className={styles.availabilityFail}>
          <span className={styles.availabilityIcon} aria-hidden>✕</span>
          {t(key)}
        </span>
      );
    }
  }
}
