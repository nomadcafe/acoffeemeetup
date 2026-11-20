

/* List of {value, color} pairs for the theme picker. `value` matches the
 * server-side enum + the [data-theme] attribute on PublicProfilePage; `color`
 * is the accent shown on the swatch (NOT applied via CSS vars — we want the
 * picker to show all options regardless of which theme is active, so each
 * swatch carries its own inline color). Keep in sync with the [data-theme]
 * rules in src/index.css. */
export const THEME_PRESETS = [
  { value: 'default', color: '#6f4e37' },
  { value: 'sage', color: '#5e7a52' },
  { value: 'sunset', color: '#b25e30' },
  { value: 'midnight', color: '#4a5b8c' },
  { value: 'rose', color: '#a05060' },
  { value: 'mono', color: '#4a4742' },
] as const;

export type ThemePreset = (typeof THEME_PRESETS)[number]['value'];
