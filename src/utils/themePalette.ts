/**
 * Flat colour values per profile theme, for places that can't read the CSS
 * variables in src/index.css — currently the server-rendered share image
 * (/api/og/<username>). Keep in step with the [data-theme] blocks there.
 * Pure — no imports.
 */
export interface ThemePalette {
  bandFrom: string;
  bandTo: string;
  bg: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  highlightBg: string;
  highlightText: string;
}

const PALETTES: Record<string, ThemePalette> = {
  default: {
    bandFrom: '#6f4e37', bandTo: '#c69a6e', bg: '#fff7ec', card: '#ffffff', border: '#e8d8c4',
    text: '#2c1810', muted: '#7a6a60', accent: '#a36b3e', onAccent: '#ffffff',
    highlightBg: '#fff4d8', highlightText: '#8a5d12',
  },
  sage: {
    bandFrom: '#4c6342', bandTo: '#9fb78c', bg: '#f3f6ef', card: '#ffffff', border: '#d6e1cb',
    text: '#1f2a1b', muted: '#56664e', accent: '#5e7a52', onAccent: '#ffffff',
    highlightBg: '#eef3d9', highlightText: '#5f6a17',
  },
  sunset: {
    bandFrom: '#a2522a', bandTo: '#eea66a', bg: '#fcf4ed', card: '#ffffff', border: '#f0dccb',
    text: '#2e1a10', muted: '#73513c', accent: '#b25e30', onAccent: '#ffffff',
    highlightBg: '#fff4d8', highlightText: '#8a5d12',
  },
  midnight: {
    bandFrom: '#1f2b52', bandTo: '#6a7fc4', bg: '#0e1321', card: '#161d30', border: '#28324d',
    text: '#e7eaf3', muted: '#a0a8c0', accent: '#93a6e6', onAccent: '#0e1321',
    highlightBg: '#2e2a1c', highlightText: '#e8c76f',
  },
  rose: {
    bandFrom: '#8a4252', bandTo: '#dca2ad', bg: '#fbf3f4', card: '#ffffff', border: '#efd7db',
    text: '#2c1418', muted: '#725158', accent: '#a05060', onAccent: '#ffffff',
    highlightBg: '#fff4d8', highlightText: '#8a5d12',
  },
  mono: {
    bandFrom: '#22201d', bandTo: '#8f8b84', bg: '#f5f5f3', card: '#ffffff', border: '#e1e0dc',
    text: '#1c1b19', muted: '#5c5954', accent: '#3d3a36', onAccent: '#ffffff',
    highlightBg: '#ecebe6', highlightText: '#4a4741',
  },
};

export function themePalette(preset: string | null | undefined): ThemePalette {
  return PALETTES[preset ?? 'default'] ?? PALETTES.default;
}
