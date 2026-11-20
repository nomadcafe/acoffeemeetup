import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../context/I18nContext';
import { track } from '../../utils/analytics';
import { useCafeAutocomplete } from '../../hooks/useCafeAutocomplete';
import styles from '../AccountPage.module.css';
import { type StatusBanner, useAccountRefresh, useAutoDismissOk, useReportDirty } from './shared';
import { FeaturedCafeItem } from './FeaturedCafeItem';
import {
  type ApiFeaturedCafe,
  cafeFromApi,
  cafesKey,
  emptyCafeFromPicked,
  FEATURED_MAX,
  type FeaturedCafeDraft,
  type FeaturedCafeRelation,
} from './featuredCafes';

export function FeaturedCafesCard() {
  const refreshAccount = useAccountRefresh();
  const { t, locale } = useI18n();
  const { visitedShops } = useApp();
  const [cafes, setCafes] = useState<FeaturedCafeDraft[]>([]);
  // Snapshot of what's saved server-side (set on load and after each save).
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
        const data = (await res.json()) as { featuredCafes?: ApiFeaturedCafe[] };
        if (cancelled || !data.featuredCafes) return;
        const loaded = data.featuredCafes.map(cafeFromApi);
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
          const data = (await refresh.json()) as { featuredCafes?: ApiFeaturedCafe[] };
          if (data.featuredCafes && mountedRef.current) {
            setCafes(data.featuredCafes.map(cafeFromApi));
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
          <FeaturedCafeItem
            key={cafe.placeId}
            cafe={cafe}
            onChange={(patch) => updateCafe(idx, patch)}
            onRemove={() => removeCafe(idx)}
          />
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
