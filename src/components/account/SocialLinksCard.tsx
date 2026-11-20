import { useEffect, useRef, useState } from 'react';
import {
  getPlatform,
  parseSocialHandle,
  SOCIAL_LINKS_MAX,
  SOCIAL_PLATFORMS,
  type SocialPlatformId,
} from '../../utils/socialPlatforms';
import { useI18n } from '../../context/I18nContext';
import { track } from '../../utils/analytics';
import styles from '../AccountPage.module.css';
import { type SocialLinkDraft } from './socialLinksDraft';
import {
  freshKey,
  type StatusBanner,
  useAccountRefresh,
  useAutoDismissOk,
  useReportDirty,
  useSavedSnapshot,
} from './shared';

interface SocialLinksProps {
  initialSocialLinks: SocialLinkDraft[];
  initialShowSocialLinks: boolean;
}

const LINKS_MAX = SOCIAL_LINKS_MAX;

const LINK_HANDLE_MAX = 300;

export function SocialLinksCard({ initialSocialLinks, initialShowSocialLinks }: SocialLinksProps) {
  const refreshAccount = useAccountRefresh();
  const { t } = useI18n();
  const [links, setLinks] = useState<SocialLinkDraft[]>(initialSocialLinks);
  const [showLinks, setShowLinks] = useState(initialShowSocialLinks);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusBanner>(null);
  useAutoDismissOk(status, setStatus);
  /* Re-sync on parent session refetch — see BasicProfileCard for the
   * pattern. Comparing arrays of {label,url} objects with === would
   * always fail (the parent re-parses on every render), so we serialize
   * the meaningful fields. _key is internal-only and intentionally
   * excluded from the comparison. */
  const linksKey = (arr: SocialLinkDraft[]) =>
    JSON.stringify(arr.map((l) => [l.platform, l.handle]));
  const savedLinksKey = (arr: SocialLinkDraft[]) =>
    JSON.stringify(
      arr
        .filter((l) => l.handle.trim() !== '')
        .map((l) => [l.platform, parseSocialHandle(l.platform, l.handle) ?? l.handle.trim()]),
    );
  const socialKey = (arr: SocialLinkDraft[], show: boolean) =>
    JSON.stringify([savedLinksKey(arr), show]);
  const [savedSocial, markSocialSaved] = useSavedSnapshot(
    socialKey(initialSocialLinks, initialShowSocialLinks),
  );
  useReportDirty('account-social', socialKey(links, showLinks) !== savedSocial);
  const lastSyncedLinks = useRef(linksKey(initialSocialLinks));
  const lastSyncedShow = useRef(initialShowSocialLinks);
  useEffect(() => {
    if (busy) return;
    const propLinksKey = linksKey(initialSocialLinks);
    const localLinksKey = linksKey(links);
    if (propLinksKey !== lastSyncedLinks.current && localLinksKey === lastSyncedLinks.current) {
      setLinks(initialSocialLinks);
    }
    lastSyncedLinks.current = propLinksKey;
    if (
      initialShowSocialLinks !== lastSyncedShow.current &&
      showLinks === lastSyncedShow.current
    ) {
      setShowLinks(initialShowSocialLinks);
    }
    lastSyncedShow.current = initialShowSocialLinks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSocialLinks, initialShowSocialLinks, busy]);

  function setLinkPlatform(idx: number, platform: SocialPlatformId) {
    setLinks((prev) => prev.map((l, i) => (i === idx ? { ...l, platform } : l)));
  }
  function setLinkHandle(idx: number, handle: string) {
    setLinks((prev) => prev.map((l, i) => (i === idx ? { ...l, handle } : l)));
  }
  function addLink() {
    setLinks((prev) => {
      if (prev.length >= LINKS_MAX) return prev;
      // Default to the first platform not already in use.
      const used = new Set(prev.map((l) => l.platform));
      const next = SOCIAL_PLATFORMS.find((p) => !used.has(p.id));
      if (!next) return prev;
      return [...prev, { _key: freshKey(), platform: next.id, handle: '' }];
    });
  }
  function removeLink(idx: number) {
    setLinks((prev) => prev.filter((_, i) => i !== idx));
  }

  function isLinkValid(l: SocialLinkDraft): boolean {
    return parseSocialHandle(l.platform, l.handle) !== null;
  }
  /** Typed something that doesn't parse — flag it (empty rows are just skipped). */
  function isLinkPartial(l: SocialLinkDraft): boolean {
    return l.handle.trim() !== '' && !isLinkValid(l);
  }
  const hasInvalidLink = links.some(isLinkPartial);

  async function handleSave() {
    if (busy || hasInvalidLink) return;
    setBusy(true);
    setStatus(null);
    // Local validity-trimmed copy with stable keys preserved — server gets
    // a stripped DTO without _key (the `wire` array below).
    // Normalise pasted URLs down to the bare handle before sending.
    const cleanLinks = links.flatMap((l) => {
      const handle = parseSocialHandle(l.platform, l.handle);
      return handle ? [{ _key: l._key, platform: l.platform, handle }] : [];
    });
    const wire = cleanLinks.map(({ platform, handle }) => ({ platform, handle }));
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          socialLinks: wire,
          showSocialLinks: showLinks,
        }),
      });
      if (!res.ok) {
        setStatus({ kind: 'err', message: t('account.profileContentSaveFailed') });
        return;
      }
      setLinks(cleanLinks);
      markSocialSaved(socialKey(cleanLinks, showLinks));
      setStatus({ kind: 'ok', message: t('account.profileContentSaved') });
      refreshAccount();
      track('profile_links_set', { linkCount: wire.length, showLinks });
    } catch {
      setStatus({ kind: 'err', message: t('account.profileContentSaveFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="account-social" className={styles.card} aria-label={t('account.socialLinksTitle')}>
      <h2 className={styles.cardTitle}>{t('account.socialLinksTitle')}</h2>
      <p className={styles.usernameHint} style={{ marginTop: 0 }}>
        {t('account.socialLinksHint')}
      </p>

      <div className={styles.fieldGroup}>
        {links.length === 0 ? (
          <p className={styles.usernameHint} style={{ marginTop: 0 }}>
            {t('account.socialLinksEmpty')}
          </p>
        ) : null}
        {links.map((l, idx) => {
          const usedElsewhere = new Set(
            links.filter((_, i) => i !== idx).map((other) => other.platform),
          );
          const platform = getPlatform(l.platform);
          return (
            <div className={styles.linkRow} key={l._key}>
              <select
                className={styles.linkLabelInput}
                value={l.platform}
                onChange={(e) => setLinkPlatform(idx, e.target.value as SocialPlatformId)}
                aria-label={t('account.linkPlatformAria')}
              >
                {SOCIAL_PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id} disabled={usedElsewhere.has(p.id)}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                className={styles.linkUrlInput}
                maxLength={LINK_HANDLE_MAX}
                placeholder={platform?.example ?? ''}
                value={l.handle}
                onChange={(e) => setLinkHandle(idx, e.target.value)}
                aria-invalid={isLinkPartial(l) || undefined}
                aria-label={t('account.linkHandleAria')}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                type="button"
                className={styles.linkRemove}
                onClick={() => removeLink(idx)}
                aria-label={t('account.linkRemoveAria')}
              >
                ×
              </button>
            </div>
          );
        })}
        {links.length < LINKS_MAX ? (
          <button type="button" className={styles.linkAdd} onClick={addLink}>
            + {t('account.linkAdd')}
          </button>
        ) : null}
      </div>

      <div className={styles.toggleRow}>
        <label className={styles.toggleLabel} htmlFor="show-social-links-toggle">
          {t('account.showSocialLinksLabel')}
          <span className={styles.toggleSubLabel}>
            {showLinks ? t('account.showSocialLinksOnHint') : t('account.showSocialLinksOffHint')}
          </span>
        </label>
        <button
          type="button"
          id="show-social-links-toggle"
          className={`${styles.toggle}${showLinks ? ' ' + styles.toggleOn : ''}`}
          role="switch"
          aria-checked={showLinks}
          aria-label={t('account.showSocialLinksAria')}
          onClick={() => setShowLinks((v) => !v)}
        />
      </div>

      <div className={styles.formRow}>
        <button
          type="button"
          className={styles.saveButton}
          onClick={() => void handleSave()}
          disabled={busy || hasInvalidLink}
        >
          {busy ? t('account.saving') : t('account.profileContentSave')}
        </button>
        {hasInvalidLink ? (
          <p className={styles.errorMsg} role="alert">{t('account.linkHandleInvalid')}</p>
        ) : status ? (
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
