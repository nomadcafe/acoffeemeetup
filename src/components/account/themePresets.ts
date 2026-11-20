

/* Theme presets for the picker. `value` matches the server-side enum and the
 * [data-theme] palettes in src/index.css (each swatch renders with its own
 * data-theme, so it shows that theme's band). `color` is the theme accent,
 * kept as a plain reference; the share image uses src/utils/themePalette.ts. */
export const THEME_PRESETS = [
  { value: 'default', color: '#6f4e37' },
  { value: 'sage', color: '#5e7a52' },
  { value: 'sunset', color: '#b25e30' },
  { value: 'midnight', color: '#4a5b8c' },
  { value: 'rose', color: '#a05060' },
  { value: 'mono', color: '#4a4742' },
] as const;

export type ThemePreset = (typeof THEME_PRESETS)[number]['value'];
