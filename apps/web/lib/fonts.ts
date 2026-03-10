import { Space_Grotesk, DM_Sans } from 'next/font/google';

/**
 * CampusNest v1.1 Font Configuration
 *
 * Display font: Space Grotesk — geometric sans-serif for headings
 *   (replaces DM Serif Display; closest Google Fonts match to Cabinet Grotesk)
 *
 * Body font: DM Sans — clean humanist sans-serif for body text
 *   (replaces Inter; closest Google Fonts match to Satoshi)
 */

export const displayFont = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display-new',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

export const bodyFont = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body-new',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

/**
 * CSS variable names used throughout the app.
 * --font-display and --font-body are set in globals.css to reference these variables.
 */
export const fontVariables = {
  display: '--font-display-new',
  body: '--font-body-new',
} as const;
