import { Ionicons } from '@expo/vector-icons'
import type { Session } from '@supabase/supabase-js'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { supabase } from '../../lib/supabase'

// ─── Types ─────────────────────────────────────────────────────────────────────

type Note = {
  id: string
  title: string | null
  raw_content: string | null
  updated_at: string
  created_at: string
}

type Notebook = {
  id: string
  name: string
  colour_tag: string | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function excerpt(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || '—'
}

// ─── Note Card ─────────────────────────────────────────────────────────────────

function NoteCard({
  note,
  accentColor,
  onPress,
  onMore,
}: {
  note: Note
  accentColor: string
  onPress: () => void
  onMore: (e: any) => void
}) {
  return (
    <Pressable style={card.wrap} onPress={onPress}>
      <View style={[card.accent, { backgroundColor: accentColor }]} />
      <View style={card.body}>
        <Text style={card.title} numberOfLines={1}>{note.title || 'Untitled'}</Text>
        <Text style={card.preview} numberOfLines={2}>{excerpt(note.raw_content)}</Text>
        <Text style={card.meta}>{timeAgo(note.updated_at)}</Text>
      </View>
      <Pressable
        hitSlop={10}
        onPress={(e) => { e.stopPropagation?.(); onMore(e) }}
        style={card.moreBtn}
      >
        <Ionicons name="menu-outline" size={20} color="#666" />
      </Pressable>
    </Pressable>
  )
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function NotebookDetailScreen() {
  const { notebookId } = useLocalSearchParams<{ notebookId: string }>()
  const router = useRouter()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()

  const [notebook, setNotebook] = useState<Notebook | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)

  // Consolidated popover state for smooth transitions
  const [popoverMode, setPopoverMode] = useState<'actions' | 'picker' | null>(null)
  const [noteActionsTarget, setNoteActionsTarget] = useState<Note | null>(null)
  const [noteActionsAnchor, setNoteActionsAnchor] = useState<{ x: number; y: number } | null>(null)

  // Notebook picker state
  const [notebookPickerAnchor, setNotebookPickerAnchor] = useState<{ x: number; y: number } | null>(null)
  const [notebookOptions, setNotebookOptions] = useState<Notebook[]>([])
  const [loadingNotebookOptions, setLoadingNotebookOptions] = useState(false)
  const [assigningNotebookId, setAssigningNotebookId] = useState<string | null>(null)

  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const accentColor = notebook?.colour_tag || '#6366F1'

  const fetchData = useCallback(async () => {
    if (!notebookId) return
    setLoading(true)

    const [nbRes, notesRes] = await Promise.all([
      supabase
        .from('notebooks')
        .select('id, name, colour_tag')
        .eq('id', notebookId)
        .single(),
      supabase
        .from('notes')
        .select('id, title, raw_content, updated_at, created_at')
        .eq('notebook_id', notebookId)
        .order('updated_at', { ascending: false }),
    ])

    if (nbRes.data) setNotebook(nbRes.data as Notebook)
    if (notesRes.data) setNotes(notesRes.data as Note[])
    setLoading(false)
  }, [notebookId])

  useEffect(() => { fetchData() }, [fetchData])

  // Real-time subscription for notebook detail
  useEffect(() => {
    const userId = session?.user?.id
    if (!userId || !notebookId) return

    console.log('[Realtime] Subscribing to notebook detail:', notebookId)
    const channel = supabase
      .channel(`public:notebook_detail:${notebookId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${userId}` },
        (payload) => {
          console.log('[Realtime] Note change in detail:', payload.eventType)
          fetchData()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notebooks', filter: `id=eq.${notebookId}` },
        (payload) => {
          console.log('[Realtime] Notebook metadata change:', payload.eventType)
          fetchData()
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Notebook detail status:', status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session?.user?.id, notebookId, fetchData])

  const openNoteActionsAt = useCallback((note: Note, e?: any) => {
    const x = e?.nativeEvent?.pageX ?? windowWidth - 16
    const y = e?.nativeEvent?.pageY ?? 120
    setNoteActionsAnchor({ x, y })
    setNoteActionsTarget(note)
    setPopoverMode('actions')
  }, [windowWidth])

  const closeNoteActions = () => {
    setPopoverMode(null)
    setNoteActionsAnchor(null)
  }

  const openNotebookPicker = async (note: Note, e?: any) => {
    const x = e?.nativeEvent?.pageX ?? noteActionsAnchor?.x ?? windowWidth - 16
    const y = e?.nativeEvent?.pageY ?? noteActionsAnchor?.y ?? 120
    setNotebookPickerAnchor({ x, y })
    setNoteActionsTarget(note)
    setPopoverMode('picker')
    setLoadingNotebookOptions(true)

    const { data: { session: s } } = await supabase.auth.getSession()
    if (!s?.user) { setLoadingNotebookOptions(false); return }

    const { data, error } = await supabase
      .from('notebooks')
      .select('id, name, colour_tag')
      .eq('user_id', s.user.id)
      .order('created_at', { ascending: false })

    setLoadingNotebookOptions(false)
    if (!error && data) setNotebookOptions(data as Notebook[])
  }

  const handleAssignNotebook = async (targetNotebookId: string | null) => {
    if (!noteActionsTarget) return
    const targetNoteId = noteActionsTarget.id
    setAssigningNotebookId(targetNotebookId ?? '__remove__')

    const { error } = await supabase
      .from('notes')
      .update({ notebook_id: targetNotebookId })
      .eq('id', targetNoteId)

    setAssigningNotebookId(null)
    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    if (targetNotebookId !== notebookId) {
      setNotes((prev) => prev.filter((n) => n.id !== targetNoteId))
    }
    setPopoverMode(null)
  }

  const handleDelete = (note: Note) => {
    Alert.alert(
      `Delete "${note.title || 'Untitled'}"?`,
      'This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('notes').delete().eq('id', note.id)
            if (error) { Alert.alert('Error', error.message); return }
            setNotes((prev) => prev.filter((n) => n.id !== note.id))
          },
        },
      ]
    )
  }

  const openEditor = (note?: Note) => {
    if (note) {
      router.push({
        pathname: '/notes',
        params: { notebookId, noteId: note.id } as any
      })
    } else {
      router.push({
        pathname: '/notes',
        params: { notebookId } as any
      })
    }
  }

  return (
    <View style={s.screen}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable onPress={() => router.replace('/')} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111' }}>Aero Agent</Text>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#999', marginHorizontal: 8 }}>/</Text>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: accentColor }}>{notebook?.name ?? 'Notebook'}</Text>
            </Pressable>
          ),
          headerTintColor: accentColor,
          headerRight: () => (
            <Pressable onPress={() => openEditor()} style={{ paddingHorizontal: 14, paddingVertical: 6 }}>
              <Ionicons name="add" size={26} color={accentColor} />
            </Pressable>
          ),
        }}
      />

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      ) : notes.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="document-text-outline" size={56} color="#e0e0e0" />
          <Text style={s.emptyTitle}>No notes in this notebook</Text>
          <Text style={s.emptySubtitle}>Tap + to write your first note.</Text>
          <Pressable style={[s.createBtn, { backgroundColor: accentColor }]} onPress={() => openEditor()}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={s.createBtnText}>New Note</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          <Text style={s.sectionLabel}>{notes.length} note{notes.length !== 1 ? 's' : ''}</Text>
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              accentColor={accentColor}
              onPress={() => openEditor(note)}
              onMore={(e) => openNoteActionsAt(note, e)}
            />
          ))}
        </ScrollView>
      )}

      {/* Anchored Popover (combined actions + picker for smooth web transitions) */}
      <Modal
        transparent
        visible={!!popoverMode}
        animationType="fade"
        onRequestClose={() => setPopoverMode(null)}
      >
        <View style={StyleSheet.absoluteFillObject}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setPopoverMode(null)} />

          {popoverMode === 'actions' && (() => {
            const MENU_W = 220
            const anchorX = noteActionsAnchor?.x ?? windowWidth - 16
            const anchorY = noteActionsAnchor?.y ?? 120
            const left = Math.min(Math.max(anchorX - MENU_W + 10, 8), windowWidth - MENU_W - 8)
            const top = Math.min(Math.max(anchorY + 10, 8), windowHeight - 160)
            const tipLeft = Math.min(Math.max(anchorX - left - 10, 14), MENU_W - 26)

            return (
              <View style={[popover.menu, { width: MENU_W, left, top }]}>
                <View style={[popover.tipBorder, { left: tipLeft }]} />
                <View style={[popover.tip, { left: tipLeft }]} />

                <Text style={popover.menuTitle} numberOfLines={1}>
                  {noteActionsTarget?.title || '(Untitled)'}
                </Text>

                <Pressable style={popover.menuItem} onPress={() => {
                  const target = noteActionsTarget
                  if (!target) return
                  setPopoverMode(null)
                  openEditor(target)
                }}>
                  <Ionicons name="create-outline" size={18} color="#374151" />
                  <Text style={popover.menuItemText}>Open in Editor</Text>
                </Pressable>

                <Pressable style={popover.menuItem} onPress={() => {
                  if (!noteActionsTarget) return
                  const target = noteActionsTarget
                  const anchor = { nativeEvent: { pageX: anchorX, pageY: anchorY } }
                  openNotebookPicker(target, anchor)
                }}>
                  <Ionicons name="book-outline" size={18} color="#374151" />
                  <Text style={popover.menuItemText}>Move to Notebook</Text>
                </Pressable>

                <Pressable style={popover.menuItemDanger} onPress={() => {
                  if (!noteActionsTarget) return
                  const target = noteActionsTarget
                  setPopoverMode(null)
                  handleDelete(target)
                }}>
                  <Ionicons name="trash-outline" size={18} color="#991b1b" />
                  <Text style={popover.menuItemDangerText}>Delete Note</Text>
                </Pressable>
              </View>
            )
          })()}

          {popoverMode === 'picker' && (() => {
            const MENU_W = 240
            const anchorX = notebookPickerAnchor?.x ?? windowWidth - 16
            const anchorY = notebookPickerAnchor?.y ?? 120
            const left = Math.min(Math.max(anchorX - MENU_W + 10, 8), windowWidth - MENU_W - 8)
            const top = Math.min(Math.max(anchorY + 10, 8), windowHeight - 320)
            const tipLeft = Math.min(Math.max(anchorX - left - 10, 14), MENU_W - 26)

            return (
              <View style={[popover.menu, { width: MENU_W, left, top }]}>
                <View style={[popover.tipBorder, { left: tipLeft }]} />
                <View style={[popover.tip, { left: tipLeft }]} />

                <Text style={popover.menuTitle}>Move to Notebook</Text>
                {loadingNotebookOptions ? (
                  <ActivityIndicator size="small" color="#6366F1" style={{ marginVertical: 16 }} />
                ) : (
                  <ScrollView style={{ maxHeight: 200 }} bounces={false}>
                    {notebookOptions.map((nb) => {
                      const iconColor = nb.colour_tag || '#6366F1'
                      const isActive = nb.id === notebookId
                      return (
                        <Pressable
                          key={nb.id}
                          style={[popover.menuItem, isActive && { backgroundColor: '#EEF2FF' }]}
                          onPress={() => handleAssignNotebook(nb.id)}
                          disabled={!!assigningNotebookId}
                        >
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: iconColor }} />
                          <Text style={[popover.menuItemText, isActive && { color: '#6366F1' }]} numberOfLines={1}>
                            {nb.name}
                          </Text>
                          {isActive && <Ionicons name="checkmark" size={14} color={iconColor} />}
                        </Pressable>
                      )
                    })}
                    {notebookId && (
                      <Pressable style={popover.menuItemDanger} onPress={() => handleAssignNotebook(null)}>
                        <Text style={popover.menuItemDangerText}>Remove from notebook</Text>
                      </Pressable>
                    )}
                  </ScrollView>
                )}
                <Pressable style={popover.cancelBtn} onPress={() => setPopoverMode(null)}>
                  <Text style={popover.cancelText}>Cancel</Text>
                </Pressable>
              </View>
            )
          })()}
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { marginTop: 16, fontSize: 17, fontWeight: '700', color: '#888', textAlign: 'center' },
  emptySubtitle: { marginTop: 6, fontSize: 14, color: '#aaa', textAlign: 'center', maxWidth: 260 },
  createBtn: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  list: { padding: 16, gap: 12 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#aaa',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
})

const card = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  body: { flex: 1, paddingLeft: 8 },
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  preview: { marginTop: 3, fontSize: 12, color: '#999', lineHeight: 16 },
  meta: { marginTop: 6, fontSize: 11, color: '#bbb', fontWeight: '500' },
  moreBtn: { padding: 8, backgroundColor: '#f0f0f0', borderRadius: 20 },
})

const popover = StyleSheet.create({
  menu: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  tipBorder: {
    position: 'absolute',
    top: -9,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#e5e7eb',
  },
  tip: {
    position: 'absolute',
    top: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#fff',
  },
  menuTitle: { fontSize: 12, fontWeight: '800', color: '#111827', marginBottom: 8, paddingHorizontal: 4 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    marginTop: 6,
  },
  menuItemText: { fontSize: 13, fontWeight: '800', color: '#111827' },
  menuItemDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    marginTop: 6,
  },
  menuItemDangerText: { fontSize: 13, fontWeight: '900', color: '#991b1b' },
  cancelBtn: { marginTop: 8, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: '#F3F4F6' },
  cancelText: { fontSize: 13, fontWeight: '800', color: '#4b5563' },
})
