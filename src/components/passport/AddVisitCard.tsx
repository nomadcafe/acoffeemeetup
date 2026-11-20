import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../context/I18nContext';
import { useCafeAutocomplete, type PickedCafe } from '../../hooks/useCafeAutocomplete';
import styles from '../PassportPage.module.css';

/** YYYY-MM-DD for a Date in the viewer's local time zone. */
function localDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Stamp a café straight from the passport page — search for it, pick the
 * day you went (today by default, or any past day), done. Before this the
 * only way to log a visit was the ☕ button on a search result, stamped
 * "now", so "the place I went yesterday" couldn't be recorded at all.
 */
export function AddVisitCard({ onAdded }: { onAdded?: (placeId: string) => void }) {
  const { t, locale } = useI18n();
  const { addVisitAt } = useApp();
  const autocomplete = useCafeAutocomplete(locale === 'zh' ? 'zh-CN' : locale);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<PickedCafe | null>(null);
  const [picking, setPicking] = useState(false);
  const today = localDateKey(new Date());
  const [day, setDay] = useState(today);
  const [done, setDone] = useState<string | null>(null);

  function submit() {
    if (!picked || !day || day > today) return;
    // Today → the actual time, so it sorts as the latest stamp. A past day
    // has no real time-of-day, so use local noon (clear of any midnight /
    // DST edge that could shift it onto the neighbouring date).
    const [y, m, d] = day.split('-').map(Number);
    const ts = day === today ? Date.now() : new Date(y, m - 1, d, 12, 0, 0).getTime();
    addVisitAt(
      {
        id: picked.placeId,
        name: picked.name,
        address: picked.address,
        lat: picked.lat,
        lng: picked.lng,
        googleMapsUri: picked.googleMapsUri,
      },
      ts,
    );
    setDone(picked.name);
    onAdded?.(picked.placeId);
    setPicked(null);
    setQuery('');
    setDay(today);
  }

  return (
    <section className={styles.addCard} aria-labelledby="add-visit-title">
      <h2 id="add-visit-title" className={styles.sectionTitle}>
        {t('passport.addTitle')}
      </h2>
      <div className={styles.addRow}>
        <div className={styles.addSearch}>
          {picked ? (
            <div className={styles.addPicked}>
              <span className={styles.addPickedName}>{picked.name}</span>
              <button
                type="button"
                className={styles.addChange}
                onClick={() => setPicked(null)}
              >
                {t('passport.addChange')}
              </button>
            </div>
          ) : (
            <>
              <input
                type="search"
                className={`${styles.searchInput} ${styles.addInput}`}
                value={query}
                placeholder={t('passport.addSearchPlaceholder')}
                aria-label={t('passport.addSearchPlaceholder')}
                aria-autocomplete="list"
                aria-expanded={autocomplete.suggestions.length > 0}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setDone(null);
                  autocomplete.query(e.target.value);
                }}
                onBlur={() => window.setTimeout(() => autocomplete.clear(), 150)}
              />
              {autocomplete.suggestions.length > 0 ? (
                <ul className={styles.addSuggestions} role="listbox">
                  {autocomplete.suggestions.map((s, i) => {
                    const text = s.placePrediction?.text.text ?? '';
                    if (!text) return null;
                    return (
                      <li key={`${i}-${text}`} role="option" aria-selected={false}>
                        <button
                          type="button"
                          className={styles.addSuggestion}
                          disabled={picking}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={async () => {
                            setPicking(true);
                            try {
                              const result = await autocomplete.pick(s);
                              if (result) setPicked(result);
                            } finally {
                              setPicking(false);
                            }
                          }}
                        >
                          {text}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </>
          )}
        </div>
        <label className={styles.addDateLabel}>
          <span className={styles.visuallyHidden}>{t('passport.addDateLabel')}</span>
          <input
            type="date"
            className={styles.addDate}
            value={day}
            max={today}
            onChange={(e) => setDay(e.target.value)}
            aria-label={t('passport.addDateLabel')}
          />
        </label>
        <button
          type="button"
          className={styles.shareButton}
          onClick={submit}
          disabled={!picked || !day || day > today}
        >
          {t('passport.addSubmit')}
        </button>
      </div>
      {done ? (
        <p className={styles.shareInfo} role="status">
          {t('passport.addDone', { name: done })}
        </p>
      ) : null}
    </section>
  );
}
