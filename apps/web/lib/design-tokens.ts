/**
 * CampusNest v1.1 Design Tokens
 *
 * TypeScript constants for the brand design system.
 * These values are mirrored as CSS custom properties in globals.css.
 * Use the CSS variables in components; use these constants for
 * programmatic access (e.g., Framer Motion, chart libraries).
 */

// ─── Brand Colors ───

export const colors = {
  /** Deep Teal — primary brand */
  primary: {
    DEFAULT: '#0D7377',
    foreground: '#FFFFFF',
    50: '#f0fdfa',
    100: '#ccfbf1',
    200: '#99f6e4',
    300: '#5eead4',
    400: '#2dd4bf',
    500: '#14b8a6',
    600: '#0d9488',
    700: '#0D7377',
    800: '#115e59',
    900: '#134e4a',
    950: '#042f2e',
  },

  /** Warm Amber — secondary accent */
  secondary: {
    DEFAULT: '#D4A017',
    foreground: '#1c1917',
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#D4A017',
    600: '#d97706',
  },

  /** Soft Coral — accent */
  accent: {
    DEFAULT: '#f43f5e',
    foreground: '#FFFFFF',
    50: '#fff1f2',
    100: '#ffe4e6',
    500: '#f43f5e',
  },

  /** Surface — Warm Stone neutrals */
  surface: {
    50: '#fafaf9',
    100: '#f5f5f4',
    200: '#e7e5e4',
    300: '#d6d3d1',
    400: '#a8a29e',
    500: '#78716c',
    600: '#57534e',
    700: '#44403c',
    800: '#292524',
    900: '#1c1917',
  },

  /** Semantic — backgrounds & foregrounds */
  background: '#fafaf9',
  foreground: '#1c1917',
  muted: {
    DEFAULT: '#f5f5f4',
    foreground: '#78716c',
  },
  destructive: '#dc2626',

  /** Fairness score colors */
  fairness: {
    good: '#059669',
    goodBg: '#ecfdf5',
    ok: '#d97706',
    okBg: '#fffbeb',
    bad: '#dc2626',
    badBg: '#fef2f2',
  },
} as const;

// ─── Border Radii ───

export const radii = {
  /** Card corners */
  card: '12px',
  /** Button corners */
  button: '8px',
  /** Chat bubble corners */
  chat: '20px',
  /** Default shadcn radius */
  default: '0.625rem',
} as const;

// ─── Shadows ───

export const shadows = {
  card: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
  cardHover:
    '0 10px 25px rgba(0, 0, 0, 0.08), 0 4px 10px rgba(0, 0, 0, 0.04)',
  modal:
    '0 20px 60px rgba(0, 0, 0, 0.12), 0 8px 20px rgba(0, 0, 0, 0.06)',
} as const;

// ─── Spacing (reference) ───

export const spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  '2xl': '3rem',
  '3xl': '4rem',
} as const;

// ─── Typography Scale ───

export const typography = {
  display: {
    fontFamily: 'var(--font-display)',
    weights: [400, 500, 600, 700] as const,
  },
  body: {
    fontFamily: 'var(--font-body)',
    weights: [400, 500, 600, 700] as const,
  },
} as const;
