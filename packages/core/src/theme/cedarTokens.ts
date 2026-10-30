/**
 * The Cedar System - Official Design Tokens for Credics
 * Derived from the Cedar System specification:
 * 22 scoped variables (Brand Pine, Accent Gold, Neutral Warm, Data & Semantic)
 */

export const CedarColors = {
  // Brand Pine (Primary & Depth)
  pine900: '#0C2C21', // Darkest background & immersive cards
  pine800: '#0F3D2E', // Container & Card background
  pine700: '#14513B', // Selected states
  pine600: '#1B6A4C', // Active buttons
  pine500: '#2E8B63', // Vibrant accents
  pine300: '#7FA894', // Inactive icons & subtle borders

  // Accent Gold (Warm highlights & Primary CTAs)
  gold600: '#C68F2C', // Deep amber
  gold500: '#E7B24A', // Primary Gold action buttons
  gold200: '#F3E2B4', // Soft warm highlights

  // Neutral Warm
  ink900: '#12160F',  // Primary text
  ink700: '#55604E',  // Secondary labels
  ink500: '#8A9482',  // Tertiary subtitles
  bone: '#F2ECE0',    // Clean app canvas background
  paper: '#FBF7EE',   // Card canvas
  line: '#E7DECF',    // Borders & dividers

  // Data & Semantic Feedback
  positive: '#2F9E6E', // Paid / Income / Green
  negative: '#C6543A', // Due / Danger / Overdue
  clay: '#C86847',     // Bill cycle alert
  sage: '#AEC6A6',     // Progress track
} as const;

export const CedarTypography = {
  display: 'SpaceGrotesk-Bold', // Amounts & Header numbers ($12,480.50)
  displayMedium: 'SpaceGrotesk-Medium',
  body: 'Inter-Regular',        // Readable UI texts
  bodySemiBold: 'Inter-SemiBold', // Buttons & chips
  bodyBold: 'Inter-Bold',
  accent: 'Fraunces-Regular',   // Smart tips & editorial highlights
} as const;

export const CedarSpacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const CedarRadius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 9999,
} as const;
