

/**
 * Settings sections, grouped for the sidebar. Order here = render order on
 * the page; when a card is added, add its JSX `id` here too.
 */
export interface TocGroup {
  key: 'profile' | 'booking' | 'account';
  labelKey: string;
  items: ReadonlyArray<{ id: string; labelKey: string }>;
}

export const TOC_GROUPS: ReadonlyArray<TocGroup> = [
  {
    key: 'profile',
    labelKey: 'account.tocGroupProfile',
    items: [
      { id: 'account-username', labelKey: 'account.usernameTitle' },
      { id: 'account-visibility', labelKey: 'account.profileTitle' },
      { id: 'account-avatar', labelKey: 'account.avatarTitle' },
      { id: 'account-basic', labelKey: 'account.basicInfoTitle' },
      { id: 'account-social', labelKey: 'account.socialLinksTitle' },
      { id: 'account-theme', labelKey: 'account.themeTitle' },
      { id: 'account-cafes', labelKey: 'account.featuredCafeLabel' },
    ],
  },
  {
    key: 'booking',
    labelKey: 'account.tocGroupBooking',
    items: [
      { id: 'account-booking', labelKey: 'account.bookingTitle' },
      { id: 'account-calendar', labelKey: 'account.calendarTitle' },
    ],
  },
  {
    key: 'account',
    labelKey: 'account.tocGroupAccount',
    items: [
      { id: 'account-identity', labelKey: 'account.identityTitle' },
      { id: 'account-export', labelKey: 'account.exportTitle' },
      { id: 'account-sessions', labelKey: 'account.sessionsTitle' },
      { id: 'account-danger', labelKey: 'account.deleteTitle' },
    ],
  },
];

export const TOC_IDS: ReadonlyArray<string> = TOC_GROUPS.flatMap((g) => g.items.map((i) => i.id));

/** Setup progress for the sections that make a profile / booking page
 *  actually usable. Sections absent from the map are optional and get no
 *  mark (social links, theme, calendar…). */
type SectionStatus = 'done' | 'todo';

export type SectionStatusMap = Partial<Record<string, SectionStatus>>;

/** Old / short anchors other pages may link to → real section ids. */
export const SECTION_HASH_ALIASES: Record<string, string> = {
  username: 'account-username',
  profile: 'account-visibility',
  booking: 'account-booking',
  calendar: 'account-calendar',
};

export function scrollToSection(id: string, behavior: ScrollBehavior = 'smooth') {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior, block: 'start' });
  history.replaceState(null, '', `#${id}`);
  return true;
}
