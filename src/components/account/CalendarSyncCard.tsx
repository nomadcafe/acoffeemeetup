import { useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { CALENDAR_PROVIDER_NAMES, isSupportedCalendarUrl } from '../../utils/calendarHosts';
import styles from '../AccountPage.module.css';
import { type StatusBanner, useAccountRefresh, useAutoDismissOk, useReportDirty } from './shared';

interface CalendarSyncProps {
  initialUrl: string;
  initialSyncedAt: number | null;
  initialLastError: string | null;
  initialLastErrorAt: number | null;
  /** Busy-time sync only matters once there are bookable hours. */
  bookingOpen: boolean;
}

/**
 * iCal URL subscription. Whatever the organizer publishes here gets
 * fetched by the availability endpoint to subtract real busy events from
 * the offered slots — so a recurring stand-up on Mon 14:00 doesn't show
 * up as bookable just because their weekly availability says
 * "Mon 14:00–17:00".
 *
 * Save calls /api/account which probe-fetches the URL and 400s if the
 * feed is unreachable / not iCalendar — surfacing the parser error
 * directly so the user knows whether they pasted the wrong URL.
 */
export function CalendarSyncCard({
  initialUrl,
  initialSyncedAt,
  initialLastError,
  initialLastErrorAt,
  bookingOpen,
}: CalendarSyncProps) {
  const refreshAccount = useAccountRefresh();
  const { t, locale } = useI18n();
  const [url, setUrl] = useState(initialUrl);
  const [syncedAt, setSyncedAt] = useState<number | null>(initialSyncedAt);
  // Last-error state mirrors what's on the user row. Cleared in the UI
  // immediately on save attempt so an old error doesn't linger after
  // the user fixes the URL — server will re-record on the next failed
  // visitor view if the new URL is also broken.
  const [lastError, setLastError] = useState<string | null>(initialLastError);
  const [lastErrorAt, setLastErrorAt] = useState<number | null>(initialLastErrorAt);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusBanner>(null);
  useAutoDismissOk(status, setStatus);
  // Track the last-saved baseline locally so `dirty` resets after a
  // successful save. Comparing against the prop alone left the Save
  // button enabled forever once a save landed: the prop is stale until
  // the parent re-fetches, but the user has nothing new to save.
  const [savedUrl, setSavedUrl] = useState(initialUrl);
  useReportDirty('account-calendar', url.trim() !== savedUrl.trim());
  const dirty = url.trim() !== savedUrl.trim();
  // Same allowlist the server enforces — say so before a round trip.
  const unsupported = url.trim() !== '' && !isSupportedCalendarUrl(url);

  async function send(payload: { busyCalendarIcsUrl: string | null }) {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        setStatus({
          kind: 'err',
          message:
            j.code === 'calendar_host_not_supported'
              ? t('account.calendarUnsupported', { providers: CALENDAR_PROVIDER_NAMES })
              : (j.error ?? t('account.calendarSaveFailed')),
        });
        return;
      }
      if (payload.busyCalendarIcsUrl == null) {
        setSyncedAt(null);
      } else {
        setSyncedAt(Date.now());
      }
      // PATCH /api/account already probe-fetches the URL; reaching here
      // means it parsed OK at save time. Clear any stale error so the
      // UI doesn't keep nagging until the next visitor view.
      setLastError(null);
      setLastErrorAt(null);
      // Save baseline → next dirty check will read clean.
      setSavedUrl(payload.busyCalendarIcsUrl ?? '');
      setStatus({ kind: 'ok', message: t('account.calendarSaved') });
      refreshAccount();
    } catch {
      setStatus({ kind: 'err', message: t('account.calendarSaveFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="account-calendar" className={styles.card} aria-label={t('account.calendarTitle')}>
      <h2 className={styles.cardTitle}>{t('account.calendarTitle')}</h2>
      <p className={styles.usernameHint} style={{ marginTop: 0 }}>
        {t('account.calendarHint')}
      </p>

      {!bookingOpen ? (
        <p className={styles.usernameHint} style={{ marginTop: 0 }}>
          {t('account.calendarNeedsBooking')}
        </p>
      ) : null}

      <label className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>{t('account.calendarUrlLabel')}</span>
        <input
          type="url"
          className={styles.usernameInput}
          maxLength={500}
          inputMode="url"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          placeholder={t('account.calendarUrlPlaceholder')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-invalid={unsupported || undefined}
          aria-describedby={unsupported ? 'calendar-unsupported' : undefined}
        />
        {unsupported ? (
          <span id="calendar-unsupported" className={styles.errorMsg} role="alert">
            {t('account.calendarUnsupported', { providers: CALENDAR_PROVIDER_NAMES })}
          </span>
        ) : null}
        <span className={styles.usernameHint}>
          {t('account.calendarUrlHelp')}{' '}
          {t('account.calendarSupported', { providers: CALENDAR_PROVIDER_NAMES })}
        </span>
      </label>

      {lastError ? (
        <p className={styles.calendarErrorBanner} role="alert">
          <strong>{t('account.calendarBrokenTitle')}</strong>
          <br />
          {t('account.calendarBrokenBody', {
            when: lastErrorAt
              ? new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(lastErrorAt))
              : '',
            error: lastError,
          })}
        </p>
      ) : syncedAt ? (
        <p className={styles.usernameHint} style={{ marginTop: 0 }}>
          {t('account.calendarLastSync', {
            date: new Intl.DateTimeFormat(locale, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(syncedAt)),
          })}
        </p>
      ) : null}

      <div className={styles.formRow}>
        <button
          type="button"
          className={styles.saveButton}
          onClick={() => void send({ busyCalendarIcsUrl: url.trim() ? url.trim() : null })}
          disabled={busy || unsupported || (!dirty && initialUrl.trim() === '')}
        >
          {busy ? t('account.saving') : t('account.calendarSave')}
        </button>
        {initialUrl.trim() ? (
          <button
            type="button"
            className={styles.signOutButton}
            onClick={() => {
              setUrl('');
              void send({ busyCalendarIcsUrl: null });
            }}
            disabled={busy}
            style={{ marginLeft: '0.5rem' }}
          >
            {t('account.calendarDisconnect')}
          </button>
        ) : null}
        {status ? (
          <p
            className={status.kind === 'err' ? styles.errorMsg : styles.successMsg}
            role="status"
          >
            {status.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
