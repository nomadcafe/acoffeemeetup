import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../context/I18nContext';
import { track } from '../../utils/analytics';
import { useCafeAutocomplete } from '../../hooks/useCafeAutocomplete';
import styles from '../AccountPage.module.css';
import { type StatusBanner, useAccountRefresh, useAutoDismissOk, useReportDirty } from './shared';

type FeaturedCafeRelation = 'owned' | 'favorite';

/** Draft shape held in form state. Mirrors the request body sent on save
 *  plus server-computed `ownerVerified` (read-only here; refreshed by the
 *  GET round-trip after each save). `websiteUri` is captured from the
 *  picker so the server can re-run domain verification on save without
 *  another Places API call — never shown in the UI. */
interface FeaturedCafeDraft {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  relation: FeaturedCafeRelation;
  note: string;
  linkInstagram: string;
  linkWebsite: string;
  linkMenu: string;
  linkBookingExternal: string;
  ownerPinnedNote: string;
  websiteUri: string | null;
  /** Google Maps deep link captured from the picker. Persisted server-
   *  side so the booking-approve flow can surface "Open in Maps" on
   *  the visitor's confirmation email when this cafe is the host's
   *  pick. Not user-editable in the AccountPage UI. */
  googleMapsUri: string | null;
  ownerVerified: boolean;
}

const FEATURED_MAX = 5;

const FEATURED_NOTE_MAX = 140;

const FEATURED_PINNED_NOTE_MAX = 80;

const FEATURED_LINK_MAX = 200;

function emptyCafeFromPicked(
  picked: {
    placeId: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    websiteUri?: string | null;
    googleMapsUri?: string | null;
  },
  relation: FeaturedCafeRelation,
): FeaturedCafeDraft {
  return {
    placeId: picked.placeId,
    name: picked.name,
    address: picked.address,
    lat: picked.lat,
    lng: picked.lng,
    relation,
    note: '',
    linkInstagram: '',
    linkWebsite: '',
    linkMenu: '',
    linkBookingExternal: '',
    ownerPinnedNote: '',
    websiteUri: picked.websiteUri ?? null,
    googleMapsUri: picked.googleMapsUri ?? null,
    ownerVerified: false,
  };
}

export function FeaturedCafesCard() {
  const refreshAccount = useAccountRefresh();
  const { t, locale } = useI18n();
  const { visitedShops } = useApp();
  const [cafes, setCafes] = useState<FeaturedCafeDraft[]>([]);
  // Snapshot of what's saved server-side (set on load and after each save).
  const cafesKey = (list: FeaturedCafeDraft[]) =>
    JSON.stringify(
      list.map((c) => [
        c.placeId,
        c.relation,
        c.note.trim(),
        c.linkInstagram.trim(),
        c.linkWebsite.trim(),
        c.linkMenu.trim(),
        c.linkBookingExternal.trim(),
        c.ownerPinnedNote.trim(),
      ]),
    );
  const [savedCafesKey, setSavedCafesKey] = useState(() => cafesKey([]));
  useReportDirty('account-cafes', cafesKey(cafes) !== savedCafesKey);
  const [cafeQuery, setCafeQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusBanner>(null);
  useAutoDismissOk(status, setStatus);
  // Guards against double-tapping the same suggestion before pick()
  // resolves — see suggestions onClick below for the failure mode. The
  // ref handles the race; the state mirror drives the visual disabled
  // state on the button (refs alone don't trigger a re-render, so the
  // button never visually responded — UX felt broken on slow taps).
  const pickingRef = useRef(false);
  const [isPicking, setIsPicking] = useState(false);
  const cafeAutocomplete = useCafeAutocomplete(locale === 'zh' ? 'zh-CN' : locale);
  /* Mount guard for fetches that don't go through the mount-effect's
   * cancelled flag — specifically the post-save refresh in handleSave.
   * If the user navigates away while that refresh is in flight, its
   * setCafes would otherwise wipe the in-memory list and (in a fast
   * re-mount) blank out cafes the user just saved. */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Hydrate the featured-cafes list from /api/account on mount. Lives in
  // its own table, so it can't piggyback on the Better Auth session like
  // the other profile fields do.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/account');
        if (!res.ok) return;
        const data = (await res.json()) as {
          featuredCafes?: Array<Omit<FeaturedCafeDraft, 'note' | 'linkInstagram' | 'linkWebsite' | 'linkMenu' | 'linkBookingExternal' | 'ownerPinnedNote' | 'websiteUri' | 'googleMapsUri'> & {
            note: string | null;
            linkInstagram: string | null;
            linkWebsite: string | null;
            linkMenu: string | null;
            linkBookingExternal: string | null;
            ownerPinnedNote: string | null;
            googleMapsUri: string | null;
          }>;
        };
        if (cancelled || !data.featuredCafes) return;
        const loaded: FeaturedCafeDraft[] = data.featuredCafes.map((c) => ({
            placeId: c.placeId,
            name: c.name,
            address: c.address,
            lat: c.lat,
            lng: c.lng,
            relation: c.relation,
            note: c.note ?? '',
            linkInstagram: c.linkInstagram ?? '',
            linkWebsite: c.linkWebsite ?? '',
            linkMenu: c.linkMenu ?? '',
            linkBookingExternal: c.linkBookingExternal ?? '',
            ownerPinnedNote: c.ownerPinnedNote ?? '',
            // websiteUri is server-only — not returned by GET. Stays null
            // until the user re-picks via autocomplete; verification flag
            // we already have stays sticky.
            websiteUri: null,
            googleMapsUri: c.googleMapsUri,
            ownerVerified: c.ownerVerified,
          }));
        setCafes(loaded);
        setSavedCafesKey(cafesKey(loaded));
      } catch {
        /* keep cafes empty — user can still add fresh ones */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Top passport cafes — sorted by visit count desc. Powers the one-tap
   * "from your passport" picker so the most common case ("add a favorite
   * I've already stamped") doesn't require typing into autocomplete.
   * Filtered to exclude cafes already in the featured list so the user
   * can't accidentally add a duplicate (the (user_id, place_id) PK on
   * the server would reject it anyway). */
  const featuredPlaceIds = new Set(cafes.map((c) => c.placeId));
  const passportPicks = visitedShops
    .filter((s) => s.visits.length > 0 && !featuredPlaceIds.has(s.id))
    .slice()
    .sort((a, b) => b.visits.length - a.visits.length || a.name.localeCompare(b.name))
    .slice(0, 5);

  function addCafe(picked: Parameters<typeof emptyCafeFromPicked>[0], relation: FeaturedCafeRelation) {
    if (cafes.some((c) => c.placeId === picked.placeId)) return;
    setCafes((prev) => [...prev, emptyCafeFromPicked(picked, relation)]);
    setCafeQuery('');
    cafeAutocomplete.clear();
  }

  function pickPassportCafe(shop: typeof visitedShops[number]) {
    // Passport pick → no websiteUri (we never stored it client-side); the
    // user can re-pick via search if they want owner verification.
    addCafe(
      { placeId: shop.id, name: shop.name, address: shop.address, lat: shop.lat, lng: shop.lng, websiteUri: null },
      'favorite',
    );
  }

  function updateCafe(idx: number, patch: Partial<FeaturedCafeDraft>) {
    setCafes((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  function removeCafe(idx: number) {
    setCafes((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    // Strip blanks from each cafe's optional fields and snapshot the
    // payload before the fetch. Server collapses '' → NULL anyway but
    // doing it here keeps the wire smaller and keeps the user's local
    // state aligned with what gets persisted.
    const cleanCafes = cafes.map((c) => ({
      placeId: c.placeId,
      name: c.name,
      address: c.address,
      lat: c.lat,
      lng: c.lng,
      relation: c.relation,
      note: c.note.trim() || null,
      linkInstagram: c.linkInstagram.trim() || null,
      linkWebsite: c.linkWebsite.trim() || null,
      linkMenu: c.linkMenu.trim() || null,
      linkBookingExternal: c.linkBookingExternal.trim() || null,
      ownerPinnedNote: c.ownerPinnedNote.trim() || null,
      websiteUri: c.websiteUri,
      googleMapsUri: c.googleMapsUri,
    }));
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ featuredCafes: cleanCafes }),
      });
      if (!res.ok) {
        setStatus({ kind: 'err', message: t('account.profileContentSaveFailed') });
        return;
      }
      setSavedCafesKey(cafesKey(cafes));
      // Re-fetch so the verified flag reflects the server's decision
      // after this save. Cheap; one row per cafe and we cap at 5.
      try {
        const refresh = await fetch('/api/account');
        if (refresh.ok) {
          const data = (await refresh.json()) as {
            featuredCafes?: Array<{
              placeId: string; name: string; address: string; lat: number; lng: number;
              relation: FeaturedCafeRelation;
              note: string | null;
              linkInstagram: string | null; linkWebsite: string | null; linkMenu: string | null; linkBookingExternal: string | null;
              ownerPinnedNote: string | null;
              googleMapsUri: string | null;
              ownerVerified: boolean;
            }>;
          };
          if (data.featuredCafes && mountedRef.current) {
            setCafes(
              data.featuredCafes.map((c) => ({
                placeId: c.placeId, name: c.name, address: c.address, lat: c.lat, lng: c.lng,
                relation: c.relation,
                note: c.note ?? '',
                linkInstagram: c.linkInstagram ?? '',
                linkWebsite: c.linkWebsite ?? '',
                linkMenu: c.linkMenu ?? '',
                linkBookingExternal: c.linkBookingExternal ?? '',
                ownerPinnedNote: c.ownerPinnedNote ?? '',
                websiteUri: null,
                googleMapsUri: c.googleMapsUri,
                ownerVerified: c.ownerVerified,
              })),
            );
          }
        }
      } catch {
        /* non-fatal — local state already has the unverified default */
      }
      setStatus({ kind: 'ok', message: t('account.profileContentSaved') });
      refreshAccount();
      track('profile_cafes_set', {
        cafeCount: cleanCafes.length,
        ownedCount: cleanCafes.filter((c) => c.relation === 'owned').length,
      });
    } catch {
      setStatus({ kind: 'err', message: t('account.profileContentSaveFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="account-cafes" className={styles.card} aria-label={t('account.featuredCafeLabel')}>
      <h2 className={styles.cardTitle}>{t('account.featuredCafeLabel')}</h2>
      <p className={styles.usernameHint} style={{ marginTop: 0 }}>
        {t('account.featuredCafeHint')}
      </p>

      {/* Featured cafés — up to 5 Places, each with its own relation,
          note, links, and (for owned) pinned note. Render order follows
          the array; remove + re-add to reorder (drag is v2). On desktop
          the cards lay out in a 2-column grid so 5 entries fit in 3 rows
          instead of 5; below the breakpoint they stack as before. */}
      <div className={styles.fieldGroup}>
        {/* No empty grid box (and its gap) before the first café. */}
        {cafes.length > 0 ? (
        <div className={styles.featuredCafeGrid}>
        {cafes.map((cafe, idx) => (
          <div key={cafe.placeId} className={styles.featuredCafeCard}>
            <div className={styles.featuredCafeChosen}>
              <div className={styles.featuredCafeMeta}>
                <strong>
                  {cafe.name}
                  {cafe.relation === 'owned' && cafe.ownerVerified ? (
                    <span
                      className={styles.featuredCafeVerified}
                      title={t('account.featuredCafeVerifiedTitle')}
                      aria-label={t('account.featuredCafeVerifiedTitle')}
                    >
                      {' '}✓
                    </span>
                  ) : null}
                </strong>
                <span className={styles.featuredCafeAddress}>{cafe.address}</span>
              </div>
              <button
                type="button"
                className={styles.linkRemove}
                onClick={() => removeCafe(idx)}
                aria-label={t('account.featuredCafeRemoveAria')}
              >
                ×
              </button>
            </div>

            <div
              className={styles.featuredCafeRelation}
              role="radiogroup"
              aria-label={t('account.featuredCafeRelationLabel')}
              onKeyDown={(e) => {
                // WAI-ARIA radiogroup pattern: ←/↑ moves to previous,
                // →/↓ moves to next, wrap around. Without this, only
                // Tab works and the user can't switch relations with
                // the keyboard once a pill has focus.
                if (
                  e.key !== 'ArrowLeft' &&
                  e.key !== 'ArrowRight' &&
                  e.key !== 'ArrowUp' &&
                  e.key !== 'ArrowDown'
                ) {
                  return;
                }
                e.preventDefault();
                const next: FeaturedCafeRelation =
                  cafe.relation === 'favorite' ? 'owned' : 'favorite';
                updateCafe(idx, { relation: next });
                // Move focus onto the now-checked pill so SR reads the
                // new selection.
                const target = e.currentTarget.querySelector<HTMLButtonElement>(
                  `button[aria-checked="true"]`,
                );
                target?.focus();
              }}
            >
              <button
                type="button"
                role="radio"
                aria-checked={cafe.relation === 'favorite'}
                tabIndex={cafe.relation === 'favorite' ? 0 : -1}
                className={`${styles.featuredCafeRelationPill}${
                  cafe.relation === 'favorite'
                    ? ' ' + styles.featuredCafeRelationPillActive
                    : ''
                }`}
                onClick={() => updateCafe(idx, { relation: 'favorite' })}
              >
                <span className={styles.featuredCafeRelationPillTitle}>
                  <span aria-hidden>❤️</span>
                  {t('account.featuredCafeRelationFavoriteTitle')}
                </span>
                <span className={styles.featuredCafeRelationPillHint}>
                  {t('account.featuredCafeRelationFavoriteHint')}
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={cafe.relation === 'owned'}
                tabIndex={cafe.relation === 'owned' ? 0 : -1}
                className={`${styles.featuredCafeRelationPill}${
                  cafe.relation === 'owned'
                    ? ' ' + styles.featuredCafeRelationPillActive
                    : ''
                }`}
                onClick={() => updateCafe(idx, { relation: 'owned' })}
              >
                <span className={styles.featuredCafeRelationPillTitle}>
                  <span aria-hidden>🏠</span>
                  {t('account.featuredCafeRelationOwnedTitle')}
                </span>
                <span className={styles.featuredCafeRelationPillHint}>
                  {t('account.featuredCafeRelationOwnedHint')}
                </span>
              </button>
            </div>

            {/* Verification status hint on owned cards: explain why the
                badge is/isn't showing. Most useful for unverified owners
                so they know auto-verify is gated on email-domain match. */}
            {cafe.relation === 'owned' ? (
              <p
                className={styles.usernameHint}
                style={{ marginTop: 6, marginBottom: 0 }}
              >
                {cafe.ownerVerified
                  ? t('account.featuredCafeVerifiedHint')
                  : t('account.featuredCafeUnverifiedHint')}
              </p>
            ) : null}

            {/* "Why this café" — short blurb under the address. Same
                shape as bio. Empty stays empty. */}
            <label className={styles.fieldGroup} style={{ marginTop: 12 }}>
              <span className={styles.fieldLabel}>
                {t('account.featuredCafeNoteLabel')}
              </span>
              <textarea
                className={styles.bioTextarea}
                rows={2}
                maxLength={FEATURED_NOTE_MAX}
                placeholder={t('account.featuredCafeNotePlaceholder')}
                value={cafe.note}
                onChange={(e) => updateCafe(idx, { note: e.target.value })}
              />
              <span className={styles.charCount} aria-live="polite">
                {cafe.note.length} / {FEATURED_NOTE_MAX}
              </span>
            </label>

            {/* Owned-only "what's brewing" pinned note — shorter, framed
                as "this week's special" so owners are nudged to refresh
                rather than treating it as a static second blurb. */}
            {cafe.relation === 'owned' ? (
              <label className={styles.fieldGroup} style={{ marginTop: 8 }}>
                <span className={styles.fieldLabel}>
                  {t('account.featuredCafePinnedLabel')}
                </span>
                <input
                  type="text"
                  className={styles.linkLabelInput}
                  maxLength={FEATURED_PINNED_NOTE_MAX}
                  placeholder={t('account.featuredCafePinnedPlaceholder')}
                  value={cafe.ownerPinnedNote}
                  onChange={(e) => updateCafe(idx, { ownerPinnedNote: e.target.value })}
                />
                <span className={styles.charCount} aria-live="polite">
                  {cafe.ownerPinnedNote.length} / {FEATURED_PINNED_NOTE_MAX}
                </span>
              </label>
            ) : null}

            {/* 4 typed link slots — the public profile picks an icon per
                slot. Empty slots collapse on save. We don't validate
                live; server enforces http(s). */}
            <div className={styles.fieldGroup} style={{ marginTop: 8 }}>
              <span className={styles.fieldLabel}>{t('account.featuredCafeLinksLabel')}</span>
              {(
                [
                  ['linkInstagram', t('account.featuredCafeLinkInstagram')],
                  ['linkWebsite', t('account.featuredCafeLinkWebsite')],
                  ['linkMenu', t('account.featuredCafeLinkMenu')],
                  ['linkBookingExternal', t('account.featuredCafeLinkBooking')],
                ] as Array<[keyof FeaturedCafeDraft, string]>
              ).map(([field, label]) => (
                <div className={styles.linkRow} key={field}>
                  <span className={styles.linkLabelInput} style={{ pointerEvents: 'none' }}>
                    {label}
                  </span>
                  <input
                    type="url"
                    className={styles.linkUrlInput}
                    maxLength={FEATURED_LINK_MAX}
                    placeholder="https://…"
                    value={cafe[field] as string}
                    onChange={(e) => updateCafe(idx, { [field]: e.target.value } as Partial<FeaturedCafeDraft>)}
                    aria-label={label}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        </div>
        ) : null}

        {/* Add surface — only visible when we're under the cap. Mirrors
            the v1 single-card empty-state UI: passport quick-pick row +
            search input. Each pick pushes a new card with default
            relation='favorite'; the user flips to 'owned' on the new
            card if they want, which triggers verification on next save. */}
        {cafes.length < FEATURED_MAX ? (
          <>
            <p className={styles.usernameHint} style={{ marginTop: 12, marginBottom: 4 }}>
              {t('account.featuredCafeAddPrompt', {
                remaining: FEATURED_MAX - cafes.length,
              })}
            </p>
            {passportPicks.length > 0 ? (
              <div className={styles.featuredCafePassport}>
                <span className={styles.featuredCafePassportLabel}>
                  {t('account.featuredCafeFromPassport')}
                </span>
                <ul className={styles.featuredCafePassportList}>
                  {passportPicks.map((shop) => (
                    <li key={shop.id}>
                      <button
                        type="button"
                        className={styles.featuredCafePassportItem}
                        onClick={() => pickPassportCafe(shop)}
                      >
                        <span className={styles.featuredCafePassportItemName}>
                          {shop.name}
                        </span>
                        <span className={styles.featuredCafePassportItemMeta}>
                          {shop.city ?? shop.address}
                          {' · '}
                          {t('account.featuredCafeVisitCount', { count: shop.visits.length })}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className={styles.featuredCafeSearch}>
              <input
                type="text"
                className={styles.linkLabelInput}
                placeholder={t('account.featuredCafePlaceholder')}
                value={cafeQuery}
                onChange={(e) => {
                  setCafeQuery(e.target.value);
                  cafeAutocomplete.query(e.target.value);
                }}
                onBlur={() => {
                  window.setTimeout(() => cafeAutocomplete.clear(), 150);
                }}
                aria-label={t('account.featuredCafePlaceholder')}
                aria-autocomplete="list"
                aria-expanded={cafeAutocomplete.suggestions.length > 0}
              />
              {cafeAutocomplete.suggestions.length > 0 ? (
                <ul
                  className={styles.featuredCafeSuggestions}
                  role="listbox"
                  aria-label={t('account.featuredCafePlaceholder')}
                >
                  {cafeAutocomplete.suggestions.map((s, i) => {
                    const text = s.placePrediction?.text.text ?? '';
                    if (!text) return null;
                    return (
                      <li key={`${i}-${text}`} role="option" aria-selected={false}>
                        <button
                          type="button"
                          className={styles.featuredCafeSuggestion}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={async () => {
                            // Guard against double-click before the first
                            // pick() resolves: rapid taps would each fire
                            // addCafe and end up with the same place ID
                            // duplicated in `cafes` (the dedupe inside
                            // addCafe is best-effort against committed
                            // state, not in-flight work).
                            if (pickingRef.current) return;
                            pickingRef.current = true;
                            setIsPicking(true);
                            try {
                              const picked = await cafeAutocomplete.pick(s);
                              if (picked) addCafe(picked, 'favorite');
                            } finally {
                              pickingRef.current = false;
                              setIsPicking(false);
                            }
                          }}
                          disabled={isPicking}
                        >
                          {text}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          </>
        ) : (
          <p className={styles.usernameHint} style={{ marginTop: 12 }}>
            {t('account.featuredCafeAtMax', { max: FEATURED_MAX })}
          </p>
        )}
      </div>

      <div className={styles.formRow}>
        <button
          type="button"
          className={styles.saveButton}
          onClick={() => void handleSave()}
          disabled={busy || cafesKey(cafes) === savedCafesKey}
        >
          {busy ? t('account.saving') : t('account.profileContentSave')}
        </button>
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
