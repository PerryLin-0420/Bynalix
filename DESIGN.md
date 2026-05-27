---
name: Bio-Precision Design System
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#3f484a'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#6f797a'
  outline-variant: '#bfc8c9'
  surface-tint: '#20686f'
  primary: '#004349'
  on-primary: '#ffffff'
  primary-container: '#0d5c63'
  on-primary-container: '#90d2da'
  inverse-primary: '#8fd1d9'
  secondary: '#006b5f'
  on-secondary: '#ffffff'
  secondary-container: '#62fae3'
  on-secondary-container: '#007165'
  tertiary: '#2f3f3f'
  on-tertiary: '#ffffff'
  tertiary-container: '#465656'
  on-tertiary-container: '#b9cbca'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#abeef6'
  primary-fixed-dim: '#8fd1d9'
  on-primary-fixed: '#002023'
  on-primary-fixed-variant: '#004f55'
  secondary-fixed: '#62fae3'
  secondary-fixed-dim: '#3cddc7'
  on-secondary-fixed: '#00201c'
  on-secondary-fixed-variant: '#005047'
  tertiary-fixed: '#d4e6e5'
  tertiary-fixed-dim: '#b8cac9'
  on-tertiary-fixed: '#0e1e1e'
  on-tertiary-fixed-variant: '#3a4a49'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-display:
    fontFamily: Manrope
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 20px
  margin-desktop: 48px
  container-max-width: 1200px
---

## CSS Variable Contract

This section defines the **single source of truth** for all styling. Every component must reference these CSS custom properties — never hard-code hex values inline. Claude must follow this contract exactly when generating or modifying any HTML, CSS, or TypeScript code for this project.

### Master Brand Token

One variable controls the entire brand identity. Changing `--brand-primary` should cascade through all derived tokens.

```css
:root {
  --brand-primary: #004349;   /* THE master token — teal brand anchor */
}
```

### Background Layer (`--bg-main`)

The app shell background. Applied only to `<body>` and full-bleed containers — never to cards or components.

```css
:root {
  --bg-main:       linear-gradient(to bottom, #0d5c63, #004349);
  --bg-main-start: #0d5c63;
  --bg-main-end:   #004349;
}
```

### Surface Layer (`--surface`)

The card and component fill. All `.glass-elevated` elements must use `--surface-elevated`; never write `rgba(255,255,255,…)` directly.

```css
:root {
  --surface:               #ffffff;
  --surface-elevated:      rgba(255, 255, 255, 0.70);   /* glass-elevated fill */
  --surface-border:        rgba(0, 67, 73, 0.10);       /* 1px card stroke */
  --surface-shadow:        rgba(0, 67, 73, 0.05);       /* ambient shadow */
  --surface-container:     #eceef0;
  --surface-container-low: #f2f4f6;
}
```

### Text Token Hierarchy (critical — previously missing)

Text tokens are **context-dependent**: a different set applies on `--bg-main` (dark) vs. on `--surface` (light). All text colors **must** use a `--text-*` token; inline `style="color: #…"` is forbidden.

```css
:root {
  /* --- Text on --bg-main (dark gradient app shell) --- */
  --text-on-bg:       #ffffff;                   /* headings, primary labels */
  --text-on-bg-muted: rgba(255, 255, 255, 0.80); /* subtitles, captions */
  --text-on-bg-faint: rgba(255, 255, 255, 0.50); /* disabled, placeholders */

  /* --- Text on --surface (light card layer) --- */
  --text-on-surface:       #191c1e;  /* body text, primary metric values */
  --text-on-surface-sub:   #3f484a;  /* secondary labels */
  --text-on-surface-muted: #6f797a;  /* units, timestamps, captions */
  --text-accent:           #004349;  /* brand-teal text on light cards */
  --text-accent-mid:       #0d5c63;  /* softer accent for charts, trend lines */

  /* --- Text on brand-colored elements (buttons, chips, FAB) --- */
  --text-on-brand: #ffffff;
}
```

### Usage Rules

| Context | Background token | Text tokens to use |
|---|---|---|
| App shell / header | `--bg-main` | `--text-on-bg`, `--text-on-bg-muted` |
| Cards / panels | `--surface` or `--surface-elevated` | `--text-on-surface`, `--text-on-surface-sub`, `--text-on-surface-muted`, `--text-accent` |
| Buttons / chips / FAB | `--color-primary` / `--color-secondary` | `--text-on-brand` |
| Chart lines & data points | — | stroke/fill = `--text-accent-mid` |

### Interactive Color Tokens

```css
:root {
  --color-primary:            #004349;
  --color-primary-container:  #0d5c63;
  --color-secondary:          #006b5f;
  --color-secondary-container:#62fae3;
  --color-error:              #ba1a1a;
  --color-outline:            #6f797a;
  --color-outline-variant:    #bfc8c9;
}
```

---

## Brand & Style
The design system is engineered to bridge the gap between clinical precision and user-centric accessibility. It evokes a sense of **Modern Classicism**—reliable and authoritative like a medical journal, yet fluid and energetic like a high-performance athlete. 

The aesthetic draws from **Minimalism** with a **Tactile** twist: clean layouts and generous whitespace are punctuated by elements with subtle depth, creating a "laboratory-glass" effect. This approach ensures that complex biological data feels organized and non-intimidating. The target audience includes health-conscious individuals and professionals who value data integrity and a sophisticated, non-juvenile interface.

## Colors
The palette is derived from the deep teals and cyan accents of the DNA logo, moving away from high-contrast yellows toward a more serene, professional spectrum.

- **Primary (Deep Teal):** Used for primary actions, navigation headers, and authoritative text.
- **Secondary (Cyan/Turquoise):** Used for highlighting trends, data progress bars, and interactive states.
- **Tertiary (Mint Mist):** Used for subtle backgrounds and soft UI separators.
- **Surface (Clinical White):** A clean `#F8FAFC` base for cards to ensure data legibility.
- **Semantic Colors:** Specific hues are assigned to biological categories to allow for instant cognitive recognition: Green for Nutrition, Amber for Activity, Indigo for Weight, and Red for Heart/Vitals.

## Typography
The system utilizes **Manrope** for its geometric yet friendly qualities, providing excellent legibility for both headers and body text. 

A "Data Display" level is introduced specifically for large-scale biometric numbers (like weight or calorie counts) to emphasize statistical importance. **JetBrains Mono** is used sparingly for labels and timestamps to reinforce the "Log" and "Scientific" aspect of the application, giving it a modern, technical edge.

## Layout & Spacing
This design system employs a **Fluid Grid** model built on an 8px base unit (with 4px sub-units for tight components). 

- **Mobile:** A single-column layout with 20px margins. Cards span the full width minus margins.
- **Tablet:** A 6-column grid with 16px gutters.
- **Desktop:** A 12-column grid with a maximum container width of 1200px. 

Spacing between "Category Blocks" should be generous (32px+) to prevent visual clutter, while spacing within "Data Cards" should be compact (8-12px) to keep related metrics grouped together.

## Elevation & Depth
Depth is signaled through **Tonal Layers** and **Soft Ambient Shadows**. 

The main application background uses a very subtle top-down gradient. Interactive cards utilize a "Glass-Elevated" style: a thin 1px border in a lighter shade of the primary color with a low-opacity shadow (Color: Primary, Blur: 12px, Alpha: 0.05). This creates a sense of light passing through medical-grade equipment. Surface layers should feel stacked rather than floating in space.

## Shapes
The shape language is consistently **Rounded (Level 2)**. 

Standard cards use 1rem (16px) corners to feel modern and accessible. Buttons and primary input fields follow this 16px radius. Smaller elements like tags and chips use "Pill-shaped" (Full Rounding) to distinguish them as secondary interactive metadata. Avoid sharp 0px corners entirely to maintain the "bio-organic" feel of the DNA-inspired brand.

## Components
- **Data Cards:** Should feature a 1px `tertiary_color` stroke. Use `label-mono` for categories and `data-display` for the primary metric.
- **Primary Buttons:** Solid `primary_color` with white text, utilizing a 16px corner radius and a subtle inner-glow on hover.
- **Biometric Chips:** Used for nutrition/activity labels. Backgrounds should be 10% opacity of their respective semantic color with 100% opacity text.
- **Progress Rings:** Use `secondary_color` for the active track and a light grey/teal mix for the background track. Use rounded stroke-caps for a softer look.
- **Input Fields:** Use a subtle background fill (`neutral_color`) instead of a heavy border. The border should only appear on focus using the `secondary_color`.
- **Navigation:** A clean bottom bar on mobile with monochromatic icons, highlighting the active state with a small `secondary_color` dot or underline.