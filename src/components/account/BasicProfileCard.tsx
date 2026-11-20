import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { track } from '../../utils/analytics';
import styles from '../AccountPage.module.css';
import {
  type StatusBanner,
  useAccountRefresh,
  useAutoDismissOk,
  useReportDirty,
  useSavedSnapshot,
} from './shared';

/* The Profile content section is split into three discrete cards
 * (Basic / Social links / Featured cafés) so each has its own scroll
 * anchor, save button, and error surface. Server-side /api/account PATCH
 * accepts each field independently, so the split is purely a client
 * concern — no API change needed. */
interface BasicProfileProps {
  initialDisplayName: string;
  initialBio: string;
}

const DISPLAY_NAME_MAX = 50;

const BIO_MAX = 160;

/**
 * Bio-link editor: display name + one-line bio + up to 5 social links. All
 * three fields are PATCHed together on Save so the form has one obvious
 * commit moment instead of save-on-every-blur churn (a half-typed URL
 * shouldn't be persisted as the user navigates between rows).
 */
export function BasicProfileCard({ initialDisplayName, initialBio }: BasicProfileProps) {
  const refreshAccount = useAccountRefresh();
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusBanner>(null);
  useAutoDismissOk(status, setStatus);
  /* Re-sync on parent session refetch — same reason as the toggle cards.
   * For typeable inputs we must NOT clobber an in-progress edit, so we
   * track the last prop value we saw and only sync if (a) no save is in
   * flight and (b) the local value still matches what we last synced
   * from props. If the user has typed since we synced, lastSynced !==
   * current, so we skip the update and preserve their draft. */
  const basicKey = (d: string, b: string) => JSON.stringify([d.trim(), b.trim()]);
  const [savedBasic, markBasicSaved] = useSavedSnapshot(basicKey(initialDisplayName, initialBio));
  useReportDirty('account-basic', basicKey(displayName, bio) !== savedBasic);
  const lastSyncedDisplay = useRef(initialDisplayName);
  const lastSyncedBio = useRef(initialBio);
  useEffect(() => {
    if (busy) return;
    if (initialDisplayName !== lastSyncedDisplay.current && displayName === lastSyncedDisplay.current) {
      setDisplayName(initialDisplayName);
    }
    lastSyncedDisplay.current = initialDisplayName;
    if (initialBio !== lastSyncedBio.current && bio === lastSyncedBio.current) {
      setBio(initialBio);
    }
    lastSyncedBio.current = initialBio;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDisplayName, initialBio, busy]);

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() ? displayName.trim() : null,
          bio: bio.trim() ? bio.trim() : null,
        }),
      });
      if (!res.ok) {
        setStatus({ kind: 'err', message: t('account.profileContentSaveFailed') });
        return;
      }
      markBasicSaved(basicKey(displayName, bio));
      setStatus({ kind: 'ok', message: t('account.profileContentSaved') });
      refreshAccount();
      track('profile_basic_set', { hasName: !!displayName.trim(), hasBio: !!bio.trim() });
    } catch {
      setStatus({ kind: 'err', message: t('account.profileContentSaveFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="account-basic" className={styles.card} aria-label={t('account.basicInfoTitle')}>
      <h2 className={styles.cardTitle}>{t('account.basicInfoTitle')}</h2>
      <p className={styles.usernameHint} style={{ marginTop: 0 }}>
        {t('account.basicInfoHint')}
      </p>

      <label className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>{t('account.displayNameLabel')}</span>
        <input
          type="text"
          className={styles.usernameInput}
          maxLength={DISPLAY_NAME_MAX}
          placeholder={t('account.displayNamePlaceholder')}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <span className={styles.charCount} aria-live="polite">
          {displayName.length} / {DISPLAY_NAME_MAX}
        </span>
      </label>

      <label className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>{t('account.bioLabel')}</span>
        <textarea
          className={styles.bioTextarea}
          maxLength={BIO_MAX}
          rows={3}
          placeholder={t('account.bioPlaceholder')}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
        <span className={styles.charCount} aria-live="polite">
          {bio.length} / {BIO_MAX}
        </span>
      </label>

      <div className={styles.formRow}>
        <button
          type="button"
          className={styles.saveButton}
          onClick={() => void handleSave()}
          disabled={busy}
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
