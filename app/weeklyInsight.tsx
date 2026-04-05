import { tokens } from '../constants/tokens'
import { supabase } from '../lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

type InsightData = {
  tasksCompleted: number
  captureCount: number
  topMood: string | null
  insight: string
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function InsightSkeleton() {
  const pulseAnim = useRef(new Animated.Value(0.5)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])

  return (
    <Animated.View style={{ opacity: pulseAnim, gap: 20 }}>
      {/* Stat pills */}
      <View style={sk.statsRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[sk.box, { width: '30%', height: 72, borderRadius: tokens.radius.xl }]} />
        ))}
      </View>
      {/* Insight card */}
      <View style={[sk.box, { height: 120, borderRadius: tokens.radius.card }]} />
    </Animated.View>
  )
}

const sk = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: 10 },
  box: { backgroundColor: tokens.colors.border },
})

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function WeeklyInsightScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<InsightData | null>(null)

  const contentAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    fetchInsight()
  }, [])

  // Fade + slide in when data arrives
  useEffect(() => {
    if (!loading && data) {
      Animated.timing(contentAnim, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }).start()
    }
  }, [loading, data])

  async function fetchInsight() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Sign in to see your weekly insight.')
        setLoading(false)
        return
      }

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/weekly-insight`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`Server error: ${resp.status} — ${text}`)
      }

      const json = await resp.json()
      if (json.error) throw new Error(json.error)

      setData(json as InsightData)
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Try again later.')
    } finally {
      setLoading(false)
    }
  }

  // Week range label
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
  const weekLabel = `${fmt(weekStart)} – ${fmt(now)}`

  const contentStyle = {
    opacity: contentAnim,
    transform: [{ translateY: contentAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + 16 }]}>
      {/* Drag handle */}
      <View style={s.handle} />

      {/* Close button */}
      <Pressable
        style={s.closeBtn}
        onPress={() => router.back()}
        hitSlop={12}
      >
        <Ionicons name="close" size={22} color={tokens.colors.textTertiary} />
      </Pressable>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.sparkle}>✦</Text>
          <Text style={s.title}>Your Week in Review</Text>
          <Text style={s.subtitle}>{weekLabel}</Text>
        </View>

        {loading && <InsightSkeleton />}

        {!loading && error && (
          <View style={s.errorCard}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {!loading && data && (
          <Animated.View style={[{ gap: 20 }, contentStyle]}>
            {/* Stats row */}
            <View style={s.statsRow}>
              <StatPill
                value={data.tasksCompleted.toString()}
                label="Tasks Done"
                color={tokens.colors.primary}
                bg={tokens.colors.primaryBg}
              />
              <StatPill
                value={data.captureCount.toString()}
                label="Captures"
                color={tokens.colors.success}
                bg="#ECFDF5"
              />
              <StatPill
                value={data.topMood ?? '—'}
                label="Top Mood"
                color={tokens.colors.warning}
                bg="#FFFBEB"
                small={!!data.topMood && data.topMood.length > 6}
              />
            </View>

            {/* AI insight card */}
            <View style={s.insightCard}>
              <View style={s.insightHeader}>
                <Ionicons name="sparkles" size={16} color={tokens.colors.primary} />
                <Text style={s.insightLabel}>AI Observation</Text>
              </View>
              <Text style={s.insightText}>{data.insight}</Text>
            </View>

            {/* Empty week nudge */}
            {data.captureCount === 0 && (
              <View style={s.nudgeCard}>
                <Text style={s.nudgeText}>
                  Start capturing this week — voice or text, anything counts. Your next review will have something to celebrate.
                </Text>
              </View>
            )}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  )
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({
  value,
  label,
  color,
  bg,
  small = false,
}: {
  value: string
  label: string
  color: string
  bg: string
  small?: boolean
}) {
  return (
    <View style={[s.statPill, { backgroundColor: bg }]}>
      <Text style={[s.statValue, { color, fontSize: small ? 15 : 22 }]}>{value}</Text>
      <Text style={[s.statLabel, { color }]}>{label}</Text>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.colors.surface,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.colors.border,
    alignSelf: 'center',
    marginBottom: 8,
  },
  closeBtn: {
    position: 'absolute',
    top: 20,
    right: 16,
    zIndex: 10,
    padding: 6,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 0,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 4,
  },
  sparkle: {
    fontSize: 28,
    color: tokens.colors.primary,
    marginBottom: 4,
  },
  title: {
    fontSize: tokens.fontSize.xxl,
    fontWeight: tokens.fontWeight.bold,
    color: tokens.colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.textMuted,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  statPill: {
    flex: 1,
    borderRadius: tokens.radius.xl,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontWeight: tokens.fontWeight.bold,
  },
  statLabel: {
    fontSize: tokens.fontSize.xxs,
    fontWeight: tokens.fontWeight.semibold,
    opacity: 0.7,
  },
  insightCard: {
    backgroundColor: tokens.colors.primaryBg,
    borderRadius: tokens.radius.card,
    padding: 18,
    gap: 10,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  insightLabel: {
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  insightText: {
    fontSize: tokens.fontSize.base,
    lineHeight: 22,
    color: tokens.colors.textSecondary,
  },
  nudgeCard: {
    backgroundColor: tokens.colors.surfaceAlt,
    borderRadius: tokens.radius.card,
    padding: 16,
  },
  nudgeText: {
    fontSize: tokens.fontSize.sm,
    lineHeight: 20,
    color: tokens.colors.textTertiary,
    textAlign: 'center',
  },
  errorCard: {
    backgroundColor: tokens.colors.errorBg,
    borderRadius: tokens.radius.card,
    padding: 16,
  },
  errorText: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.error,
    textAlign: 'center',
  },
})
