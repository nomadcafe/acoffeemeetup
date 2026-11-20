import { useI18n } from '../../context/I18nContext';
import styles from '../AccountPage.module.css';
import {
  FEATURED_LINK_MAX,
  FEATURED_NOTE_MAX,
  FEATURED_PINNED_NOTE_MAX,
  type FeaturedCafeDraft,
  type FeaturedCafeRelation,
} from './featuredCafes';

/** Editor for one featured café: relation, note, pinned note, links. */
export function FeaturedCafeItem({
  cafe,
  onChange,
  onRemove,
}: {
  cafe: FeaturedCafeDraft;
  onChange: (patch: Partial<FeaturedCafeDraft>) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className={styles.featuredCafeCard}>
      <div className={styles.featuredCafeChosen}>
        <div className={styles.featuredCafeMeta}>
          <strong>
            {cafe.name}
            {cafe.relation === 'owned' && cafe.ownerVerified ? (
              <span
                className={styles.featuredCafeVerified}
                title={t('account.featuredCafeVerifiedTitle')}
                aria-label={t('account.featuredCafeVerifiedTitle')}
              >
                {' '}✓
              </span>
            ) : null}
          </strong>
          <span className={styles.featuredCafeAddress}>{cafe.address}</span>
        </div>
        <button
          type="button"
          className={styles.linkRemove}
          onClick={() => onRemove()}
          aria-label={t('account.featuredCafeRemoveAria')}
        >
          ×
        </button>
      </div>

      <div
        className={styles.featuredCafeRelation}
        role="radiogroup"
        aria-label={t('account.featuredCafeRelationLabel')}
        onKeyDown={(e) => {
          // WAI-ARIA radiogroup pattern: ←/↑ moves to previous,
          // →/↓ moves to next, wrap around. Without this, only
          // Tab works and the user can't switch relations with
          // the keyboard once a pill has focus.
          if (
            e.key !== 'ArrowLeft' &&
            e.key !== 'ArrowRight' &&
            e.key !== 'ArrowUp' &&
            e.key !== 'ArrowDown'
          ) {
            return;
          }
          e.preventDefault();
          const next: FeaturedCafeRelation =
            cafe.relation === 'favorite' ? 'owned' : 'favorite';
          onChange({ relation: next });
          // Move focus onto the now-checked pill so SR reads the
          // new selection.
          const target = e.currentTarget.querySelector<HTMLButtonElement>(
            `button[aria-checked="true"]`,
          );
          target?.focus();
        }}
      >
        <button
          type="button"
          role="radio"
          aria-checked={cafe.relation === 'favorite'}
          tabIndex={cafe.relation === 'favorite' ? 0 : -1}
          className={`${styles.featuredCafeRelationPill}${
            cafe.relation === 'favorite'
              ? ' ' + styles.featuredCafeRelationPillActive
              : ''
          }`}
          onClick={() => onChange({ relation: 'favorite' })}
        >
          <span className={styles.featuredCafeRelationPillTitle}>
            <span aria-hidden>❤️</span>
            {t('account.featuredCafeRelationFavoriteTitle')}
          </span>
          <span className={styles.featuredCafeRelationPillHint}>
            {t('account.featuredCafeRelationFavoriteHint')}
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={cafe.relation === 'owned'}
          tabIndex={cafe.relation === 'owned' ? 0 : -1}
          className={`${styles.featuredCafeRelationPill}${
            cafe.relation === 'owned'
              ? ' ' + styles.featuredCafeRelationPillActive
              : ''
          }`}
          onClick={() => onChange({ relation: 'owned' })}
        >
          <span className={styles.featuredCafeRelationPillTitle}>
            <span aria-hidden>🏠</span>
            {t('account.featuredCafeRelationOwnedTitle')}
          </span>
          <span className={styles.featuredCafeRelationPillHint}>
            {t('account.featuredCafeRelationOwnedHint')}
          </span>
        </button>
      </div>

      {/* Verification status hint on owned cards: explain why the
          badge is/isn't showing. Most useful for unverified owners
          so they know auto-verify is gated on email-domain match. */}
      {cafe.relation === 'owned' ? (
        <p
          className={styles.usernameHint}
          style={{ marginTop: 6, marginBottom: 0 }}
        >
          {cafe.ownerVerified
            ? t('account.featuredCafeVerifiedHint')
            : t('account.featuredCafeUnverifiedHint')}
        </p>
      ) : null}

      {/* "Why this café" — short blurb under the address. Same
          shape as bio. Empty stays empty. */}
      <label className={styles.fieldGroup} style={{ marginTop: 12 }}>
        <span className={styles.fieldLabel}>
          {t('account.featuredCafeNoteLabel')}
        </span>
        <textarea
          className={styles.bioTextarea}
          rows={2}
          maxLength={FEATURED_NOTE_MAX}
          placeholder={t('account.featuredCafeNotePlaceholder')}
          value={cafe.note}
          onChange={(e) => onChange({ note: e.target.value })}
        />
        <span className={styles.charCount} aria-live="polite">
          {cafe.note.length} / {FEATURED_NOTE_MAX}
        </span>
      </label>

      {/* Owned-only "what's brewing" pinned note — shorter, framed
          as "this week's special" so owners are nudged to refresh
          rather than treating it as a static second blurb. */}
      {cafe.relation === 'owned' ? (
        <label className={styles.fieldGroup} style={{ marginTop: 8 }}>
          <span className={styles.fieldLabel}>
            {t('account.featuredCafePinnedLabel')}
          </span>
          <input
            type="text"
            className={styles.linkLabelInput}
            maxLength={FEATURED_PINNED_NOTE_MAX}
            placeholder={t('account.featuredCafePinnedPlaceholder')}
            value={cafe.ownerPinnedNote}
            onChange={(e) => onChange({ ownerPinnedNote: e.target.value })}
          />
          <span className={styles.charCount} aria-live="polite">
            {cafe.ownerPinnedNote.length} / {FEATURED_PINNED_NOTE_MAX}
          </span>
        </label>
      ) : null}

      {/* 4 typed link slots — the public profile picks an icon per
          slot. Empty slots collapse on save. We don't validate
          live; server enforces http(s). */}
      <div className={styles.fieldGroup} style={{ marginTop: 8 }}>
        <span className={styles.fieldLabel}>{t('account.featuredCafeLinksLabel')}</span>
        {(
          [
            ['linkInstagram', t('account.featuredCafeLinkInstagram')],
            ['linkWebsite', t('account.featuredCafeLinkWebsite')],
            ['linkMenu', t('account.featuredCafeLinkMenu')],
            ['linkBookingExternal', t('account.featuredCafeLinkBooking')],
          ] as Array<[keyof FeaturedCafeDraft, string]>
        ).map(([field, label]) => (
          <div className={styles.linkRow} key={field}>
            <span className={styles.linkLabelInput} style={{ pointerEvents: 'none' }}>
              {label}
            </span>
            <input
              type="url"
              className={styles.linkUrlInput}
              maxLength={FEATURED_LINK_MAX}
              placeholder="https://…"
              value={cafe[field] as string}
              onChange={(e) => onChange({ [field]: e.target.value } as Partial<FeaturedCafeDraft>)}
              aria-label={label}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
