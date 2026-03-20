import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { tokens } from '../constants/tokens'
import { useAppData } from '../context/AppDataContext'

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

function EntryHeader({
  entry,
  onBack,
  onMenuPress,
}: {
  entry: JournalEntry
  onBack: () => void
  onMenuPress: () => void
}) {
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()
  return (
    <View style={[hStyles.container, { height: screenHeight * 0.15, paddingTop: insets.top }]}>
      <LinearGradient
        colors={[tokens.colors.primaryDark, tokens.colors.primaryLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={hStyles.circle1} pointerEvents="none" />
      <View style={hStyles.circle2} pointerEvents="none" />

      <Pressable
        style={[hStyles.backBtn, { top: insets.top + 8 }]}
        onPress={onBack}
        {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
      >
        <Ionicons name="chevron-back" size={20} color="#fff" />
        <Text style={hStyles.backLabel}>Journal</Text>
      </Pressable>

      <Pressable
        style={[hStyles.menuBtn, { top: insets.top + 10 }]}
        onPress={onMenuPress}
        {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
      >
        <Ionicons name="ellipsis-horizontal" size={22} color="rgba(255,255,255,0.8)" />
      </Pressable>

      <View style={hStyles.content}>
        <View style={hStyles.iconWrap}>
          <Ionicons name="book" size={26} color="#fff" />
        </View>
        <View style={hStyles.info}>
          <Text style={hStyles.brandLabel}>Journal</Text>
          <Text style={hStyles.dateText} numberOfLines={1}>{formatDateTime(entry.created_at)}</Text>
          {entry.mood && (
            <View style={[hStyles.moodBadge, { backgroundColor: moodColor(entry.mood) }]}>
              <Text style={hStyles.moodText}>{entry.mood}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  )
}

const hStyles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: tokens.colors.primaryDark,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 16,
    position: 'relative',
  },
  circle1: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.05)',
    top: -50,
    right: -50,
  },
  circle2: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
    bottom: -30,
    left: '20%',
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  backLabel: {
    color: '#fff',
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.semibold,
  },
  menuBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 20,
    padding: 4,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    zIndex: 10,
    gap: 14,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 3,
  },
  brandLabel: {
    fontSize: tokens.fontSize.xs,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: tokens.fontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  dateText: {
    fontSize: tokens.fontSize.base,
    color: '#fff',
    fontWeight: tokens.fontWeight.bold,
    letterSpacing: -0.2,
  },
  moodBadge: {
    alignSelf: 'flex-start',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 2,
  },
  moodText: {
    fontSize: tokens.fontSize.xs,
    fontWeight: tokens.fontWeight.bold,
    color: '#fff',
    textTransform: 'capitalize',
  },
})

export default function JournalEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { removeJournalEntry, updateJournalEntryContent } = useAppData()
  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [captureRawText, setCaptureRawText] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Context menu + edit state
  const [menuVisible, setMenuVisible] = useState(false)
  const [editVisible, setEditVisible] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

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

  const handleDelete = () => {
    setMenuVisible(false)
    const doDelete = async () => {
      await supabase.from('journal_entries').delete().eq('id', id)
      removeJournalEntry(id)
      router.back()
    }
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this journal entry? This cannot be undone.')) doDelete()
    } else {
      Alert.alert('Delete Entry', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ])
    }
  }

  const openEdit = () => {
    setEditContent(entry?.content ?? '')
    setMenuVisible(false)
    setEditVisible(true)
  }

  const handleSaveEdit = async () => {
    if (!entry || !editContent.trim()) return
    setSaving(true)
    await supabase.from('journal_entries').update({ content: editContent.trim() }).eq('id', entry.id)
    setEntry(prev => prev ? { ...prev, content: editContent.trim() } : prev)
    updateJournalEntryContent(entry.id, editContent.trim())
    setSaving(false)
    setEditVisible(false)
  }

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

      <EntryHeader
        entry={entry}
        onBack={() => router.back()}
        onMenuPress={() => setMenuVisible(true)}
      />

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
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

      {/* Context menu */}
      <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={s.menuBackdrop} onPress={() => setMenuVisible(false)} />
        <View style={s.menuSheet}>
          <Pressable style={s.menuItem} onPress={openEdit}>
            <Ionicons name="create-outline" size={18} color={tokens.colors.textPrimary} />
            <Text style={s.menuItemText}>Edit</Text>
          </Pressable>
          <View style={s.menuDivider} />
          <Pressable style={s.menuItem} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={18} color={tokens.colors.error} />
            <Text style={[s.menuItemText, { color: tokens.colors.error }]}>Delete</Text>
          </Pressable>
        </View>
      </Modal>

      {/* Edit sheet */}
      <Modal transparent visible={editVisible} animationType="slide" onRequestClose={() => setEditVisible(false)}>
        <Pressable style={s.menuBackdrop} onPress={() => setEditVisible(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.editSheet}
        >
          <View style={s.editHandle} />
          <Text style={s.editTitle}>Edit Entry</Text>
          <TextInput
            style={s.editInput}
            value={editContent}
            onChangeText={setEditContent}
            multiline
            autoFocus
            textAlignVertical="top"
            placeholder="Write your journal entry…"
            placeholderTextColor={tokens.colors.textMuted}
          />
          <Pressable
            style={[s.editSaveBtn, saving && { opacity: 0.5 }]}
            onPress={handleSaveEdit}
            disabled={saving}
          >
            <Text style={s.editSaveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bgJournal,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 80,
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

  // Context menu
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  menuSheet: {
    position: 'absolute',
    top: 56,
    right: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    overflow: 'hidden',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 },
      android: { elevation: 8 },
      web:     { boxShadow: '0 4px 12px rgba(0,0,0,0.12)' } as object,
    }),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minWidth: 160,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.colors.textPrimary,
  },
  menuDivider: {
    height: 1,
    backgroundColor: tokens.colors.border,
    marginHorizontal: 8,
  },

  // Edit sheet
  editSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '75%',
  },
  editHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  editTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.colors.textPrimary,
    marginBottom: 12,
  },
  editInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: tokens.colors.textPrimary,
    minHeight: 160,
    maxHeight: 300,
  },
  editSaveBtn: {
    marginTop: 14,
    backgroundColor: tokens.colors.success,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  editSaveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
})
