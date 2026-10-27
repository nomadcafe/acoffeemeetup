/**
 * Returns the URL only if it's http(s), else null. User-supplied links are
 * validated on save, but rows written before that check (or by any other
 * path) would otherwise render straight into an href — a `javascript:` URL
 * there runs on click.
 */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}
