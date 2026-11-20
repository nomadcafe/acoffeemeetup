import { useEffect, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { track } from '../../utils/analytics';
import styles from '../AccountPage.module.css';
import { useAccountRefresh } from './shared';

interface VisibilityProps {
  hasUsername: boolean;
  username: string | null;
  initial: boolean;
}

export function ProfileVisibilityCard({ hasUsername, username, initial }: VisibilityProps) {
  const refreshAccount = useAccountRefresh();
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Re-sync from prop when the parent re-fetches the session (e.g. after a
   * username save). Without this, a server-side change made elsewhere
   * — including the user's own edits in another tab — would be invisible
   * here, and the next save would PATCH stale state back over the new
   * server value. Skipped while a save is in flight so the optimistic
   * flip isn't immediately reverted by a stale prop. */
  useEffect(() => {
    if (!busy) setEnabled(initial);
    // We intentionally only react to `initial` changes — not `busy` — so a
    // mid-flight optimistic flip doesn't trigger an extra re-sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const canToggle = hasUsername && !busy;

  async function handleToggle() {
    if (!canToggle) return;
    const next = !enabled;
    setEnabled(next); // optimistic — flip back on failure
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profilePublic: next }),
      });
      if (!res.ok) {
        setEnabled(!next);
        setError(t('account.profileSaveFailed'));
      } else {
        track('profile_visibility_set', { public: next });
        refreshAccount();
      }
    } catch {
      setEnabled(!next);
      setError(t('account.profileSaveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="account-visibility" className={styles.card} aria-label={t('account.profileTitle')}>
      <h2 className={styles.cardTitle}>{t('account.profileTitle')}</h2>
      <div className={styles.toggleRow}>
        <label className={styles.toggleLabel} htmlFor="profile-visibility-toggle">
          {t('account.profileToggleLabel')}
          <span className={styles.toggleSubLabel}>
            {hasUsername
              ? enabled
                ? t('account.profilePublicHint', { username: username ?? '' })
                : t('account.profilePrivateHint')
              : t('account.profileNeedsUsername')}
          </span>
        </label>
        <button
          type="button"
          id="profile-visibility-toggle"
          className={`${styles.toggle}${enabled ? ' ' + styles.toggleOn : ''}`}
          role="switch"
          aria-checked={enabled}
          aria-label={t('account.profileToggleAria')}
          disabled={!canToggle}
          onClick={() => void handleToggle()}
        />
      </div>
      {error ? <p className={styles.errorMsg} role="alert">{error}</p> : null}
    </section>
  );
}
