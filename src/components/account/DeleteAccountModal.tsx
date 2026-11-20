import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { track } from '../../utils/analytics';
import styles from '../AccountPage.module.css';

const DELETE_CONFIRM_PHRASE = 'DELETE';

interface DeleteModalProps {
  onClose: () => void;
  onConfirmed: () => void;
}

export function DeleteAccountModal({ onClose, onConfirmed }: DeleteModalProps) {
  const { t } = useI18n();
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus management: focus the input on mount; cycle Tab inside the
  // dialog (don't let it escape to underlying page buttons — that
  // would let the user activate "Delete account again" via the Tab
  // key while the modal claims to be modal); allow Escape to close.
  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  async function handleDelete() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account', { method: 'DELETE' });
      if (!res.ok) {
        setError(t('account.deleteFailed'));
        setBusy(false);
        return;
      }
      track('account_deleted');
      onConfirmed();
    } catch {
      setError(t('account.deleteFailed'));
      setBusy(false);
    }
  }

  const armed = phrase.trim().toUpperCase() === DELETE_CONFIRM_PHRASE && !busy;

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      onClick={(e) => {
        // Backdrop click closes only when the user hasn't started arming
        // the dialog. Once they've typed even a single character of the
        // confirm phrase, a stray tap on the dim area shouldn't drop the
        // dialog and lose their typing — they have to use Cancel/Escape.
        if (e.target === e.currentTarget && !busy && phrase.length === 0) {
          onClose();
        }
      }}
    >
      <div ref={dialogRef} className={styles.modalDialog}>
        <h3 id="delete-modal-title" className={styles.modalTitle}>
          {t('account.deleteConfirmTitle')}
        </h3>
        <p className={styles.modalBody}>
          {t('account.deleteConfirmBody', { phrase: DELETE_CONFIRM_PHRASE })}
        </p>
        <input
          ref={inputRef}
          className={styles.modalInput}
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={DELETE_CONFIRM_PHRASE}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
          aria-label={t('account.deleteConfirmInputAria', { phrase: DELETE_CONFIRM_PHRASE })}
        />
        {error ? <p className={styles.errorMsg} role="alert">{error}</p> : null}
        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.modalCancel}
            onClick={onClose}
            disabled={busy}
          >
            {t('account.deleteCancel')}
          </button>
          <button
            type="button"
            className={styles.modalConfirmDanger}
            onClick={() => void handleDelete()}
            disabled={!armed}
          >
            {busy ? t('account.deleting') : t('account.deleteConfirmCta')}
          </button>
        </div>
      </div>
    </div>
  );
}
