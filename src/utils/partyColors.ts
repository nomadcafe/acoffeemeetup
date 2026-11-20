/**
 * Colours for the people in a search (A / B / C) and the "you" marker in
 * nearby mode. One place, shared by the search inputs, result cards and map
 * markers. Warm tones that sit with the brand palette, instead of the
 * Google-blue / Google-green they used to be. Each keeps ≥4.5:1 against
 * white so the letter on a filled marker stays legible.
 */
export const PARTY_COLORS = {
  a: '#8a5536', // roasted brown
  b: '#4f6e45', // sage
  c: '#9a4a5a', // rose
  you: '#8a5536',
} as const;
