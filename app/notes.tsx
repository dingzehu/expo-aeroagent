import { Ionicons, MaterialIcons } from '@expo/vector-icons'
import type { Session } from '@supabase/supabase-js'
import * as Haptics from 'expo-haptics'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import type { AuthMode } from '../components/Auth'
import Auth from '../components/Auth'
import { NoteEditorCard } from '../components/NoteEditorCard'
import { PersonaPill } from '../components/PersonaPill'
import {
  type PersonaId,
  PERSONAS,
  PERSONA_HELP,
  useNoteEditor,
} from '../lib/noteHelpers'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type NotebookListItem = {
  id: string
  title: string | null
  updated_at: string | null
  notebook_id?: string | null
}

type NotebookData = { id: string; name: string; colour_tag: string | null }
type NotebookOption = { id: string; name: string; colour_tag: string | null }

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NotebookScreen() {
  const router = useRouter()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const isNarrow = windowWidth < 768

  const { noteId: noteIdParam, notebookId: notebookIdParam } = useLocalSearchParams<{
    noteId?: string
    notebookId?: string
    new?: string
  }>()

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [session, setSession] = useState<Session | null>(null)
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [savedDrawerVisible, setSavedDrawerVisible] = useState(false)
  const [authVisible, setAuthVisible] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('signIn')

  const drawerAnim = useRef(new Animated.Value(0)).current
  const drawerWidth = 340
  const savedDrawerAnim = useRef(new Animated.Value(0)).current
  const savedDrawerWidth = Math.min(360, Math.round(windowWidth * 0.92))

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // ── Drawer animations ─────────────────────────────────────────────────────
  const closeDrawer = useCallback(() => {
    Animated.timing(drawerAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(
      ({ finished }) => { if (finished) setDrawerVisible(false) },
    )
  }, [drawerAnim])

  const openSavedDrawer = useCallback(() => {
    if (drawerVisible) closeDrawer()
    savedDrawerAnim.stopAnimation(() => {
      setSavedDrawerVisible(true)
      Animated.timing(savedDrawerAnim, {
        toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start()
    })
  }, [closeDrawer, drawerVisible, savedDrawerAnim])

  const closeSavedDrawer = useCallback(() => {
    savedDrawerAnim.stopAnimation(() => {
      Animated.timing(savedDrawerAnim, {
        toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start(({ finished }) => { if (finished) setSavedDrawerVisible(false) })
    })
  }, [savedDrawerAnim])

  // ── Notebook context ──────────────────────────────────────────────────────
  const [currentNotebookId, setCurrentNotebookId] = useState<string | null>(notebookIdParam ?? null)
  const [currentNotebookName, setCurrentNotebookName] = useState<string | null>(null)

  // ── Saved notes list ──────────────────────────────────────────────────────
  const [loadingList, setLoadingList] = useState(false)
  const [notebookList, setNotebookList] = useState<NotebookListItem[]>([])
  const [savedSearch, setSavedSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ── Popover state ─────────────────────────────────────────────────────────
  const [popoverMode, setPopoverMode] = useState<'actions' | 'picker' | null>(null)
  const [noteActionsTarget, setNoteActionsTarget] = useState<NotebookListItem | null>(null)
  const [noteActionsAnchor, setNoteActionsAnchor] = useState<{ x: number; y: number } | null>(null)
  const [notebookPickerNote, setNotebookPickerNote] = useState<NotebookListItem | null>(null)
  const [notebookPickerAnchor, setNotebookPickerAnchor] = useState<{ x: number; y: number } | null>(null)
  const [notebookOptions, setNotebookOptions] = useState<NotebookOption[]>([])
  const [loadingNotebookOptions, setLoadingNotebookOptions] = useState(false)
  const [assigningNotebookId, setAssigningNotebookId] = useState<string | null>(null)

  // ── All notebooks (for grouping) ──────────────────────────────────────────
  const [allNotebooks, setAllNotebooks] = useState<NotebookData[]>([])
  const [expandedNotebookIds, setExpandedNotebookIds] = useState<string[]>(['__none__'])

  // ── Debug state ───────────────────────────────────────────────────────────
  const [aiLastRun, setAiLastRun] = useState<{ persona: PersonaId; at: number } | null>(null)

  // ── useNoteEditor hook ────────────────────────────────────────────────────
  const bumpNotebookListItem = useCallback((id: string, noteTitle: string, updatedAt: string) => {
    setNotebookList((prev) => {
      const next = prev.filter((x) => x.id !== id)
      return [{ id, title: noteTitle || null, updated_at: updatedAt }, ...next]
    })
  }, [])

  const editor = useNoteEditor({
    session,
    useLegacyFallback: true,
    notebookId: currentNotebookId,
    onNoteCreated: bumpNotebookListItem,
    onNoteUpdated: bumpNotebookListItem,
  })

  // ── Load all notebooks ────────────────────────────────────────────────────
  const loadAllNotebooks = useCallback(async () => {
    const userId = session?.user?.id
    if (!userId) return
    const { data } = await supabase.from('notebooks').select('id, name, colour_tag').eq('user_id', userId)
    if (data) setAllNotebooks(data as NotebookData[])
  }, [session?.user?.id])

  useEffect(() => { loadAllNotebooks() }, [loadAllNotebooks])

  // ── Filtered + grouped notes ──────────────────────────────────────────────
  const filteredNotebookList = useMemo(() => {
    const q = savedSearch.trim().toLowerCase()
    if (!q) return notebookList
    return notebookList.filter((n) => ((n.title ?? '').trim() || '').toLowerCase().includes(q))
  }, [notebookList, savedSearch])

  const groupedNotes = useMemo(() => {
    const groups: Record<string, { notebookId: string | null; notebookName: string; colour: string | null; notes: NotebookListItem[] }> = {}
    groups['__none__'] = { notebookId: null, notebookName: 'General Notes', colour: null, notes: [] }
    allNotebooks.forEach(nb => {
      groups[nb.id] = { notebookId: nb.id, notebookName: nb.name, colour: nb.colour_tag, notes: [] }
    })
    filteredNotebookList.forEach(note => {
      const nid = note.notebook_id || '__none__'
      if (!groups[nid]) {
        groups[nid] = { notebookId: nid, notebookName: 'Other', colour: null, notes: [] }
      }
      groups[nid].notes.push(note)
    })
    return Object.values(groups).filter(g => g.notes.length > 0)
  }, [allNotebooks, filteredNotebookList])

  const toggleGroupExpand = (id: string) => {
    setExpandedNotebookIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    )
  }

  // ── Load saved notes list ─────────────────────────────────────────────────
  const loadNotebookList = useCallback(async () => {
    const userId = session?.user?.id
    if (!userId) { setNotebookList([]); return }
    setLoadingList(true)
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('id,title,updated_at,notebook_id')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
      if (error) throw error
      setNotebookList((data ?? []) as NotebookListItem[])
    } catch (e: any) {
      Alert.alert('Failed to load notes', e?.message ?? 'Unknown error')
    } finally {
      setLoadingList(false)
    }
  }, [session?.user?.id])

  useEffect(() => { loadNotebookList() }, [loadNotebookList])

  // ── Realtime subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return
    const channel = supabase
      .channel('public:notes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${userId}` },
        (payload) => {
          loadNotebookList()
          if (payload.eventType === 'UPDATE') {
            const updatedNote = payload.new as NotebookListItem
            if (updatedNote.id === editor.noteId) {
              setCurrentNotebookId(updatedNote.notebook_id ?? null)
            }
          } else if (payload.eventType === 'DELETE') {
            if (editor.noteId === (payload.old as any).id) {
              editor.setNoteId(null)
            }
          }
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session?.user?.id, editor.noteId, loadNotebookList, editor])

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return
    const channel = supabase
      .channel('public:notebooks')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notebooks', filter: `user_id=eq.${userId}` },
        () => { loadAllNotebooks() },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session?.user?.id, loadAllNotebooks])

  // ── Auto-load note from URL param ─────────────────────────────────────────
  useEffect(() => {
    if (noteIdParam && session?.user?.id) {
      loadNotebookById(noteIdParam)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteIdParam, session?.user?.id])

  // ── Resolve notebook name ─────────────────────────────────────────────────
  useEffect(() => {
    if (!currentNotebookId) { setCurrentNotebookName(null); return }
    supabase
      .from('notebooks')
      .select('name')
      .eq('id', currentNotebookId)
      .single()
      .then(({ data }) => setCurrentNotebookName(data?.name ?? null))
  }, [currentNotebookId])

  // ── Load note into editor ─────────────────────────────────────────────────
  const loadNotebookById = useCallback(
    async (id: string) => {
      const userId = session?.user?.id
      if (!userId) return
      try {
        try {
          const { data, error } = await supabase
            .from('notes')
            .select('id,title,raw_content,formatted_content,selected_style,updated_at,notebook_id')
            .eq('user_id', userId)
            .eq('id', id)
            .single()
          if (error) throw error
          editor.loadIntoEditor(data)
          setCurrentNotebookId(data.notebook_id ?? null)
          return
        } catch {
          const { data, error } = await supabase
            .from('notes')
            .select('id,title,body,updated_at')
            .eq('user_id', userId)
            .eq('id', id)
            .single()
          if (error) throw error
          editor.loadIntoEditor({
            id: data.id,
            title: data.title,
            raw_content: (data as any).body ?? '',
          })
        }
      } catch (e: any) {
        Alert.alert('Failed to load note', e?.message ?? 'Unknown error')
      }
    },
    [editor, session?.user?.id],
  )

  // ── Delete note ───────────────────────────────────────────────────────────
  const deleteNotebookById = useCallback(
    async (id: string) => {
      const userId = session?.user?.id
      if (!userId) { Alert.alert('Login required', 'Please login before deleting notes.'); return }
      setDeletingId(id)
      try {
        const { error } = await supabase.from('notes').delete().eq('id', id).eq('user_id', userId)
        if (error) throw error
        if (editor.noteId === id) editor.clearEditor()
        await loadNotebookList()
      } catch (e: any) {
        Alert.alert('Delete failed', e?.message ?? 'Unknown error')
      } finally {
        setDeletingId(null)
      }
    },
    [editor, loadNotebookList, session?.user?.id],
  )

  // ── Note actions popover ──────────────────────────────────────────────────
  const openNoteActionsAt = useCallback(
    (note: NotebookListItem, e: any) => {
      const x = e?.nativeEvent?.pageX ?? windowWidth - 16
      const y = e?.nativeEvent?.pageY ?? 120
      setNoteActionsAnchor({ x, y })
      setNoteActionsTarget(note)
      setPopoverMode('actions')
    },
    [windowWidth],
  )

  // ── Notebook picker ───────────────────────────────────────────────────────
  const openNotebookPicker = useCallback(async (note: NotebookListItem, e?: any) => {
    const x = e?.nativeEvent?.pageX ?? noteActionsAnchor?.x ?? windowWidth - 16
    const y = e?.nativeEvent?.pageY ?? noteActionsAnchor?.y ?? 120
    setNotebookPickerAnchor({ x, y })
    setNotebookPickerNote(note)
    setNotebookOptions([])
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
    if (!error && data) setNotebookOptions(data as NotebookOption[])
  }, [noteActionsAnchor, windowWidth])

  const openCurrentNoteNotebookPicker = useCallback((e: any) => {
    if (!editor.noteId) return
    openNotebookPicker({ id: editor.noteId, title: editor.title, notebook_id: currentNotebookId } as any, e)
  }, [editor.noteId, editor.title, currentNotebookId, openNotebookPicker])

  const handleAssignNotebook = useCallback(async (nbId: string | null) => {
    if (!notebookPickerNote) return
    const targetNoteId = notebookPickerNote.id
    setAssigningNotebookId(nbId ?? '__remove__')
    const { error } = await supabase.from('notes').update({ notebook_id: nbId }).eq('id', targetNoteId)
    setAssigningNotebookId(null)
    if (error) { Alert.alert('Error', error.message); return }
    if (targetNoteId === editor.noteId) {
      setCurrentNotebookId(nbId)
      const nb = notebookOptions.find(o => o.id === nbId)
      setCurrentNotebookName(nb ? nb.name : null)
    }
    setPopoverMode(null)
    setNotebookPickerNote(null)
  }, [notebookPickerNote, editor.noteId, notebookOptions])

  // ── New note handler ──────────────────────────────────────────────────────
  const handleNewNote = useCallback(async () => {
    const ok = await editor.flushAutosave()
    if (!ok) {
      Alert.alert('Could not sync', 'Please check your connection/login, then try again.')
      return
    }
    editor.clearEditor()
    router.replace(`/notes?new=${Date.now()}${currentNotebookId ? `&notebookId=${currentNotebookId}` : ''}`)
  }, [editor, router, currentNotebookId])

  // ── Canvas padding ────────────────────────────────────────────────────────
  const cardPadding = isNarrow ? 20 : 32

  const toggleSavedListOrSidebar = useCallback(() => {
    if (savedDrawerVisible) closeSavedDrawer()
    else openSavedDrawer()
  }, [closeSavedDrawer, openSavedDrawer, savedDrawerVisible])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.studioToolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Saved notes"
          onPress={toggleSavedListOrSidebar}
          style={styles.studioToolbarBtn}
        >
          <MaterialIcons name="menu" size={24} color="#111" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New note"
          onPress={handleNewNote}
          style={styles.studioToolbarBtn}
        >
          <MaterialIcons name="note-add" size={24} color="#111" />
        </Pressable>
      </View>

      <View style={styles.topHalf}>
        <View style={[styles.workbenchRow, isNarrow && { flexDirection: 'column' }]}>
          <View style={styles.workbenchLeft}>
            <View style={styles.noteTitleRow}>
              <Text style={styles.label}>Note Title</Text>
              <View pointerEvents="none" style={styles.noteTitleAutosave}>
                {editor.autosaveState === 'syncing' ? (
                  <ActivityIndicator size="small" color="#9CA3AF" />
                ) : editor.autosaveState === 'saved' ? (
                  <Animated.View
                    style={[
                      styles.noteTitleAutosaveDot,
                      { transform: [{ scale: editor.autosavePulseScale }], opacity: editor.autosavePulseOpacity },
                    ]}
                  />
                ) : null}
              </View>
            </View>
            <TextInput
              style={styles.titleInput}
              placeholder="Type a title…"
              value={editor.title}
              onChangeText={editor.setTitle}
              autoCapitalize="sentences"
              returnKeyType="done"
            />
            {editor.noteId && (
              <Pressable
                onPress={(e) => openCurrentNoteNotebookPicker(e)}
                style={[styles.notebookBadge, !currentNotebookName && { backgroundColor: '#F3F4F6' }]}
              >
                <Ionicons name="book-outline" size={13} color={currentNotebookName ? '#6366F1' : '#6B7280'} />
                <Text
                  style={[styles.notebookBadgeName, !currentNotebookName && { color: '#6B7280' }]}
                  numberOfLines={1}
                >
                  {currentNotebookName || 'Add to Notebook'}
                </Text>
                <Ionicons name="chevron-down" size={10} color={currentNotebookName ? '#6366F1' : '#6B7280'} style={{ marginLeft: 2 }} />
              </Pressable>
            )}

            <Text style={[styles.label, { marginTop: 12 }]}>Raw Notes</Text>
            <View style={styles.rawInputWrap}>
              <TextInput
                style={styles.rawInput}
                placeholder="Type your messy thoughts here…"
                value={editor.rawContent}
                onChangeText={editor.setRawContent}
                multiline
                autoFocus={false}
                textAlignVertical="top"
              />
            </View>
          </View>
        </View>
      </View>

      {/* Magic Bar */}
      <View style={styles.magicBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.magicBarContent}>
          {PERSONAS.map((p) => {
            const active = editor.selectedStyle === p.id
            const label = editor.styling && active ? 'Styling…' : p.label
            return (
              <PersonaPill
                key={p.id}
                label={label}
                help={PERSONA_HELP[p.id]}
                active={active}
                disabled={editor.styling}
                onPress={async () => {
                  if (Platform.OS !== 'web') {
                    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
                  }
                  if (!editor.rawContent.trim()) {
                    editor.setIsPreviewingAI(false)
                  } else {
                    editor.setIsPreviewingAI(true)
                  }
                  setAiLastRun({ persona: p.id, at: Date.now() })
                  editor.runAiStyling(p.id)
                }}
              />
            )
          })}
        </ScrollView>
      </View>

      {/* Canvas */}
      <View style={styles.bottomHalf}>
        <NoteEditorCard
          previewMarkdown={editor.previewMarkdown}
          isPreviewingAI={editor.isPreviewingAI}
          styling={editor.styling}
          aiError={editor.aiError}
          copiedFlash={editor.copiedFlash}
          skeletonTranslateX={editor.skeletonTranslateX}
          wordCount={editor.wordCount}
          readingTimeMinutes={editor.readingTimeMinutes}
          onBackToDraft={() => editor.setIsPreviewingAI(false)}
          onCopyResult={editor.copyResult}
          cardPadding={cardPadding}
          debugLine={aiLastRun ? `Last persona: ${aiLastRun.persona}` : null}
        />
      </View>

      {/* Saved Notes Drawer */}
      <View pointerEvents={savedDrawerVisible ? 'auto' : 'none'} style={StyleSheet.absoluteFillObject}>
        <Animated.View style={[styles.drawerBackdrop, { opacity: savedDrawerAnim }]} />
        <Pressable style={StyleSheet.absoluteFillObject} onPress={closeSavedDrawer} />
        <Animated.View
          style={[
            styles.savedDrawer,
            {
              width: savedDrawerWidth,
              transform: [{
                translateX: savedDrawerAnim.interpolate({ inputRange: [0, 1], outputRange: [-savedDrawerWidth, 0] }),
              }],
            },
          ]}
        >
          <View style={styles.savedDrawerTopRow}>
            <Text style={styles.drawerTitle}>Studio Menu</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close menu"
              hitSlop={10}
              style={styles.savedDrawerClose}
              onPress={closeSavedDrawer}
            >
              <Ionicons name="close" size={22} color="#111" />
            </Pressable>
          </View>

          <Pressable
            style={styles.drawerNewNoteBtn}
            onPress={() => { handleNewNote(); closeSavedDrawer() }}
          >
            <MaterialIcons name="note-add" size={20} color="#fff" />
            <Text style={styles.drawerNewNoteBtnText}>New Note</Text>
          </Pressable>

          <View style={styles.listHeaderRow}>
            <TextInput
              style={styles.listSearchInput}
              placeholder="Search..."
              value={savedSearch}
              onChangeText={setSavedSearch}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
          {loadingList ? <Text style={styles.muted}>Loading notes…</Text> : null}

          <ScrollView style={styles.listScroll} keyboardShouldPersistTaps="handled">
            {groupedNotes.length === 0 ? (
              <Text style={styles.muted}>{savedSearch.trim() ? 'No matches' : 'No notes yet'}</Text>
            ) : (
              groupedNotes.map((group) => {
                const groupId = group.notebookId || '__none__'
                const isExpanded = expandedNotebookIds.includes(groupId)
                return (
                  <View key={groupId} style={styles.noteGroup}>
                    <View style={[styles.noteGroupHeader, groupId === currentNotebookId && { backgroundColor: '#EEF2FF', borderBottomColor: '#E0E7FF' }]}>
                      <Pressable onPress={() => toggleGroupExpand(groupId)} hitSlop={8} style={{ paddingRight: 4 }}>
                        <Ionicons
                          name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                          size={16}
                          color={groupId === currentNotebookId ? '#4F46E5' : '#666'}
                        />
                      </Pressable>
                      <Pressable
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                        onPress={() => toggleGroupExpand(groupId)}
                      >
                        {group.colour && (
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: group.colour, marginRight: 8 }} />
                        )}
                        <Text
                          style={[styles.noteGroupTitle, groupId === currentNotebookId && { color: '#4F46E5', fontWeight: '900' }]}
                          numberOfLines={1}
                        >
                          {group.notebookName} ({group.notes.length})
                        </Text>
                      </Pressable>
                    </View>

                    {isExpanded && (
                      <View style={styles.noteGroupContent}>
                        {group.notes.map((n) => (
                          <View key={n.id} style={styles.listItem}>
                            <View style={styles.listItemRow}>
                              <Pressable
                                style={styles.listItemTextCol}
                                onPress={() => { loadNotebookById(n.id); closeSavedDrawer() }}
                              >
                                <Text style={styles.listItemTitle} numberOfLines={1}>
                                  {(n.title ?? '').trim() ? n.title : '(Untitled)'}
                                </Text>
                                <Text style={styles.listItemMeta} numberOfLines={1}>
                                  {n.updated_at ? new Date(n.updated_at).toLocaleDateString() : ''}
                                </Text>
                              </Pressable>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="More actions"
                                hitSlop={10}
                                style={styles.moreButton}
                                onPress={(e) => openNoteActionsAt(n, e)}
                                disabled={deletingId === n.id}
                              >
                                <Ionicons name="menu-outline" size={20} color="#444" />
                              </Pressable>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )
              })
            )}
          </ScrollView>
        </Animated.View>
      </View>

      {/* Account Drawer */}
      {drawerVisible ? (
        <Pressable style={styles.drawerBackdrop} onPress={closeDrawer}>
          <Animated.View
            style={[
              styles.drawer,
              {
                width: drawerWidth,
                transform: [{
                  translateX: drawerAnim.interpolate({ inputRange: [0, 1], outputRange: [drawerWidth, 0] }),
                }],
              },
            ]}
          >
            <Text style={styles.drawerTitle}>Account</Text>
            {session?.user?.email ? (
              <>
                <Text style={styles.drawerLabel}>Signed in as</Text>
                <Text style={styles.drawerEmail}>{session.user.email}</Text>
                <Pressable
                  style={[styles.drawerButton, { marginTop: 16 }]}
                  onPress={async () => { await supabase.auth.signOut(); closeDrawer() }}
                >
                  <Text style={styles.drawerButtonText}>Logout</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.drawerHint}>You are not logged in.</Text>
                <Pressable
                  style={styles.drawerButton}
                  onPress={() => { closeDrawer(); setAuthMode('signIn'); setAuthVisible(true) }}
                >
                  <Text style={styles.drawerButtonText}>Login</Text>
                </Pressable>
                <Pressable
                  style={styles.drawerButton}
                  onPress={() => { closeDrawer(); setAuthMode('signUp'); setAuthVisible(true) }}
                >
                  <Text style={styles.drawerButtonText}>Register</Text>
                </Pressable>
              </>
            )}
            <Pressable style={[styles.drawerButton, { marginTop: 8 }]} onPress={closeDrawer}>
              <Text style={styles.drawerButtonText}>Close</Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      ) : null}

      {/* Auth Modal */}
      <Modal transparent visible={authVisible} animationType="slide" onRequestClose={() => setAuthVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAuthVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Auth mode={authMode} onSuccess={() => setAuthVisible(false)} />
            <Pressable style={[styles.drawerButton, { marginTop: 8 }]} onPress={() => setAuthVisible(false)}>
              <Text style={styles.drawerButtonText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Actions + Notebook Picker Popover */}
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
              <View style={[styles.actionsPopover, { width: MENU_W, left, top }]}>
                <View style={[styles.actionsTipBorder, { left: tipLeft }]} />
                <View style={[styles.actionsTip, { left: tipLeft }]} />
                <Text style={styles.actionsCompactTitle} numberOfLines={1}>
                  {(noteActionsTarget?.title ?? '').trim() ? noteActionsTarget?.title : '(Untitled)'}
                </Text>
                <Pressable
                  style={styles.actionsMenuItem}
                  onPress={() => {
                    if (!noteActionsTarget) return
                    const target = noteActionsTarget
                    const anchor = { nativeEvent: { pageX: anchorX, pageY: anchorY } }
                    openNotebookPicker(target, anchor)
                  }}
                >
                  <Ionicons name="book-outline" size={18} color="#374151" />
                  <Text style={styles.actionsMenuItemText}>Add to Notebook</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionsMenuItemDanger, deletingId && styles.disabled]}
                  disabled={!noteActionsTarget || !!deletingId}
                  onPress={async () => {
                    if (!noteActionsTarget) return
                    const id = noteActionsTarget.id
                    setPopoverMode(null)
                    await deleteNotebookById(id)
                  }}
                >
                  <MaterialIcons name="delete-outline" size={18} color="#991b1b" />
                  <Text style={styles.actionsMenuItemDangerText}>{deletingId ? 'Deleting…' : 'Delete note'}</Text>
                </Pressable>
                <Pressable style={styles.actionsMenuItem} onPress={() => setPopoverMode(null)}>
                  <MaterialIcons name="close" size={18} color="#374151" />
                  <Text style={styles.actionsMenuItemText}>Cancel</Text>
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
              <View style={[styles.nbPickerPopover, { width: MENU_W, left, top }]}>
                <View style={[styles.nbPickerTipBorder, { left: tipLeft }]} />
                <View style={[styles.nbPickerTip, { left: tipLeft }]} />
                <Text style={styles.nbPickerTitle}>Add to Notebook</Text>
                {notebookPickerNote ? (
                  <Text style={styles.nbPickerSubtitle} numberOfLines={1}>
                    {(notebookPickerNote?.title ?? '').trim() || 'Untitled note'}
                  </Text>
                ) : null}
                {loadingNotebookOptions ? (
                  <ActivityIndicator size="small" color="#6366F1" style={{ marginVertical: 16 }} />
                ) : notebookOptions.length === 0 ? (
                  <View style={styles.nbPickerEmpty}>
                    <Text style={styles.nbPickerEmptyText}>No notebooks yet.</Text>
                  </View>
                ) : (
                  <ScrollView style={[styles.nbPickerList, { maxHeight: 200 }]} bounces={false}>
                    {notebookOptions.map((nb) => {
                      const accent = nb.colour_tag || '#6366F1'
                      const isActive = nb.id === notebookPickerNote?.notebook_id
                      const isAssigning = assigningNotebookId === nb.id
                      return (
                        <Pressable
                          key={nb.id}
                          style={[styles.nbPickerItem, isActive && styles.nbPickerItemActive]}
                          onPress={() => handleAssignNotebook(nb.id)}
                          disabled={!!assigningNotebookId}
                        >
                          <View style={[styles.nbPickerDot, { backgroundColor: accent }]} />
                          <Text style={[styles.nbPickerItemText, isActive && styles.nbPickerItemTextActive]} numberOfLines={1}>
                            {nb.name}
                          </Text>
                          {isAssigning ? (
                            <ActivityIndicator size="small" color={accent} />
                          ) : isActive ? (
                            <Ionicons name="checkmark-circle" size={16} color={accent} />
                          ) : null}
                        </Pressable>
                      )
                    })}
                    {notebookPickerNote?.notebook_id ? (
                      <Pressable
                        style={styles.nbPickerRemoveItem}
                        onPress={() => handleAssignNotebook(null)}
                        disabled={!!assigningNotebookId}
                      >
                        <Text style={styles.nbPickerRemoveText}>Remove from notebook</Text>
                      </Pressable>
                    ) : null}
                  </ScrollView>
                )}
                <Pressable
                  style={styles.nbPickerCancelBtn}
                  onPress={() => { setPopoverMode(null); setNotebookPickerNote(null) }}
                >
                  <Text style={styles.nbPickerCancelText}>Cancel</Text>
                </Pressable>
              </View>
            )
          })()}
        </View>
      </Modal>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
  },
  studioToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  studioToolbarBtn: { padding: 6 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
  },
  topHalf: { flex: 1 },
  magicBar: { paddingVertical: 10 },
  bottomHalf: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 14,
  },
  workbenchRow: { flex: 1, flexDirection: 'row', gap: 12 },
  workbenchLeft: { flex: 1 },
  label: { fontSize: 12, fontWeight: '800', color: '#222', marginBottom: 6 },
  titleInput: {
    borderWidth: 1,
    borderColor: '#e4e4e7',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  notebookBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 6,
  },
  notebookBadgeName: { fontSize: 12, fontWeight: '600', color: '#6366F1' },
  noteTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteTitleAutosave: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  noteTitleAutosaveDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#10B981',
  },
  rawInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e4e4e7',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  rawInputWrap: { flex: 1, position: 'relative' },
  magicBarContent: { gap: 8, paddingRight: 8 },

  // Saved list
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  listSearchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e4e4e7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
  },
  listScroll: { flex: 1 },
  listItem: {
    backgroundColor: '#f6f6f7',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 10,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  listItemTextCol: { flex: 1 },
  moreButton: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#eeeeef',
  },
  listItemTitle: { fontSize: 13, fontWeight: '900', color: '#111', marginBottom: 2 },
  listItemMeta: { fontSize: 11, fontWeight: '700', color: '#555' },
  muted: { fontSize: 12, fontWeight: '700', color: '#666', marginBottom: 6 },
  noteGroup: { marginBottom: 4 },
  noteGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  noteGroupTitle: { fontSize: 13, fontWeight: '800', color: '#4B5563', flex: 1 },
  noteGroupContent: { paddingLeft: 4 },

  // Drawers
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-start',
  },
  savedDrawer: Platform.select({
    web: {
      alignSelf: 'flex-start',
      height: '100%',
      backgroundColor: '#fff',
      paddingTop: 18,
      paddingHorizontal: 0,
      paddingBottom: 16,
      boxShadow: '4px 0 10px rgba(0, 0, 0, 0.1)',
    },
    default: {
      alignSelf: 'flex-start',
      height: '100%',
      backgroundColor: '#fff',
      paddingTop: 18,
      paddingHorizontal: 0,
      paddingBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 4, height: 0 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
      elevation: 10,
    },
  }) as any,
  savedDrawerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 14,
  },
  drawerNewNoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#6366F1',
    marginHorizontal: 14,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  drawerNewNoteBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  savedDrawerClose: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  drawer: {
    alignSelf: 'flex-end',
    height: '100%',
    backgroundColor: '#fff',
    paddingTop: 18,
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  drawerTitle: { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 10 },
  drawerLabel: { fontSize: 12, fontWeight: '700', color: '#444', marginTop: 6 },
  drawerEmail: { fontSize: 16, fontWeight: '800', color: '#111', marginTop: 4, marginBottom: 8 },
  drawerHint: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 10 },
  drawerButton: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#f4f4f5',
    marginBottom: 8,
  },
  drawerButtonText: { fontSize: 16, fontWeight: '600', color: '#111' },

  // Actions popover
  actionsPopover: Platform.select({
    web: {
      position: 'absolute',
      backgroundColor: '#fff',
      borderRadius: 12,
      padding: 10,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      boxShadow: '0 4px 10px rgba(0, 0, 0, 0.12)',
    },
    default: {
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
  }) as any,
  actionsTipBorder: {
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
  actionsTip: {
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
  actionsCompactTitle: { fontSize: 12, fontWeight: '800', color: '#111827', marginBottom: 8 },
  actionsMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    marginTop: 8,
  },
  actionsMenuItemText: { fontSize: 13, fontWeight: '800', color: '#111827' },
  actionsMenuItemDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
  },
  actionsMenuItemDangerText: { fontSize: 13, fontWeight: '900', color: '#991b1b' },

  // Notebook picker popover
  nbPickerPopover: Platform.select({
    web: {
      position: 'absolute',
      backgroundColor: '#fff',
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      boxShadow: '0 4px 10px rgba(0, 0, 0, 0.12)',
    },
    default: {
      position: 'absolute',
      backgroundColor: '#fff',
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 8,
    },
  }) as any,
  nbPickerTipBorder: {
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
  nbPickerTip: {
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
  nbPickerTitle: { fontSize: 14, fontWeight: '900', color: '#111', marginBottom: 2 },
  nbPickerSubtitle: { fontSize: 11, fontWeight: '700', color: '#888', marginBottom: 10 },
  nbPickerList: { marginTop: 4 },
  nbPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
    backgroundColor: '#F9FAFB',
  },
  nbPickerItemActive: { backgroundColor: '#EEF2FF' },
  nbPickerDot: { width: 8, height: 8, borderRadius: 999 },
  nbPickerItemText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#111' },
  nbPickerItemTextActive: { color: '#6366F1' },
  nbPickerEmpty: { paddingVertical: 12, alignItems: 'center' },
  nbPickerEmptyText: { fontSize: 12, fontWeight: '600', color: '#aaa' },
  nbPickerRemoveItem: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginTop: 4,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
  },
  nbPickerRemoveText: { fontSize: 12, fontWeight: '800', color: '#991b1b' },
  nbPickerCancelBtn: {
    marginTop: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  nbPickerCancelText: { fontSize: 13, fontWeight: '800', color: '#4b5563' },
  disabled: { opacity: 0.6 },
})
