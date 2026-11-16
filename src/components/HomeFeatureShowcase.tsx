import { useI18n } from '../context/I18nContext';
import styles from './HomeFeatureShowcase.module.css';

/**
 * Anonymous home hero. Single centred block: eyebrow + H1 + lead, on the
 * same axis as the search form below it. Under the 2026-05 utility pivot the page no longer markets
 * adjacent product surfaces (the 5-card secondary grid was removed
 * first) and no longer recruits visitors into the paused Pro tier
 * (the "claim acoffee.com/yourname" CTA was the most recent removal).
 *
 * AppHero decides when this shows (anonymous, pre-search) — including the
 * optimistic render while the session request is in flight. Don't gate on
 * the session again here: a second wait re-introduces the late insert that
 * pushed the form down on every load.
 */
export function HomeFeatureShowcase() {
  const { t } = useI18n();

  return (
    <section className={styles.wrap} aria-labelledby="showcase-title">
      <div className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>
            {t('showcase.eyebrowFree')} ·{' '}
            <a
              className={styles.eyebrowLink}
              href="https://github.com/nomadcafe/acoffeemeetup"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('showcase.eyebrowOpenSource')}
            </a>
          </span>
          <h1 id="showcase-title" className={styles.title}>
            {t('showcase.title')}
          </h1>
          <p className={styles.lead}>{t('showcase.lead')}</p>
        </div>
      </div>
    </section>
  );
}
