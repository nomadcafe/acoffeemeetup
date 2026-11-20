import { useEffect, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { track } from '../../utils/analytics';
import styles from '../AccountPage.module.css';
import { type StatusBanner, useAccountRefresh, useAutoDismissOk } from './shared';
import { THEME_PRESETS, type ThemePreset } from './themePresets';

export function ThemeCard({ initialPreset }: { initialPreset: ThemePreset }) {
  const refreshAccount = useAccountRefresh();
  const { t } = useI18n();
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
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={t(`account.themePreset.${p.value}` as never)}
              className={`${styles.themeSwatch}${active ? ' ' + styles.themeSwatchActive : ''}`}
              style={{ ['--swatch-color' as string]: p.color }}
              onClick={() => void handlePick(p.value)}
              disabled={busy}
            />
          );
        })}
      </div>
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
