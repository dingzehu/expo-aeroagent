import { tokens } from '../constants/tokens'
import { supabase } from '../lib/supabase'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function WelcomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  // Guard: authenticated users must not land here
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/')
    })
  }, [])

  return (
    <View style={styles.root}>
      {/* ── Gradient header ── */}
      <LinearGradient
        colors={[tokens.colors.primaryDark, tokens.colors.primaryLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 28 }]}
      >
        <Text style={styles.lightning}>⚡</Text>
        <Text style={styles.appName}>AeroAgent</Text>
      </LinearGradient>

      {/* ── Scrollable body ── */}
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Example capture cards */}
        <View style={styles.cardsSection}>
          <CaptureCard
            text="buy oat milk and bread"
            badge="🛒  Shopping"
            badgeBg="#FFF7ED"
            badgeColor={tokens.colors.warning}
            detail="2 items"
          />
          <CaptureCard
            text="call dentist tomorrow 9am"
            badge="✓  Task"
            badgeBg={tokens.colors.primaryBg}
            badgeColor={tokens.colors.primary}
            detail="Tomorrow"
          />
          <CaptureCard
            text="feeling really grateful today"
            badge="📔  Journal"
            badgeBg="#ECFDF5"
            badgeColor={tokens.colors.success}
            detail="Mood: grateful"
          />
        </View>

        {/* Headline */}
        <View style={styles.headline}>
          <Text style={styles.headlineText}>
            Capture anything.{'\n'}AI organises it.
          </Text>
          <Text style={styles.subtext}>
            Voice or text. Always sorted. Always instant.
          </Text>
        </View>

        {/* CTAs */}
        <View style={styles.actions}>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.push('/auth/sign-up')}
            {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
          >
            <Text style={styles.primaryBtnText}>Create Account</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/auth/sign-in')}
            style={styles.signInLink}
            {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
          >
            <Text style={styles.signInLinkText}>Sign In</Text>
          </Pressable>

          <Text style={styles.finePrint}>Free to start · No credit card required</Text>
        </View>
      </ScrollView>
    </View>
  )
}

// ─── Example capture card ────────────────────────────────────────────────────

function CaptureCard({
  text,
  badge,
  badgeBg,
  badgeColor,
  detail,
}: {
  text: string
  badge: string
  badgeBg: string
  badgeColor: string
  detail: string
}) {
  return (
    <View style={card.root}>
      <Text style={card.text}>"{text}"</Text>
      <View style={card.footer}>
        <View style={[card.badge, { backgroundColor: badgeBg }]}>
          <Text style={[card.badgeText, { color: badgeColor }]}>{badge}</Text>
        </View>
        <Text style={card.detail}>{detail}</Text>
      </View>
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.colors.surface,
  },
  header: {
    alignItems: 'center',
    paddingBottom: 32,
    gap: 4,
  },
  lightning: {
    fontSize: 36,
  },
  appName: {
    fontSize: 32,
    fontWeight: tokens.fontWeight.black,
    color: '#fff',
    letterSpacing: -0.5,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 0,
  },
  cardsSection: {
    gap: 10,
    marginBottom: 32,
  },
  headline: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 36,
  },
  headlineText: {
    fontSize: 28,
    fontWeight: tokens.fontWeight.black,
    color: tokens.colors.textPrimary,
    textAlign: 'center',
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  subtext: {
    fontSize: tokens.fontSize.base,
    color: tokens.colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  actions: {
    gap: 14,
    alignItems: 'center',
  },
  primaryBtn: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.xl,
    paddingVertical: 16,
    alignItems: 'center',
    alignSelf: 'stretch',
    ...Platform.select({
      ios:     { shadowColor: tokens.colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 4 },
      web:     { boxShadow: `0 4px 12px ${tokens.colors.primary}40` } as object,
      default: {},
    }),
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: tokens.fontSize.xl,
    fontWeight: tokens.fontWeight.bold,
  },
  signInLink: {
    paddingVertical: 8,
  },
  signInLinkText: {
    color: tokens.colors.primary,
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.semibold,
  },
  finePrint: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.textMuted,
    marginTop: 4,
  },
})

const card = StyleSheet.create({
  root: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.card,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 1 },
      web:     { boxShadow: '0 1px 6px rgba(0,0,0,0.06)' } as object,
      default: {},
    }),
  },
  text: {
    fontSize: tokens.fontSize.base,
    color: tokens.colors.textSecondary,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.semibold,
  },
  detail: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.textMuted,
  },
})
