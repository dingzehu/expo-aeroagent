import { Ionicons } from '@expo/vector-icons'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { tokens } from '../constants/tokens'

type JournalEntry = {
  id: string
  capture_id: string | null
  content: string
  mood: string | null
  created_at: string
}

type Capture = {
  raw_text: string | null
}

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

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }) + ' at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export default function JournalEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [captureRawText, setCaptureRawText] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return

    ;(async () => {
      const { data: entryData } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('id', id)
        .single()

      if (entryData) {
        setEntry(entryData as JournalEntry)

        if (entryData.capture_id) {
          const { data: captureData } = await supabase
            .from('captures')
            .select('raw_text')
            .eq('id', entryData.capture_id)
            .single()
          if (captureData) setCaptureRawText((captureData as Capture).raw_text)
        }
      }

      setLoading(false)
    })()
  }, [id])

  if (loading) {
    return (
      <View style={s.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={tokens.colors.success} style={{ marginTop: 80 }} />
      </View>
    )
  }

  if (!entry) {
    return (
      <View style={s.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={s.emptyWrap}>
          <Text style={s.emptyTitle}>Entry not found</Text>
          <Pressable style={s.backButton} onPress={() => router.back()}>
            <Text style={s.backButtonText}>Go back</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  const showOriginal = captureRawText && captureRawText.trim() !== entry.content.trim()

  return (
    <View style={s.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Top bar */}
        <View style={s.topBar}>
          <Pressable style={s.backPressable} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={tokens.colors.textPrimary} />
            <Text style={s.backLabel}>Journal</Text>
          </Pressable>
        </View>

        {/* Meta */}
        <View style={s.metaRow}>
          <Text style={s.dateText}>{formatDateTime(entry.created_at)}</Text>
          {entry.mood && (
            <View style={[s.moodBadge, { backgroundColor: moodColor(entry.mood) }]}>
              <Text style={s.moodText}>{entry.mood}</Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={s.contentCard}>
          <Text style={s.contentText}>{entry.content}</Text>
        </View>

        {/* Original capture text */}
        {showOriginal && (
          <View style={s.originalSection}>
            <Text style={s.originalLabel}>Original capture</Text>
            <View style={s.originalCard}>
              <Text style={s.originalText}>{captureRawText}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.surface,
  },
  scrollContent: {
    paddingBottom: 80,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
    ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
  },
  backLabel: {
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    flexWrap: 'wrap',
  },
  dateText: {
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.textTertiary,
  },
  moodBadge: {
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  moodText: {
    fontSize: tokens.fontSize.xs,
    fontWeight: tokens.fontWeight.bold,
    color: '#fff',
    textTransform: 'capitalize',
  },
  contentCard: {
    marginHorizontal: 12,
    marginTop: 8,
    backgroundColor: tokens.colors.surfaceAlt,
    borderRadius: tokens.radius.card,
    padding: 20,
  },
  contentText: {
    fontSize: tokens.fontSize.xl,
    lineHeight: 28,
    color: tokens.colors.textPrimary,
    fontWeight: tokens.fontWeight.regular,
  },
  originalSection: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  originalLabel: {
    fontSize: tokens.fontSize.xs,
    fontWeight: tokens.fontWeight.bold,
    color: tokens.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  originalCard: {
    backgroundColor: tokens.colors.surfaceMuted,
    borderRadius: tokens.radius.lg,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: tokens.colors.border,
  },
  originalText: {
    fontSize: tokens.fontSize.base,
    color: tokens.colors.textTertiary,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.bold,
    color: tokens.colors.textTertiary,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.colors.surfaceMuted,
    ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
  },
  backButtonText: {
    fontSize: tokens.fontSize.base,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.textPrimary,
  },
})
