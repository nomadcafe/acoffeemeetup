import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import styles from './ReportProfile.module.css';

const REASONS = ['spam', 'inappropriate', 'impersonation', 'other'] as const;
type Reason = (typeof REASONS)[number];

type Phase = 'idle' | 'sending' | 'sent' | 'error';

/**
 * Low-key "Report this page" link at the foot of a public profile, opening
 * a small dialog: pick a reason, optionally add details, send. The report
 * goes to the admin inbox with a one-click take-down link (see
 * /api/profile/<username>/report).
 */
export function ReportProfile({ username }: { username: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Focus into the dialog on open, Esc closes, focus returns to the link.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>('input, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'sending') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, phase]);

  function close() {
    setOpen(false);
    setReason(null);
    setDetails('');
    setPhase('idle');
    setErrorMsg(null);
    triggerRef.current?.focus();
  }

  async function submit() {
    if (!reason || phase === 'sending') return;
    setPhase('sending');
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/profile/${encodeURIComponent(username)}/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason, details: details.trim() || undefined }),
      });
      if (!res.ok) {
        setPhase('error');
        setErrorMsg(t(res.status === 429 ? 'report.rateLimited' : 'report.failed'));
        return;
      }
      setPhase('sent');
    } catch {
      setPhase('error');
      setErrorMsg(t('report.failed'));
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
      >
        {t('report.trigger')}
      </button>
      {open ? (
        <div
          className={styles.overlay}
          onClick={(e) => {
            if (e.target === e.currentTarget && phase !== 'sending') close();
          }}
        >
          <div
            ref={dialogRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
          >
            <h2 id="report-title" className={styles.title}>
              {t('report.title', { username })}
            </h2>
            {phase === 'sent' ? (
              <>
                <p className={styles.body}>{t('report.thanks')}</p>
                <div className={styles.actions}>
                  <button type="button" className={styles.primary} onClick={close}>
                    {t('report.close')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className={styles.body}>{t('report.lead')}</p>
                <fieldset className={styles.reasons}>
                  <legend className={styles.legend}>{t('report.reasonLabel')}</legend>
                  {REASONS.map((r) => (
                    <label key={r} className={styles.reason}>
                      <input
                        type="radio"
                        name="report-reason"
                        value={r}
                        checked={reason === r}
                        onChange={() => setReason(r)}
                        disabled={phase === 'sending'}
                      />
                      <span>{t(`report.reason.${r}`)}</span>
                    </label>
                  ))}
                </fieldset>
                <label className={styles.detailsLabel}>
                  <span>{t('report.detailsLabel')}</span>
                  <textarea
                    className={styles.details}
                    rows={3}
                    maxLength={500}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder={t('report.detailsPlaceholder')}
                    disabled={phase === 'sending'}
                  />
                </label>
                {errorMsg ? (
                  <p className={styles.error} role="alert">
                    {errorMsg}
                  </p>
                ) : null}
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={close}
                    disabled={phase === 'sending'}
                  >
                    {t('report.cancel')}
                  </button>
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => void submit()}
                    disabled={!reason || phase === 'sending'}
                  >
                    {phase === 'sending' ? t('report.sending') : t('report.submit')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
