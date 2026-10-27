import { useApp } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import styles from './NearbyApproxBanner.module.css';

/** sessionStorage key written by AppHeroNearMe to record which path
 *  produced the position used for the current nearby search:
 *  'gps' = browser geolocation (precise), 'ip' = ipapi.co fallback
 *  (coarse — may be kilometres off). Read here to gate the banner. */
export const NEARBY_SRC_KEY = 'ACoffee-nearby-src';

/**
 * Visible only when the latest nearby search used the IP-based fallback,
 * which can be off by kilometres (it returns the user's ISP exit-node
 * location, not their device location). The earlier behaviour silently
 * substituted an inaccurate position when the browser couldn't get a fix
 * — users assumed they were seeing cafés near them when they weren't.
 *
 * Re-reads sessionStorage whenever searchMode flips to 'nearby' so a
 * second click (with a different outcome) updates the banner correctly.
 */
export function NearbyApproxBanner() {
  const { t } = useI18n();
  const { searchMode } = useApp();
  // Read during render rather than syncing into state from an effect:
  // sessionStorage is synchronous and cheap, and this also picks up a new
  // value from a second "near me" click while already in nearby mode.
  let source: string | null = null;
  if (searchMode === 'nearby') {
    try {
      source = sessionStorage.getItem(NEARBY_SRC_KEY);
    } catch {
      source = null;
    }
  }

  if (searchMode !== 'nearby' || source !== 'ip') return null;

  return (
    <div className={styles.banner} role="status">
      <span className={styles.icon} aria-hidden>📍</span>
      <span>{t('list.nearMeApproxBanner')}</span>
    </div>
  );
}
