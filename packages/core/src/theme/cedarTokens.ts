/**
 * The Cedar System - Official Design Tokens for Credics
 * "Eye-Friendly Luxury Minimalist" Palette (Derived from modern luxury fin-tech guidelines)
 *
 * Core Concept:
 * - Soft eye-friendly ambient off-white/sage canvas (#EFF3EE) - No harsh pure white glare
 * - Soft ambient surfaces (#F5F8F4, #EAEFE8) with subtle sage borders (#DFE7DE)
 * - Deeper luxury forest green hero cards & floating actions (#071A12 / #0A261C)
 * - Warm Secondary Accents: Cream (#F8F5EE), Warm Beige (#EFECE2), Soft Champagne Amber (#D69E2E)
 * - Crisp contrast readable typography (#112017 for headings, #55665B for secondary)
 */

export const CedarColors = {
  // Canvas & Surfaces (Eye-Friendly Soft Ambient - Pure #FFFFFF strictly eliminated)
  canvas: '#EFF3EE',      // Soft ambient light sage-tinted off-white background
  card: '#F6F9F5',        // Soft eye-pleasing elevated surface (No harsh #FFFFFF)
  cardAlt: '#ECEFEA',     // Secondary surface / inner row / recessed cards
  cardSubtle: '#E4EAE2',  // Subtle container backdrop
  border: '#DFE7DE',      // Soft organic sage border
  borderDark: '#CAD6C9',  // Slightly deeper divider

  // Deep Luxury Forest Green (Hero & Primary Focus - Deepened per specification)
  forest950: '#040D09',   // Deepest luxury dark forest
  forest900: '#071A12',   // Deeper primary forest hero cards & backgrounds
  forest800: '#0A261C',   // Deep Forest Green (Floating action button, elevated cards)
  forest700: '#113A2B',   // Gradient transition
  forest600: '#174E3A',   // Active state / button hover
  forest500: '#216A50',

  // Warm Secondary Accents (Cream, Beige & Soft Eye-Pleasing Accents)
  cream: '#F8F5EE',       // Warm luxury cream surface
  creamAlt: '#F2EDE2',    // Deeper cream for active pills & tags
  beige: '#EFECE2',       // Warm beige accent
  beigeDark: '#DED8C7',   // Beige borders and chips
  amberWarm: '#D97706',   // Soft warm gold/amber for pending states
  amberSoft: '#FEF3C7',   // Cream-amber pill backdrop

  // Mint & Sage Accents (Badges, Buttons, Charts)
  mint500: '#2E944B',     // Action mint green (Add/Lend button, active pills)
  mint400: '#439261',     // Trend pills, positive growth
  mint100: '#E2F1E6',     // Soft mint tag background
  sage300: '#71A387',     // Chart segment
  sage200: '#9BB8A7',     // Inactive chart bars, subtle badges
  sage100: '#E4EEE6',     // Leaf budget banner, soft pill background
  sage50: '#EFF4F0',

  // Typography
  ink900: '#112017',      // High contrast eye-friendly primary heading / amounts
  ink700: '#55665B',      // Secondary subheadings & readable labels
  ink500: '#7E9185',      // Muted metadata & placeholders
  inkLight: '#A7B9AE',    // Inactive tab icons
  textWhite: '#F6F9F5',   // Soft eye-friendly contrast text on deep forest cards (not piercing #FFF)

  // Data & Semantics
  positive: '#2E944B',    // Income / Recovery / Settled
  negative: '#D94338',    // Overdue / Due Alert / Expense
  warning: '#D97706',     // Pending / Warning
  info: '#2B84D2',        // Information

  // Backwards Compatibility Aliases
  pine900: '#071A12',
  pine800: '#0A261C',
  pine700: '#113A2B',
  pine600: '#174E3A',
  pine500: '#2E944B',
  pine300: '#9BB8A7',
  gold600: '#2E944B',
  gold500: '#2E944B',
  gold200: '#E4EEE6',
  bone: '#EFF3EE',
  paper: '#F6F9F5',
  line: '#DFE7DE',
  clay: '#D94338',
  sage: '#439261',
} as const;

export const CedarTypography = {
  display: 'SpaceGrotesk-Bold', // Amounts & Header numbers
  displayMedium: 'SpaceGrotesk-Medium',
  body: 'Inter-Regular',        // UI body copy
  bodySemiBold: 'Inter-SemiBold', // Buttons, chips, titles
  bodyBold: 'Inter-Bold',
  accent: 'Fraunces-Regular',   // Smart tips & editorial highlights
} as const;

export const CedarSpacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 40,
} as const;

export const CedarRadius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 9999,
} as const;

/**
 * 120Hz Animation Spring Configurations (Reanimated 3 / Native UI Thread)
 */
export const CedarSprings = {
  microTap: { damping: 18, stiffness: 450, mass: 0.6 },
  sheetSnap: { damping: 32, stiffness: 380, mass: 0.8 },
  tabPill: { damping: 25, stiffness: 350 },
  cardFlip: { damping: 28, stiffness: 320, mass: 0.9 },
} as const;
