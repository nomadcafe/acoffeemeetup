import { useI18n } from '../context/I18nContext';
import { useSession } from '../utils/authClient';
import styles from './HomeFeatureShowcase.module.css';

/**
 * Anonymous home hero. Single centred block: eyebrow + H1 + lead, on the
 * same axis as the search form below it. Under the 2026-05 utility pivot the page no longer markets
 * adjacent product surfaces (the 5-card secondary grid was removed
 * first) and no longer recruits visitors into the paused Pro tier
 * (the "claim acoffee.com/yourname" CTA was the most recent removal).
 *
 * Hidden for signed-in users (their return visit is tool-first), and
 * naturally hidden during search since AppHero self-hides then.
 */
export function HomeFeatureShowcase() {
  const { t } = useI18n();
  const { data: session, isPending } = useSession();

  if (isPending) return null;
  if (session?.user) return null;

  return (
    <section className={styles.wrap} aria-labelledby="showcase-title">
      <div className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>
            {t('showcase.eyebrowFree')} ·{' '}
            <a
              className={styles.eyebrowLink}
              href="https://github.com/nomadcafe/acoffeecom"
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
