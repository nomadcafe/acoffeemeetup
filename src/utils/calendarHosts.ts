/**
 * Calendar feeds we'll fetch for busy-time sync. Shared by the Account page
 * (explain before saving) and the server (enforced on every fetch, every
 * redirect hop). Pure — no imports.
 *
 * The URL is only ever read by our server, never shown to anyone, but an
 * open "fetch any https URL" box still lets the server be pointed at
 * arbitrary hosts. Restricting it to the major calendar providers keeps the
 * feature for the people who need it and closes that off.
 */

/** Exact host, or any subdomain of it (e.g. p52-caldav.icloud.com). */
const ALLOWED_CALENDAR_HOSTS: readonly string[] = [
  'calendar.google.com', // Google Calendar / Workspace "secret address in iCal format"
  'icloud.com', // iCloud public calendars (pNN-caldav.icloud.com)
  'outlook.office365.com', // Microsoft 365 published calendars
  'outlook.office.com',
  'outlook.live.com', // Outlook.com
  'calendar.proton.me', // Proton Calendar share links
  'user.fm', // Fastmail calendar sharing
  'fastmail.com',
  'calendar.yahoo.com', // export.calendar.yahoo.com
];

/** Provider names, for the "supported:" hint. */
export const CALENDAR_PROVIDER_NAMES = 'Google, iCloud, Outlook / Microsoft 365, Proton, Fastmail, Yahoo';

export function isAllowedCalendarHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return ALLOWED_CALENDAR_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** True when `raw` (https:// or webcal://) points at a supported provider. */
export function isSupportedCalendarUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim().replace(/^webcal:\/\//i, 'https://'));
    return u.protocol === 'https:' && isAllowedCalendarHost(u.hostname);
  } catch {
    return false;
  }
}
