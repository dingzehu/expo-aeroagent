import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import {
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
import { Animated as RNAnimated } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { supabase } from '../lib/supabase'
import { tokens } from '../constants/tokens'
import { useAppData } from '../context/AppDataContext'
import { useEntryMenu } from '../context/EntryMenuContext'

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <View style={s.topBar}>
      <RNAnimated.View>
        <Pressable
          style={s.dragHandleHitArea}
          onPress={onBack}
          accessibilityLabel="Dismiss"
          {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
        >
          <View style={s.dragHandle} />
        </Pressable>
      </RNAnimated.View>
      <Pressable
        style={s.breadcrumb}
        onPress={onBack}
        {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
      >
        <Ionicons name="chevron-back" size={14} color={tokens.colors.textMuted} />
        <Text style={s.breadcrumbText}>Journal</Text>
      </Pressable>
    </View>
  )
}

function EntrySkeleton() {
  const pulseAnim = useRef(new RNAnimated.Value(0.5)).current
  useEffect(() => {
    const anim = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulseAnim, { toValue: 1,   duration: 700, useNativeDriver: true }),
        RNAnimated.timing(pulseAnim, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])

  return (
    <RNAnimated.View style={[s.contentCard, { opacity: pulseAnim, gap: 12 }]}>
      <View style={[sk.box, { height: 18, width: '95%' }]} />
      <View style={[sk.box, { height: 18, width: '80%' }]} />
      <View style={[sk.box, { height: 18, width: '90%' }]} />
      <View style={[sk.box, { height: 18, width: '65%' }]} />
    </RNAnimated.View>
  )
}

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


export default function JournalEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { removeJournalEntry, updateJournalEntryContent } = useAppData()
  const { registerOpenMenu } = useEntryMenu()
  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [captureRawText, setCaptureRawText] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Context menu + edit state
  const [menuVisible, setMenuVisible] = useState(false)
  const [editVisible, setEditVisible] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  // Register the menu opener so AppHeader's ⋯ button can trigger it
  useEffect(() => {
    registerOpenMenu(() => setMenuVisible(true))
  }, [registerOpenMenu])

  // Content entrance animation
  const contentAnim = useSharedValue(0)
  useEffect(() => {
    if (!loading && entry) {
      contentAnim.value = withSpring(1, { damping: 22, stiffness: 130 })
    }
  }, [loading, entry])
  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentAnim.value,
    transform: [{ translateY: (1 - contentAnim.value) * 18 }],
  }))

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
        <TopBar onBack={() => router.back()} />
        <EntrySkeleton />
      </View>
    )
  }

  if (!entry) {
    return (
      <View style={s.container}>
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
      <TopBar onBack={() => router.back()} />

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={contentStyle}>
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
        </Animated.View>
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
  topBar: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: tokens.colors.bgJournal,
  },
  dragHandleHitArea: {
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: 4,
  },
  dragHandle: {
    width: 56,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.colors.border,
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  breadcrumbText: {
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.textMuted,
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 80,
  },
  contentCard: {
    marginHorizontal: 16,
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
