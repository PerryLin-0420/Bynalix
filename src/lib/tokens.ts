/**
 * Design tokens mirrored from DESIGN.md CSS variable contract.
 * Use these wherever CSS custom properties are inaccessible — e.g. recharts
 * props (stroke, fill, fontFamily) or canvas / SVG inline styles.
 * For everything else, reference the CSS variables directly.
 */

export const color = {
  /* Brand */
  brandPrimary:             '#004349',

  /* Background layer */
  bgMainStart:              '#0d5c63',
  bgMainEnd:                '#004349',

  /* Surface layer */
  surface:                  '#ffffff',
  surfaceElevated:          'rgba(255,255,255,0.70)',
  surfaceBorder:            'rgba(0,67,73,0.10)',
  surfaceShadow:            'rgba(0,67,73,0.05)',
  surfaceContainer:         '#eceef0',
  surfaceContainerLow:      '#f2f4f6',

  /* Text — on dark background */
  textOnBg:                 '#ffffff',
  textOnBgMuted:            'rgba(255,255,255,0.80)',
  textOnBgFaint:            'rgba(255,255,255,0.50)',

  /* Text — on light surface */
  textOnSurface:            '#191c1e',
  textOnSurfaceSub:         '#3f484a',
  textOnSurfaceMuted:       '#6f797a',
  textAccent:               '#004349',
  textAccentMid:            '#0d5c63',

  /* Text — on brand elements */
  textOnBrand:              '#ffffff',

  /* Interactive */
  primary:                  '#004349',
  primaryContainer:         '#0d5c63',
  secondary:                '#006b5f',
  secondaryContainer:       '#62fae3',
  error:                    '#ba1a1a',
  outline:                  '#6f797a',
  outlineVariant:           '#bfc8c9',
} as const;

export const font = {
  sans: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
} as const;

/** Spacing scale — pixel values for use in JS/SVG/Recharts contexts.
 *  These mirror the CSS variables in :root (--sp-*). */
export const spacing = {
  tight:   8,   // --sp-tight  / gap-2
  item:    12,  // --sp-item   / gap-3
  section: 20,  // --sp-section / p-5
  pageX:   16,  // --sp-page-x / px-4
} as const;

/** Typography scale — pixel values for use in JS/SVG contexts */
export const type = {
  headlineLg:       { fontSize: 32, fontWeight: 700, lineHeight: 40, letterSpacing: '-0.02em' },
  headlineLgMobile: { fontSize: 24, fontWeight: 700, lineHeight: 32 },
  headlineMd:       { fontSize: 20, fontWeight: 600, lineHeight: 28 },
  bodyLg:           { fontSize: 16, fontWeight: 400, lineHeight: 24 },
  bodySm:           { fontSize: 14, fontWeight: 400, lineHeight: 20 },
  labelMono:        { fontSize: 12, fontWeight: 500, lineHeight: 16, letterSpacing: '0.05em' },
  dataDisplay:      { fontSize: 48, fontWeight: 800, lineHeight: 48, letterSpacing: '-0.04em' },
} as const;
