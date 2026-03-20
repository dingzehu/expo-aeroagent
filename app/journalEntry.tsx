import { Ionicons } from '@expo/vector-icons'
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
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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

function formatSlimTitle(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  // e.g. "19 Mar" on most locales
}

function SlimNavBar({
  title,
  onBack,
  onMenuPress,
}: {
  title: string
  onBack: () => void
  onMenuPress: () => void
}) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[navStyles.wrapper, { paddingTop: insets.top }]}>
      <View style={navStyles.bar}>
        <Pressable style={navStyles.backBtn} onPress={onBack}
          {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}>
          <Ionicons name="chevron-back" size={22} color={tokens.colors.textPrimary} />
          <Text style={navStyles.backLabel}>Journal</Text>
        </Pressable>

        <Text style={navStyles.title} numberOfLines={1}>{title}</Text>

        <Pressable style={navStyles.menuBtn} onPress={onMenuPress}
          {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}>
          <Ionicons name="ellipsis-horizontal" size={20} color={tokens.colors.textMuted} />
        </Pressable>
      </View>
    </View>
  )
}

const navStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  bar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 10,
    minWidth: 80,
  },
  backLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.colors.textPrimary,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: tokens.colors.textMuted,
  },
  menuBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'flex-end',
  },
})

export default function JournalEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
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

      <SlimNavBar
        title={formatSlimTitle(entry.created_at)}
        onBack={() => router.back()}
        onMenuPress={() => setMenuVisible(true)}
      />

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
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
    paddingBottom: 80,
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
