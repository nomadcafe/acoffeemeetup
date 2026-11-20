import { useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { track } from '../../utils/analytics';
import styles from '../AccountPage.module.css';
import { type Availability, type DaySlot, type Weekday, WEEKDAYS } from './availability';
import {
  type StatusBanner,
  useAccountRefresh,
  useAutoDismissOk,
  useReportDirty,
  useSavedSnapshot,
} from './shared';

interface BookingSetupProps {
  initialAddress: string;
  initialAvailability: Availability;
  /** Used to render the public booking link the user can copy/share. Empty
   *  when the user hasn't claimed a username yet. */
  username: string;
  /** Whether the user has published their profile. The link only works if
   *  profile_public=true, so we hide the share row otherwise. */
  profilePublic: boolean;
}

/**
 * Phase 2.A: organizer-side booking config. Address is one endpoint of the
 * midpoint search; weekly availability says when bookings are accepted.
 * The actual booking widget on /yourname (Phase 2.B) reads these two and
 * renders a "pick a slot" UI for visitors. Until both are filled in, the
 * widget stays in its "coming soon" placeholder state on profile pages.
 */
export function BookingSetupCard({
  initialAddress,
  initialAvailability,
  username,
  profilePublic,
}: BookingSetupProps) {
  const refreshAccount = useAccountRefresh();
  const { t } = useI18n();
  const [address, setAddress] = useState(initialAddress);
  const [days, setDays] = useState<Availability>(initialAvailability);
  const bookingKey = (a: string, d: Availability) => JSON.stringify([a.trim(), d]);
  const [savedBooking, markBookingSaved] = useSavedSnapshot(
    bookingKey(initialAddress, initialAvailability),
  );
  useReportDirty('account-booking', bookingKey(address, days) !== savedBooking);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusBanner>(null);
  useAutoDismissOk(status, setStatus);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  // Use the current origin so staging / preview deployments link back
  // to themselves instead of pointing the recipient at the prod host
  // (where their booking-day setup wouldn't exist yet).
  const bookingLink =
    username && profilePublic ? `${window.location.origin}/${username}` : null;
  const handleCopyLink = async () => {
    if (!bookingLink) return;
    try {
      await navigator.clipboard.writeText(bookingLink);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      // Clipboard API can throw in older Safari, in iframes without
      // the right Permissions-Policy, and when the page is loaded over
      // http. Don't silently swallow — the user clicked Copy expecting
      // *something* to happen. Show a brief "couldn't copy" state.
      setCopyState('failed');
      window.setTimeout(() => setCopyState('idle'), 2500);
    }
  };

  function setDay(day: Weekday, patch: Partial<DaySlot>) {
    setDays((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  }

  // A day is "valid" if it's disabled OR start < end. The Save button blocks
  // on any inverted range so the server doesn't have to bounce a 400.
  const invalidDay = WEEKDAYS.find(
    (d) => days[d].enabled && days[d].start >= days[d].end,
  );

  async function handleSave() {
    if (busy || invalidDay) return;
    setBusy(true);
    setStatus(null);
    // Wire format: only send days that are enabled OR explicitly set; same
    // shape on the server. Empty object = "no availability".
    const payload: Record<Weekday, DaySlot> = {} as Record<Weekday, DaySlot>;
    for (const d of WEEKDAYS) payload[d] = days[d];
    // Capture the browser's IANA tz so the server can interpret
    // "Mon 14:00-17:00" as 2-5pm in the organizer's actual hometown
    // rather than UTC wall-clock.
    let tz = 'UTC';
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      /* fall back to UTC */
    }
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          homeBaseAddress: address.trim() ? address.trim() : null,
          availabilitySlots: payload,
          timezone: tz,
        }),
      });
      if (!res.ok) {
        setStatus({ kind: 'err', message: t('account.bookingSaveFailed') });
        return;
      }
      markBookingSaved(bookingKey(address, days));
      setStatus({ kind: 'ok', message: t('account.bookingSaved') });
      refreshAccount();
      track('booking_config_set', {
        hasAddress: !!address.trim(),
        enabledDays: WEEKDAYS.filter((d) => days[d].enabled).length,
      });
    } catch {
      setStatus({ kind: 'err', message: t('account.bookingSaveFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="account-booking" className={styles.card} aria-label={t('account.bookingTitle')}>
      <h2 className={styles.cardTitle}>{t('account.bookingTitle')}</h2>
      <p className={styles.usernameHint} style={{ marginTop: 0 }}>
        {t('account.bookingHint')}
      </p>

      {bookingLink ? (
        <div className={styles.bookingLinkRow}>
          <span className={styles.bookingLinkLabel}>{t('account.bookingLinkLabel')}</span>
          <a
            href={bookingLink}
            target="_blank"
            rel="noreferrer"
            className={styles.bookingLinkValue}
          >
            {bookingLink.replace(/^https?:\/\//, '')}
          </a>
          <button
            type="button"
            className={styles.bookingLinkCopy}
            onClick={() => void handleCopyLink()}
          >
            {copyState === 'copied'
              ? t('account.bookingLinkCopied')
              : copyState === 'failed'
                ? t('account.bookingLinkCopyFailed')
                : t('account.bookingLinkCopy')}
          </button>
        </div>
      ) : null}

      <label className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>{t('account.homeBaseLabel')}</span>
        <input
          type="text"
          className={styles.usernameInput}
          maxLength={200}
          placeholder={t('account.homeBasePlaceholder')}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <span className={styles.usernameHint}>{t('account.homeBaseHint')}</span>
      </label>

      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>{t('account.availabilityLabel')}</span>
        {WEEKDAYS.map((d) => {
          const slot = days[d];
          const inverted = slot.enabled && slot.start >= slot.end;
          return (
            <div key={d} className={styles.dayRow}>
              <label className={styles.dayToggle}>
                <input
                  type="checkbox"
                  checked={slot.enabled}
                  onChange={(e) => setDay(d, { enabled: e.target.checked })}
                />
                <span className={styles.dayName}>{t(`account.weekday.${d}`)}</span>
              </label>
              <input
                type="time"
                className={styles.timeInput}
                value={slot.start}
                disabled={!slot.enabled}
                onChange={(e) => setDay(d, { start: e.target.value })}
                aria-invalid={inverted || undefined}
              />
              <span className={styles.timeSep} aria-hidden>→</span>
              <input
                type="time"
                className={styles.timeInput}
                value={slot.end}
                disabled={!slot.enabled}
                onChange={(e) => setDay(d, { end: e.target.value })}
                aria-invalid={inverted || undefined}
              />
            </div>
          );
        })}
      </div>

      <div className={styles.formRow}>
        <button
          type="button"
          className={styles.saveButton}
          onClick={() => void handleSave()}
          disabled={busy || invalidDay !== undefined}
        >
          {busy ? t('account.saving') : t('account.bookingSave')}
        </button>
        {invalidDay ? (
          <p className={styles.errorMsg} role="alert">
            {t('account.bookingInvalidRange')}
          </p>
        ) : status ? (
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
