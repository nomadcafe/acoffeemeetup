import { useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { buildLocalizedPathname } from '../i18n/detectLocale';
import { formatAbsoluteDate } from '../utils/relativeTime';
import { AccountMenu } from './AccountMenu';
import { BookingWidget } from './BookingWidget';
import { HeaderNavLinks } from './HeaderNavLinks';
import { SkipToContent } from './SkipToContent';
import { LanguageSwitcher } from './LanguageSwitcher';
import { GithubLink } from './GithubLink';
import { SocialIcon } from './SocialIcon';
import { ReportProfile } from './profile/ReportProfile';
import reportStyles from './profile/ReportProfile.module.css';
import { SyncIndicator } from './SyncIndicator';
import { avatarGradient } from '../utils/avatarGradient';
import type { ResolvedSocialLink } from '../utils/socialPlatforms';
import { safeHref } from '../utils/safeHref';
import styles from './PublicProfilePage.module.css';

interface PublicShop {
  id: string;
  name: string;
  city: string | null;
  visits: number;
}

/** Allowlisted platform + handle; `url` is server-built from a fixed template. */
type SocialLink = ResolvedSocialLink;

interface FeaturedCafeLinks {
  instagram: string | null;
  website: string | null;
  menu: string | null;
  bookingExternal: string | null;
}

interface FeaturedCafePassport {
  visits: number;
  lastVisitMs: number;
}

interface PublicFeaturedCafe {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  relation: 'owned' | 'favorite';
  position: number;
  note: string | null;
  links: FeaturedCafeLinks;
  ownerPinnedNote: string | null;
  ownerVerified: boolean;
  passport: FeaturedCafePassport | null;
}

interface PublicProfile {
  username: string;
  displayName: string | null;
  image: string | null;
  bio: string | null;
  socialLinks: SocialLink[];
  themePreset: string;
  featuredCafes: PublicFeaturedCafe[];
  memberSince: number;
  cups: number;
  shops: number;
  streak: number;
  topShops: PublicShop[];
  bookingEnabled: boolean;
}

type Fetch =
  | { kind: 'loading' }
  | { kind: 'ready'; profile: PublicProfile }
  | { kind: 'not-found' }
  | { kind: 'error' };

interface Props {
  username: string;
}

/**
 * Public profile at `acoffee.com/yourname`. Unauth, served straight from
 * the profile API. Renders hero (avatar + bio + socials), stats, the
 * BookingWidget (when the owner has booking enabled), featured cafés,
 * and a top-cafés list.
 *
 * Returns the same 404-styled state for both "user doesn't exist" and "user
 * exists but profile is private", because the API answers them identically.
 */
export function PublicProfilePage({ username }: Props) {
  const { t, locale } = useI18n();
  const homeHref = buildLocalizedPathname('/', locale);
  const [state, setState] = useState<Fetch>({ kind: 'loading' });

  // Reset to loading when the username prop changes — done by tracking
  // it in state alongside the fetch state, which keeps everything inside a
  // single render commit (no in-effect setState linter complaint).
  const [activeUsername, setActiveUsername] = useState(username);
  if (activeUsername !== username) {
    setActiveUsername(username);
    setState({ kind: 'loading' });
  }

  useEffect(() => {
    let cancelled = false;
    /* Warm the browser cache for /availability in parallel with the
     * profile fetch. The availability endpoint is cache-control:
     * public,max-age=60, so this preload populates the HTTP cache;
     * BookingWidget's own fetch (which respects the default cache mode)
     * then resolves from cache instantly instead of paying a second
     * round-trip after profile lands. Saves ~150–300ms on every
     * booking-page first-paint without any prop plumbing.
     *
     * The fetch is fire-and-forget — we don't read the result here. If
     * the user's profile turns out to have bookingEnabled=false, the
     * BookingWidget never mounts and the prefetch was a wasted GET; on
     * a 60s cache that cost is negligible vs the win on the common path. */
    void fetch(`/api/profile/${encodeURIComponent(username)}/availability`).catch(() => {});
    (async () => {
      try {
        const res = await fetch(`/api/profile/${encodeURIComponent(username)}`);
        if (cancelled) return;
        if (res.status === 404) {
          setState({ kind: 'not-found' });
          return;
        }
        if (!res.ok) {
          setState({ kind: 'error' });
          return;
        }
        const profile = (await res.json()) as PublicProfile;
        setState({ kind: 'ready', profile });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  return (
    <div
      className={styles.app}
      // On the page root (not just <main>) so the page background and
      // header pick up the theme too.
      data-theme={state.kind === 'ready' ? state.profile.themePreset : undefined}
    >
      <SkipToContent />
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.logo} href={homeHref} aria-label={t('app.logoAlt')}>
            <span className={styles.logoWordmark}>ACoffee</span>
          </a>
          <HeaderNavLinks />
          <div className={styles.headerAside}>
            <LanguageSwitcher />
            <GithubLink />
            {import.meta.env.VITE_AUTH_ENABLED === 'true' ? (
              <>
                <SyncIndicator />
                <AccountMenu />
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main
        id="content"
        tabIndex={-1}
        className={styles.main}
      >
        {state.kind === 'loading' ? (
          <ProfileSkeleton />
        ) : state.kind === 'ready' ? (
          <ProfileBody profile={state.profile} />
        ) : state.kind === 'not-found' ? (
          <NotFound homeHref={homeHref} />
        ) : (
          <LoadFailed homeHref={homeHref} />
        )}
      </main>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <>
      <div className={styles.masthead}>
        <div className={styles.mastheadRule} aria-hidden />
        <div className={`${styles.skeleton} ${styles.skeletonShort}`} />
        <div className={styles.mastheadMain}>
          <div className={styles.mastheadText}>
            <div className={`${styles.skeleton} ${styles.skeletonMed}`} style={{ height: '3rem' }} />
          </div>
          <div className={`${styles.portrait} ${styles.skeleton}`} aria-hidden />
        </div>
      </div>
      <div className={styles.statsRow}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.stat}>
            <div className={styles.skeleton} style={{ height: '2.4rem' }} />
          </div>
        ))}
      </div>
    </>
  );
}

function ProfileBody({ profile }: { profile: PublicProfile }) {
  const { t, locale } = useI18n();
  const initialChar = (profile.displayName ?? profile.username)[0]?.toUpperCase() ?? '?';
  const safeSocialLinks = profile.socialLinks.filter((l) => safeHref(l.url) !== null);

  return (
    <>
      {/* Masthead: editorial, left-aligned. Kicker line, large serif name,
          avatar alongside on wide screens, bio as a pull quote. The theme
          shows as a thin accent rule rather than a banner. */}
      <header className={styles.masthead} aria-label={t('profile.heroAria')}>
        <div className={styles.mastheadRule} aria-hidden />
        <p className={styles.kicker}>
          <span>ACoffee</span>
          <span aria-hidden className={styles.kickerDot}>·</span>
          <span>
            {t('profile.memberSince', { date: formatAbsoluteDate(profile.memberSince, locale) })}
          </span>
        </p>
        <div className={styles.mastheadMain}>
          <div className={styles.mastheadText}>
            {/* Page H1 is always the visitor-readable identifier — the
                display name when set, otherwise @username. */}
            <h1 className={styles.displayName}>
              {profile.displayName ?? (
                <>
                  <span className={styles.handleAt}>@</span>
                  {profile.username}
                </>
              )}
            </h1>
            {profile.displayName ? (
              <p className={styles.handleLine}>@{profile.username}</p>
            ) : null}
          </div>
          {profile.image ? (
            <img
              className={styles.portrait}
              src={profile.image}
              alt=""
              referrerPolicy="no-referrer"
              loading="eager"
              width={160}
              height={160}
            />
          ) : (
            <div
              className={`${styles.portrait} ${styles.portraitInitial}`}
              aria-hidden
              style={{ background: avatarGradient(profile.username) }}
            >
              {initialChar}
            </div>
          )}
        </div>
        {profile.bio ? (
          <blockquote className={styles.pullQuote}>
            <p>{profile.bio}</p>
          </blockquote>
        ) : null}
        {safeSocialLinks.length > 0 ? (
          <ul className={styles.socialLinkList}>
            {safeSocialLinks.map((l) => (
              <li key={l.platform}>
                <a
                  className={styles.socialLink}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  title={l.display}
                >
                  <SocialIcon brand={l.platform} className={styles.socialLinkIcon} />
                  <span>{l.name}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {/* Stats as typography: big serif numerals, small-caps labels,
          hairline dividers — identity, read before the booking form. */}
      <section className={styles.statsRow} aria-label={t('account.statsTitle')}>
        <div className={styles.stat}>
          <div className={styles.statValue}>{profile.cups}</div>
          <div className={styles.statLabel}>{t('passport.statVisits')}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{profile.shops}</div>
          <div className={styles.statLabel}>{t('passport.statShops')}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{profile.streak}</div>
          <div className={styles.statLabel}>{t('passport.statStreak')}</div>
        </div>
      </section>

      {/* Booking widget — primary action surface. Only rendered when
          the owner has actually configured booking; otherwise the
          space stays clean. */}
      {profile.bookingEnabled ? (
        <BookingWidget username={profile.username} displayName={profile.displayName} />
      ) : null}

      {profile.featuredCafes.length > 0 ? (
        <section className={styles.section} aria-label={t('profile.featuredCafesTitle')}>
          <h2 className={styles.sectionTitle}>{t('profile.featuredCafesTitle')}</h2>
          <ul className={styles.featuredCafeList}>
            {profile.featuredCafes.map((cafe) => (
              <FeaturedCafeCard key={cafe.placeId} cafe={cafe} />
            ))}
          </ul>
        </section>
      ) : null}

      {profile.topShops.length > 0 ? (
        <section className={styles.section} aria-label={t('profile.topShopsTitle')}>
          <h2 className={styles.sectionTitle}>{t('profile.topShopsTitle')}</h2>
          <ol className={styles.shopList}>
            {profile.topShops.map((s, i) => (
              <li key={s.id}>
                {/* Each row jumps to the cafe in Google Maps. Using the
                    stable place_id form so renames / address changes don't
                    rot the link. The rank badge on the left mirrors the
                    "1, 2, 3..." mental model visitors get from "top shops"
                    without needing the visible <ol> numerals. */}
                <a
                  className={styles.shopRow}
                  href={`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(s.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span
                    className={styles.shopThumb}
                    style={{ background: avatarGradient(s.id) }}
                  >
                    {/* The proxy at /api/places/photo/[placeId] handles
                        cache + 302 to R2. onError hides the broken img
                        so the colored gradient backing the span shows
                        through — same footprint as a successful image. */}
                    <img
                      className={styles.shopThumbImg}
                      src={`/api/places/photo/${encodeURIComponent(s.id)}`}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </span>
                  <span className={styles.shopRank} aria-hidden>{i + 1}</span>
                  <span className={styles.shopMeta}>
                    <span className={styles.shopName}>{s.name}</span>
                    {s.city ? <span className={styles.shopCity}>{s.city}</span> : null}
                  </span>
                  <span className={styles.shopVisits}>
                    {t('profile.shopVisits', { count: s.visits })}
                  </span>
                  <span className={styles.shopArrow} aria-hidden>↗</span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className={reportStyles.footer}>
        <ReportProfile username={profile.username} />
      </div>
    </>
  );
}

/** Single featured café card. Two visual variants driven by `relation`:
 *
 *  - `owned`: emphasises trust + freshness. Verified ✓ next to the name
 *    when the email-domain auto-check passed; "what's brewing this week"
 *    pinned note above the static blurb so visitors see the latest first;
 *    full link strip (Instagram, website, menu, reservations).
 *
 *  - `favorite`: emphasises personal endorsement. No badge; passport
 *    tie-in line ("been here N times, last visit X days ago") for
 *    credibility; we surface a single best link (Instagram > website >
 *    menu) instead of a wide chip strip — favorites are a recommendation,
 *    not a business listing.
 */
function FeaturedCafeCard({ cafe }: { cafe: PublicFeaturedCafe }) {
  const { t, locale } = useI18n();
  const mapsHref =
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cafe.name + ' ' + cafe.address)}` +
    `&query_place_id=${encodeURIComponent(cafe.placeId)}`;

  // Pick the single highest-priority link for favorite cards.
  const favoriteLink = safeHref(
    cafe.links.instagram ?? cafe.links.website ?? cafe.links.menu ?? cafe.links.bookingExternal,
  );

  return (
    <li
      className={`${styles.featuredCafeCard}${
        cafe.relation === 'owned' ? ' ' + styles.featuredCafeCardOwned : ''
      }`}
    >
      <div className={styles.featuredCafeHead}>
        <a
          className={styles.featuredCafeName}
          href={mapsHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          {cafe.name}
          {cafe.relation === 'owned' && cafe.ownerVerified ? (
            <span
              className={styles.featuredCafeVerified}
              title={t('profile.featuredCafeVerifiedTitle')}
              aria-label={t('profile.featuredCafeVerifiedTitle')}
            >
              {' '}✓
            </span>
          ) : null}
        </a>
        <span className={styles.featuredCafeRelationTag}>
          {cafe.relation === 'owned'
            ? t('profile.featuredCafeRelationOwned')
            : t('profile.featuredCafeRelationFavorite')}
        </span>
      </div>
      <div className={styles.featuredCafeAddress}>{cafe.address}</div>

      {/* Pinned weekly note — owned-only and only when populated. Stands
          above the static blurb because it's the freshest signal. */}
      {cafe.relation === 'owned' && cafe.ownerPinnedNote ? (
        <div className={styles.featuredCafePinned}>
          <span className={styles.featuredCafePinnedLabel}>
            {t('profile.featuredCafePinnedLabel')}
          </span>
          <span className={styles.featuredCafePinnedText}>{cafe.ownerPinnedNote}</span>
        </div>
      ) : null}

      {cafe.note ? <p className={styles.featuredCafeNote}>{cafe.note}</p> : null}

      {/* Passport tie-in: only on favorite cards, only when the cafe is
          actually in the owner's passport. "Been here 23 times, last
          visit 3 days ago" reads as endorsement; on owned cards the same
          line would read as the owner counting their own visits, which
          is weird. */}
      {cafe.relation === 'favorite' && cafe.passport ? (
        <p className={styles.featuredCafePassport}>
          {t('profile.featuredCafePassportLine', {
            count: cafe.passport.visits,
            date: formatAbsoluteDate(cafe.passport.lastVisitMs, locale),
          })}
        </p>
      ) : null}

      {/* Link strip: full chip row for owned cards, single link for
          favorites (set above). Slots collapse silently when empty. */}
      {cafe.relation === 'owned' ? (
        <FeaturedCafeOwnedLinks links={cafe.links} />
      ) : favoriteLink ? (
        <a
          className={styles.featuredCafeFavoriteLink}
          href={favoriteLink}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {t('profile.featuredCafeFavoriteLinkLabel')}
        </a>
      ) : null}
    </li>
  );
}

/** Chip strip for owned-cafe links. Each present link becomes its own
 *  pill so visitors can land directly on Instagram / menu / reservations
 *  without a click extra. Order is fixed: Instagram → website → menu →
 *  reservations, mirroring how a customer typically researches a cafe. */
function FeaturedCafeOwnedLinks({ links }: { links: FeaturedCafeLinks }) {
  const { t } = useI18n();
  const slots: Array<{ key: keyof FeaturedCafeLinks; label: string }> = [
    { key: 'instagram', label: t('profile.featuredCafeLinkInstagram') },
    { key: 'website', label: t('profile.featuredCafeLinkWebsite') },
    { key: 'menu', label: t('profile.featuredCafeLinkMenu') },
    { key: 'bookingExternal', label: t('profile.featuredCafeLinkBooking') },
  ];
  const present = slots.filter((s) => safeHref(links[s.key]) !== null);
  if (present.length === 0) return null;
  return (
    <div className={styles.featuredCafeLinkStrip}>
      {present.map(({ key, label }) => (
        <a
          key={key}
          className={styles.featuredCafeLinkChip}
          href={safeHref(links[key]) ?? undefined}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {label}
        </a>
      ))}
    </div>
  );
}

function NotFound({ homeHref }: { homeHref: string }) {
  const { t } = useI18n();
  return (
    <div className={styles.notFound}>
      <div className={styles.notFoundEmoji} aria-hidden>☕</div>
      <p>{t('profile.notFound')}</p>
      <a className={styles.notFoundCta} href={homeHref}>
        {t('account.goHome')}
      </a>
    </div>
  );
}

/**
 * Distinct from NotFound: 4xx-other / 5xx / network failure.
 * Tells the user this is a transient problem (refresh) instead of
 * "this profile doesn't exist" (which 404 implies and which would
 * be misleading if the API was just down).
 */
function LoadFailed({ homeHref }: { homeHref: string }) {
  const { t } = useI18n();
  return (
    <div className={styles.notFound} role="alert">
      <div className={styles.notFoundEmoji} aria-hidden>⚠️</div>
      <p>{t('profile.loadFailed')}</p>
      <button
        type="button"
        className={styles.notFoundCta}
        onClick={() => window.location.reload()}
      >
        {t('errors.retry')}
      </button>
      <a className={styles.notFoundLink} href={homeHref}>
        {t('account.goHome')}
      </a>
    </div>
  );
}
