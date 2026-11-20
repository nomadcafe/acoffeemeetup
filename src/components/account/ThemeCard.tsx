import { useEffect, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { buildLocalizedPathname } from '../../i18n/detectLocale';
import { track } from '../../utils/analytics';
import styles from '../AccountPage.module.css';
import { type StatusBanner, useAccountRefresh, useAutoDismissOk } from './shared';
import { THEME_PRESETS, type ThemePreset } from './themePresets';

interface ThemeCardProps {
  initialPreset: ThemePreset;
  /** For the live preview and the "open my page" link. */
  username: string | null;
  displayName: string | null;
  bio: string | null;
  image: string | null;
}

export function ThemeCard({ initialPreset, username, displayName, bio, image }: ThemeCardProps) {
  const refreshAccount = useAccountRefresh();
  const { t, locale } = useI18n();
  const [preset, setPreset] = useState<ThemePreset>(initialPreset);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusBanner>(null);
  useAutoDismissOk(status, setStatus);
  // Re-sync on parent session refetch — see ProfileVisibilityCard for why.
  useEffect(() => {
    if (!busy) setPreset(initialPreset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPreset]);

  async function handlePick(next: ThemePreset) {
    if (busy || next === preset) return;
    const prev = preset;
    setPreset(next);
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ themePreset: next }),
      });
      if (!res.ok) {
        setPreset(prev);
        setStatus({ kind: 'err', message: t('account.themeSaveFailed') });
        return;
      }
      setStatus({ kind: 'ok', message: t('account.themeSaved') });
      refreshAccount();
      track('profile_theme_set', { preset: next });
    } catch {
      setPreset(prev);
      setStatus({ kind: 'err', message: t('account.themeSaveFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="account-theme" className={styles.card} aria-label={t('account.themeTitle')}>
      <h2 className={styles.cardTitle}>{t('account.themeTitle')}</h2>
      <p className={styles.usernameHint} style={{ marginTop: 0 }}>
        {t('account.themeHint')}
      </p>
      <div className={styles.themeSwatchRow} role="radiogroup" aria-label={t('account.themeTitle')}>
        {THEME_PRESETS.map((p) => {
          const active = p.value === preset;
          return (
            <label key={p.value} className={styles.themeSwatchItem}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={t(`account.themePreset.${p.value}` as never)}
                className={`${styles.themeSwatch}${active ? ' ' + styles.themeSwatchActive : ''}`}
                // The swatch previews the theme's band, not just its accent.
                data-theme={p.value}
                onClick={() => void handlePick(p.value)}
                disabled={busy}
              />
              <span className={styles.themeSwatchName} aria-hidden>
                {t(`account.themePreset.${p.value}` as never)}
              </span>
            </label>
          );
        })}
      </div>
      {/* Live preview: a miniature of the public hero card rendered inside
          the selected theme, so the choice is visible before opening the
          page. */}
      <div className={styles.themePreview} data-theme={preset} aria-hidden>
        <div className={styles.themePreviewHero}>
          {image ? (
            <img className={styles.themePreviewAvatar} src={image} alt="" referrerPolicy="no-referrer" />
          ) : (
            <div className={styles.themePreviewAvatar}>
              {(displayName || username || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className={styles.themePreviewName}>
            {displayName || (username ? `@${username}` : t('account.themePreviewName'))}
          </div>
          <div className={styles.themePreviewBio}>{bio || t('account.themePreviewBio')}</div>
          <div className={styles.themePreviewActions}>
            <span className={styles.themePreviewButton}>{t('account.themePreviewBook')}</span>
            <span className={styles.themePreviewChip}>☕ 12</span>
          </div>
        </div>
      </div>
      {username ? (
        <a
          className={styles.themePreviewLink}
          href={buildLocalizedPathname(`/${username}`, locale)}
          target="_blank"
          rel="noopener"
        >
          {t('account.themeOpenProfile')} ↗
        </a>
      ) : null}

      {status ? (
        <p
          className={status.kind === 'ok' ? styles.successMsg : styles.errorMsg}
          role="status"
          style={{ marginTop: 'var(--ac-space-3)' }}
        >
          {status.message}
        </p>
      ) : null}
    </section>
  );
}
