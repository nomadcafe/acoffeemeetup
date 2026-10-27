import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { examplePairsByLocale } from '../i18n/examples';
import { useSession } from '../utils/authClient';
import { AppHeroNearMe } from './AppHeroNearMe';
import { HeroSignedIn } from './HeroSignedIn';
import { HomeFeatureShowcase } from './HomeFeatureShowcase';
import styles from './AppHero.module.css';

/**
 * Pre-search hero between the header and the form: the showcase headline
 * for visitors, the welcome strip for signed-in users. Once the user has
 * searched (midpoint exists) we get out of the way so the map + results
 * can breathe. Quick starts (sample searches, near me) render separately
 * below the form — see HeroQuickStarts.
 */
export function AppHero() {
  const { midpoint, isLoading } = useApp();
  const { data: session, isPending: sessionPending } = useSession();

  // Hide the hero as soon as any search is in flight, not just on
  // midpoint — otherwise on mobile the hero briefly remains stacked above
  // the map+sheet layout while geocoding runs.
  if (midpoint || isLoading) return null;

  // Wait for session resolution so anonymous visitors don't briefly
  // see the showcase, then watch it disappear when the session lands.
  if (sessionPending) return null;
  const isSignedIn = !!session?.user;

  return (
    <section className={styles.hero}>
      <div className={styles.inner}>
        {/* Anonymous = marketing headline. Signed-in = personal-state
            strip (streak, last visit, stats) for users who already know
            the product and want "where you left off". The H1 of the page
            lives inside HomeFeatureShowcase for crawlers; HeroSignedIn
            isn't an H1, just a welcome card. */}
        {isSignedIn ? <HeroSignedIn /> : <HomeFeatureShowcase />}
      </div>
    </section>
  );
}

/**
 * Secondary ways to start, shown under the search form before the first
 * search: one-tap sample pairs (first run only) and "near me". Kept as a
 * quiet line of text-style buttons so the form stays the one obvious
 * action on the page.
 */
export function HeroQuickStarts() {
  const { t, locale } = useI18n();
  const { midpoint, searchWithAddresses, setAgentMode, isLoading, recentSearches } = useApp();

  if (midpoint || isLoading) return null;

  // First-run only: returning users see their own recents in the form.
  const samples = recentSearches.length === 0 ? examplePairsByLocale[locale] : [];

  return (
    <div className={styles.quickStarts}>
      {samples.length > 0 ? (
        <div className={styles.samples} aria-label={t('hero.samplesLabel')}>
          <span className={styles.samplesTitle}>{t('hero.samplesTitle')}</span>
          {samples.map((pair) => (
            <button
              key={`${pair.a}|${pair.b}`}
              type="button"
              className={styles.sampleChip}
              onClick={() => {
                /* Apply the suggested agent mode BEFORE firing the
                 * search so the first results the user sees are
                 * already mode-flavored. */
                if (pair.mode) setAgentMode(pair.mode);
                void searchWithAddresses(pair.a, pair.b);
              }}
              disabled={isLoading}
            >
              <span className={styles.sampleA}>{shortPlace(pair.a)}</span>
              <span className={styles.sampleArrow} aria-hidden>
                ↔
              </span>
              <span className={styles.sampleB}>{shortPlace(pair.b)}</span>
            </button>
          ))}
        </div>
      ) : null}

      <AppHeroNearMe />
    </div>
  );
}

/** "Times Square, New York" → "Times Square": the city is implied by the
 *  pair and only makes the chips wrap. The full address is still what
 *  gets searched. */
function shortPlace(address: string): string {
  return address.split(/[,，、]/)[0].trim();
}
