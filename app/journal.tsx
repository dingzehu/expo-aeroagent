import { Ionicons } from '@expo/vector-icons'
import { Stack, useRouter } from 'expo-router'
import React, { useEffect, useRef } from 'react'
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { tokens } from '../constants/tokens'
import { TabSlideWrapper } from '../components/TabSlideWrapper'
import { useAppData, type JournalEntry } from '../context/AppDataContext'

const MOOD_COLORS: Record<string, string> = {
  happy: tokens.colors.success,
  good: tokens.colors.success,
  great: tokens.colors.success,
  excited: tokens.colors.success,
  grateful: tokens.colors.success,
  calm: '#6366F1',
  relaxed: '#6366F1',
  peaceful: '#6366F1',
  content: '#6366F1',
  sad: '#3B82F6',
  tired: '#3B82F6',
  exhausted: '#3B82F6',
  lonely: '#3B82F6',
  anxious: '#F59E0B',
  stressed: '#F59E0B',
  worried: '#F59E0B',
  nervous: '#F59E0B',
  angry: tokens.colors.error,
  frustrated: tokens.colors.error,
  annoyed: tokens.colors.error,
  irritated: tokens.colors.error,
}

function moodColor(mood: string | null): string {
  if (!mood) return tokens.colors.neutral
  return MOOD_COLORS[mood.toLowerCase()] ?? tokens.colors.neutral
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function dateLabelFor(iso: string): string {
  const date = new Date(iso)
  const today = startOfToday()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (date >= today) return 'Today'
  if (date >= yesterday) return 'Yesterday'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

type Section = { label: string; data: JournalEntry[] }

function JournalSkeleton() {
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
    <Animated.View style={{ opacity: pulseAnim, paddingTop: 8 }}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={[s.entryRow, { marginBottom: 6 }]}>
          <View style={s.entryLeft}>
            <View style={[sk.box, { width: 34, height: 11, borderRadius: 4 }]} />
            <View style={[sk.box, { width: 46, height: 18, borderRadius: 9 }]} />
          </View>
          <View style={{ flex: 1, gap: 7 }}>
            <View style={[sk.box, { height: 13, width: '88%' }]} />
            <View style={[sk.box, { height: 13, width: '60%' }]} />
          </View>
          <View style={[sk.box, { width: 14, height: 14, borderRadius: 4 }]} />
        </View>
      ))}
    </Animated.View>
  )
}

export default function JournalScreen() {
  const router = useRouter()
  const {
    isSignedIn,
    journalEntries: entries,
    journalLoading: loading,
  } = useAppData()

  const sections: Section[] = []
  for (const entry of entries) {
    const label = dateLabelFor(entry.created_at)
    const last = sections[sections.length - 1]
    if (last && last.label === label) {
      last.data.push(entry)
    } else {
      sections.push({ label, data: [entry] })
    }
  }

  if (!isSignedIn) {
    return (
      <TabSlideWrapper tabIndex={3}>
        <View style={s.container}>
          <Stack.Screen options={{ headerShown: false }} />
          <View style={s.emptyWrap}>
            <Text style={s.emptyTitle}>Sign in to see your journal</Text>
          </View>
        </View>
      </TabSlideWrapper>
    )
  }

  return (
    <TabSlideWrapper tabIndex={3}>
    <View style={s.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Journal</Text>
          {entries.length > 0 && (
            <View style={s.countPill}>
              <Text style={s.countPillText}>{entries.length} entries</Text>
            </View>
          )}
        </View>

        {loading ? (
          <JournalSkeleton />
        ) : entries.length === 0 ? (
          <View style={s.emptyWrap}>
            <Ionicons name="book-outline" size={48} color={tokens.colors.border} />
            <Text style={s.emptyTitle}>No journal entries</Text>
            <Text style={s.emptySubtitle}>Share your thoughts to start journaling</Text>
            <Pressable style={s.emptyButton} onPress={() => router.replace('/')}>
              <Ionicons name="flash" size={16} color="#fff" />
              <Text style={s.emptyButtonText}>Go to Capture</Text>
            </Pressable>
          </View>
        ) : (
          sections.map((section) => (
            <View key={section.label}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionHeaderText}>{section.label}</Text>
              </View>
              {section.data.map((entry) => (
                <Pressable
                  key={entry.id}
                  style={s.entryRow}
                  onPress={() => router.push({ pathname: '/journalEntry', params: { id: entry.id } })}
                >
                  <View style={s.entryLeft}>
                    <Text style={s.entryTime}>{formatTime(entry.created_at)}</Text>
                    {entry.mood && (
                      <View style={[s.moodBadge, { backgroundColor: moodColor(entry.mood) }]}>
                        <Text style={s.moodText}>{entry.mood}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.entryContent} numberOfLines={2}>
                    {entry.content}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={tokens.colors.textMuted} />
                </Pressable>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
    </TabSlideWrapper>
  )
}

const sk = StyleSheet.create({
  box: {
    backgroundColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
  },
})

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bgJournal,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: tokens.fontSize.h1,
    fontWeight: tokens.fontWeight.extrabold,
    color: tokens.colors.textPrimary,
  },
  headerCount: {
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.textMuted,
  },
  countPill: {
    backgroundColor: '#DCFCE7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countPillText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#15803D',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionHeaderText: {
    fontSize: tokens.fontSize.base,
    fontWeight: tokens.fontWeight.extrabold,
    color: tokens.colors.textPrimary,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.colors.surface,
    marginHorizontal: 16,
    marginBottom: 6,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    ...tokens.shadow.card,
    ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
  },
  entryLeft: {
    alignItems: 'center',
    gap: 4,
    minWidth: 56,
  },
  entryTime: {
    fontSize: tokens.fontSize.xs,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.textMuted,
  },
  moodBadge: {
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  moodText: {
    fontSize: 10,
    fontWeight: tokens.fontWeight.bold,
    color: '#fff',
    textTransform: 'capitalize',
  },
  entryContent: {
    flex: 1,
    fontSize: tokens.fontSize.base,
    color: tokens.colors.textSecondary,
    lineHeight: 20,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.bold,
    color: tokens.colors.textTertiary,
  },
  emptySubtitle: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.textMuted,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tokens.colors.success,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: tokens.radius.lg,
    marginTop: 12,
    ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
  },
  emptyButtonText: {
    color: '#fff',
    fontWeight: tokens.fontWeight.bold,
    fontSize: tokens.fontSize.base,
  },
})
