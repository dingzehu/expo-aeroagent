import { Platform } from 'react-native'

export const tokens = {
  colors: {
    // Primary — canonical indigo (#6366F1 everywhere; gradient uses primaryDark/primaryLight)
    primary:       '#6366F1',
    primaryDark:   '#4F46E5', // gradient start: ProfileHeader, GradientHeaderBg
    primaryLight:  '#818CF8', // gradient end: PersonaPill, ProfileHeader
    primaryBg:     '#EEF2FF', // tinted backgrounds (mic lock-state, badge container)
    primaryBgSoft: 'rgba(99,102,241,0.06)', // shelf processing tint

    // Status
    success:    '#10B981',
    successDark:'#059669',
    warning:    '#D97706',
    error:      '#DC2626',
    errorBg:    '#FEF2F2',
    neutral:    '#6B7280',

    // Text
    textPrimary:   '#111827',
    textSecondary: '#374151',
    textTertiary:  '#6B7280',
    textMuted:     '#9CA3AF',

    // Surfaces & borders
    surface:      '#fff',
    surfaceAlt:   '#F9FAFB',
    surfaceMuted: '#F3F4F6',
    border:       '#E5E7EB',
    borderStrong: '#ddd',

    // Per-screen tinted backgrounds
    violet:       '#8B5CF6',  // Thoughts accent
    bgTasks:      '#F8F9FF',  // Tasks + Capture (indigo tint)
    bgShopping:   '#FFFBF5',  // Shopping (amber tint)
    bgJournal:    '#F0FDF9',  // Journal + JournalEntry (mint tint)
    bgThoughts:   '#F5F3FF',  // Thoughts (violet tint)
  },

  fontSize: {
    xxs:     10, // badge text
    xs:      11, // canvas label, brand text, hint text
    sm:      12, // card meta, small labels
    md:      13, // persona pill, row preview
    base:    14, // body text, capture text
    lg:      15, // popover item text, back btn
    xl:      16, // input text, button text
    xxl:     18, // drawer title, stack header
    h2:      22, // name text in ProfileHeader
    h1:      24, // auth title, task manager title
    display: 28, // avatar initials
  },

  fontWeight: {
    regular:   '500' as const,
    semibold:  '600' as const,
    bold:      '700' as const,
    extrabold: '800' as const,
    black:     '900' as const,
  },

  // 4-unit base spacing scale
  space: {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    7: 28,
    8: 32,
  },

  radius: {
    sm:   6,
    md:   8,
    lg:   10,
    xl:   12,
    xxl:  14,
    card: 16,
    pill: 999,
  },

  shadow: {
    card: Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
      web:     { boxShadow: '0 1px 4px rgba(0,0,0,0.04)' } as object,
      default: {},
    }),
    popover: Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 12 },
      android: { elevation: 8 },
      web:     { boxShadow: '0 4px 12px rgba(0,0,0,0.10)' } as object,
      default: {},
    }),
  },
  animation: {
    tabScale:           1.28,
    tabSpringFriction:  8,
    tabSpringTension:   80,
    tabSlideDuration:   280,   // ms — tab screen slide-in
    labelFadeDuration:  200,   // ms — label fade-in
    labelFadeDelay:     50,    // ms — label fade-in delay
  },
} as const
