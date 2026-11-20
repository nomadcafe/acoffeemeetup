import { useEffect, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import styles from '../AccountPage.module.css';
import {
  type SectionStatusMap,
  TOC_GROUPS,
  TOC_IDS,
  type TocGroup,
} from './sections';

/** Watch each section id and report the topmost one currently in view.
 *  Falls back to the first id if nothing is intersecting (e.g. very long
 *  sections where no boundary is visible). */
function useScrollSpy(ids: ReadonlyArray<string>): string {
  const [activeId, setActiveId] = useState<string>(ids[0] ?? '');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    // rootMargin pushes the "active" zone down a bit so a section is
    // marked active once its title is past the sticky header, not when
    // its top edge first peeks in. Bottom is generous so we don't flicker
    // off-active while the next section is still mostly off-screen.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const topmost = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
        );
        setActiveId(topmost.target.id);
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);
  return activeId;
}

function groupProgress(g: TocGroup, status: SectionStatusMap) {
  const tracked = g.items.filter((i) => status[i.id] != null);
  return {
    total: tracked.length,
    done: tracked.filter((i) => status[i.id] === 'done').length,
  };
}

/**
 * Settings navigation. Desktop (≥1024px): sticky side rail, grouped, with a
 * ✓ / dot on the sections that make the public page and booking usable.
 * Below that: a sticky row of group chips — mobile used to get no
 * navigation at all and had to scroll through every card.
 */
export function AccountToc({
  status,
  unsaved,
  onNavigate,
}: {
  status: SectionStatusMap;
  unsaved: ReadonlySet<string>;
  /** Scroll to a section (the page may need to expand it first). */
  onNavigate: (id: string) => boolean;
}) {
  const { t } = useI18n();
  const activeId = useScrollSpy(TOC_IDS);
  const activeGroup = TOC_GROUPS.find((g) => g.items.some((i) => i.id === activeId))?.key;
  return (
    <>
      <nav className={styles.toc} aria-label={t('account.tocAria')}>
        {TOC_GROUPS.map((g) => {
          const { done, total } = groupProgress(g, status);
          return (
            <div key={g.key} className={styles.tocGroup}>
              <p className={styles.tocGroupTitle}>
                <span>{t(g.labelKey)}</span>
                {total > 0 ? (
                  <span
                    className={`${styles.tocGroupProgress}${
                      done === total ? ' ' + styles.tocGroupProgressDone : ''
                    }`}
                    aria-label={t('account.tocProgressAria', { done, total })}
                  >
                    {done}/{total}
                  </span>
                ) : null}
              </p>
              <ol className={styles.tocList}>
                {g.items.map((s) => {
                  const st = status[s.id];
                  return (
                    <li key={s.id}>
                      <a
                        className={`${styles.tocLink}${
                          activeId === s.id ? ' ' + styles.tocLinkActive : ''
                        }`}
                        href={`#${s.id}`}
                        aria-current={activeId === s.id ? 'location' : undefined}
                        onClick={(e) => {
                          if (onNavigate(s.id)) e.preventDefault();
                        }}
                      >
                        <span>{t(s.labelKey)}</span>
                        {unsaved.has(s.id) ? (
                          <span className={styles.tocUnsaved}>{t('account.tocUnsaved')}</span>
                        ) : st === 'done' ? (
                          <span className={styles.tocCheck} aria-label={t('account.tocDone')}>
                            ✓
                          </span>
                        ) : st === 'todo' ? (
                          <span className={styles.tocTodo} aria-label={t('account.tocTodo')} />
                        ) : null}
                      </a>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </nav>
      <nav className={styles.tocMobile} aria-label={t('account.tocAria')}>
        {TOC_GROUPS.map((g) => {
          const { done, total } = groupProgress(g, status);
          const todo = total - done;
          const groupUnsaved = g.items.some((i) => unsaved.has(i.id));
          return (
            <a
              key={g.key}
              href={`#${g.items[0].id}`}
              className={`${styles.tocChip}${
                activeGroup === g.key ? ' ' + styles.tocChipActive : ''
              }`}
              aria-current={activeGroup === g.key ? 'location' : undefined}
              onClick={(e) => {
                if (onNavigate(g.items[0].id)) e.preventDefault();
              }}
            >
              {t(g.labelKey)}
              {groupUnsaved ? (
                <span className={styles.tocChipUnsaved} aria-label={t('account.tocUnsaved')} />
              ) : null}
              {todo > 0 ? (
                <span className={styles.tocChipBadge} aria-label={t('account.tocTodoCount', { count: todo })}>
                  {todo}
                </span>
              ) : null}
            </a>
          );
        })}
      </nav>
    </>
  );
}
