import { useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { useAddressAutocomplete } from '../../hooks/useAddressAutocomplete';
import { track } from '../../utils/analytics';
import styles from '../AccountPage.module.css';
import { type Availability, type DaySlot, type Weekday, WEEKDAYS } from './availability';
import { scrollToSection } from './sections';
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
  /** IANA zone the weekly hours are interpreted in (derived server-side
   *  from the saved home base, else the browser's zone at save time). */
  timezone: string | null;
}

/** One-tap starting points; each only touches the days it names. */
const PRESETS: ReadonlyArray<{
  key: 'weekdayAfternoons' | 'weekdayLunch' | 'weekends';
  days: readonly Weekday[];
  start: string;
  end: string;
}> = [
  { key: 'weekdayAfternoons', days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '14:00', end: '17:00' },
  { key: 'weekdayLunch', days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '12:00', end: '13:30' },
  { key: 'weekends', days: ['sat', 'sun'], start: '10:00', end: '16:00' },
];

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
  timezone,
}: BookingSetupProps) {
  const refreshAccount = useAccountRefresh();
  const { t, locale } = useI18n();
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

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setDays((prev) => {
      const next = { ...prev };
      for (const d of preset.days) next[d] = { enabled: true, start: preset.start, end: preset.end };
      return next;
    });
  }

  /** Copy the first open day's hours onto every other open day. */
  const firstOpen = WEEKDAYS.find((d) => days[d].enabled);
  const canUnify =
    firstOpen !== undefined &&
    WEEKDAYS.some(
      (d) =>
        days[d].enabled &&
        (days[d].start !== days[firstOpen].start || days[d].end !== days[firstOpen].end),
    );
  function unifyHours() {
    if (!firstOpen) return;
    const { start, end } = days[firstOpen];
    setDays((prev) => {
      const next = { ...prev };
      for (const d of WEEKDAYS) if (next[d].enabled) next[d] = { ...next[d], start, end };
      return next;
    });
  }

  const addressAc = useAddressAutocomplete(locale === 'zh' ? 'zh-CN' : locale);

  // What still stands between the user and a working booking page. Based
  // on saved state (props), not the unsaved draft — it describes what
  // visitors can do right now.
  const savedHasDay = WEEKDAYS.some((d) => initialAvailability[d].enabled);
  const missing: Array<{ key: string; target: string }> = [
    ...(username ? [] : [{ key: 'account.bookingNeedsUsername', target: 'account-username' }]),
    ...(profilePublic ? [] : [{ key: 'account.bookingNeedsPublic', target: 'account-visibility' }]),
    ...(initialAddress.trim() ? [] : [{ key: 'account.bookingNeedsAddress', target: 'booking-address' }]),
    ...(savedHasDay ? [] : [{ key: 'account.bookingNeedsHours', target: 'booking-hours' }]),
  ];

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

      {missing.length === 0 ? (
        <p className={styles.bookingReady} role="status">
          {t('account.bookingOpen')}
        </p>
      ) : (
        <div className={styles.bookingMissing} role="status">
          <p className={styles.bookingMissingTitle}>{t('account.bookingNotOpen')}</p>
          <ul className={styles.bookingMissingList}>
            {missing.map((m) => (
              <li key={m.key}>
                <a
                  href={`#${m.target}`}
                  onClick={(e) => {
                    if (m.target.startsWith('account-')) {
                      if (scrollToSection(m.target)) e.preventDefault();
                    } else {
                      const el = document.getElementById(m.target);
                      if (el) {
                        e.preventDefault();
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el.focus({ preventScroll: true });
                      }
                    }
                  }}
                >
                  {t(m.key)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {bookingLink && missing.length === 0 ? (
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

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor="booking-address">
          {t('account.homeBaseLabel')}
        </label>
        <div className={styles.addressWrap}>
          <input
            id="booking-address"
            type="text"
            className={styles.usernameInput}
            maxLength={200}
            placeholder={t('account.homeBasePlaceholder')}
            value={address}
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={addressAc.suggestions.length > 0}
            onChange={(e) => {
              setAddress(e.target.value);
              addressAc.query(e.target.value);
            }}
            onBlur={() => window.setTimeout(() => addressAc.clear(), 150)}
          />
          {addressAc.suggestions.length > 0 ? (
            <ul className={styles.featuredCafeSuggestions} role="listbox">
              {addressAc.suggestions.map((sug, i) => {
                const text = sug.placePrediction?.text.text ?? '';
                if (!text) return null;
                return (
                  <li key={`${i}-${text}`} role="option" aria-selected={false}>
                    <button
                      type="button"
                      className={styles.featuredCafeSuggestion}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={async () => {
                        const picked = await addressAc.pick(sug);
                        if (picked) setAddress(picked);
                      }}
                    >
                      {text}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        <span className={styles.usernameHint}>{t('account.homeBaseHint')}</span>
      </div>

      <div className={styles.fieldGroup} id="booking-hours" tabIndex={-1}>
        <span className={styles.fieldLabel}>{t('account.availabilityLabel')}</span>
        {timezone ? (
          <span className={styles.usernameHint} style={{ marginTop: 0 }}>
            {t(
              initialAddress.trim()
                ? 'account.availabilityTimezone'
                : 'account.availabilityTimezoneBrowser',
              { zone: timezone },
            )}
          </span>
        ) : null}
        <div className={styles.presetRow}>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={styles.presetChip}
              onClick={() => applyPreset(p)}
            >
              {t(`account.bookingPreset.${p.key}`)}
            </button>
          ))}
          {canUnify ? (
            <button type="button" className={styles.presetChip} onClick={unifyHours}>
              {t('account.bookingUnifyHours', { day: t(`account.weekday.${firstOpen}`) })}
            </button>
          ) : null}
        </div>
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
