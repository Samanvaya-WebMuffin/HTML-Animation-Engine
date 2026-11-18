/**
 * The Cowork product's own look, its locked "Grid" theme, so the film's app
 * windows match screen recordings of the real product: a graphite accent,
 * a light grey page, white panels, hairline borders, 3 px corners, the UI
 * font at about 14 px, and monospace for the wordmark, metadata and chips.
 *
 * `ink`, `page`, `panel` and `border` are the product's own values; the
 * other steps are mixes of them, and the status colours are quiet,
 * readable on white (the film never shows them large).
 */
export const gridColors = {
  /** The accent: text, primary buttons, the send button. */
  ink: '#20262d',
  page: '#f5f6f7',
  panel: '#ffffff',
  border: '#dfe2e5',
  /** Secondary and tertiary text. */
  muted: '#5b636d',
  faint: '#8a9199',
  /** Hover and selected rows, the user's message. */
  hover: '#eef0f2',
  selected: '#e6e9ec',
  /** Status: high confidence, ready. */
  good: '#2f7a4c',
  goodSoft: '#e4f1e8',
  /** Status: low confidence, working. */
  warn: '#9a5b0b',
  warnSoft: '#f8eedd',
  /** Links and citation numbers. */
  link: '#2c5d8f',
  white: '#ffffff',
} as const;

/** Corners: everything is 3 px, buttons included. */
export const gridRadii = { box: 3 } as const;
