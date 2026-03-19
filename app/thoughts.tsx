import { NoteEditorCard } from '@/components/NoteEditorCard'
import { PersonaPill } from '@/components/PersonaPill'
import { PERSONAS, PERSONA_HELP, useNoteEditor } from '@/lib/noteHelpers'
import { supabase } from '@/lib/supabase'
import { tokens } from '@/constants/tokens'
import { Ionicons, MaterialIcons } from '@expo/vector-icons'
import type { Session } from '@supabase/supabase-js'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { Stack } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Animated,
    Easing,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native'

// ─── Constants ────────────────────────────────────────────────────────────────

const NOTEBOOK_COLORS = [
    '#fa6963', '#00a294', '#3461cd', '#db9c2a',
    '#e53856', '#22C55E', '#56a64b', '#00aab3',
    '#627dcd', '#9b1fb2', '#cc3b8e', '#687d85',
    '#f43f5e', '#a855f7', '#6366f1', '#f59e0b',
    '#84cc16', '#06b6d4', '#d946ef', '#64748b'
]

// ─── Editor-specific styles (for the inline editor panel) ─────────────────────

const editorStyles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#fff', padding: 16 },
    backRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    backBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingRight: 10,
    },
    backBtnText: { fontSize: 15, fontWeight: '700', color: '#6366F1' },
    autosaveBadge: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
    autosaveDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: '#10B981' },
    label: { fontSize: 12, fontWeight: '800', color: '#222', marginBottom: 6 },
    titleInput: {
        borderWidth: 1,
        borderColor: '#e4e4e7',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#fff',
        fontSize: 15,
    },
    rawInputWrap: { flex: 1, position: 'relative', marginBottom: 0 },
    rawInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#e4e4e7',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: '#fff',
        fontSize: 14,
    },
    magicBar: { paddingVertical: 10 },
    magicBarContent: { gap: 8, paddingRight: 8 },
    canvas: { flex: 1, backgroundColor: '#F9FAFB', borderRadius: 16, padding: 14 },
    topSection: { flex: 1 },
})

// ─── Types ────────────────────────────────────────────────────────────────────

type Note = {
    id: string
    title: string | null
    raw_content: string | null
    updated_at: string
    created_at: string
    notebook_id: string | null
}

type Notebook = {
    id: string
    name: string
    colour_tag: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Note Row ─────────────────────────────────────────────────────────────────

function NoteRow({
    note,
    onPress,
    onMorePress,
}: {
    note: Note
    onPress: () => void
    onMorePress: (anchor: { x: number; y: number }) => void
}) {
    const moreBtnRef = useRef<View>(null)

    const handleMorePress = () => {
        moreBtnRef.current?.measureInWindow((x, y, width, height) => {
            onMorePress({ x: x + width / 2, y: y + height / 2 })
        })
    }

    const preview = (note.raw_content ?? '').trim().replace(/\s+/g, ' ')
    const isWeb = Platform.OS === 'web'

    return (
        <View style={[rowStyles.container, isWeb && rowStyles.cardContainer]}>
            <Pressable style={[rowStyles.pressable, isWeb && rowStyles.cardPressable]} onPress={onPress}>
                {!isWeb && <View style={rowStyles.dot} />}
                <View style={[rowStyles.content, isWeb && rowStyles.cardContent]}>
                    {isWeb ? (
                        <Text style={rowStyles.cardPreview} numberOfLines={4}>
                            {note.raw_content?.trim() || note.title || 'Untitled'}
                        </Text>
                    ) : (
                        <>
                            <Text style={rowStyles.title} numberOfLines={1}>{note.title || 'Untitled'}</Text>
                            {preview.length > 0 && (
                                <Text style={rowStyles.preview} numberOfLines={2}>{preview}</Text>
                            )}
                        </>
                    )}
                    <Text style={[rowStyles.meta, isWeb && rowStyles.cardMeta]}>
                        {isWeb ? (note.updated_at.substring(0, 10)) : timeAgo(note.updated_at)}
                    </Text>
                </View>
            </Pressable>
            <Pressable
                ref={moreBtnRef}
                hitSlop={10}
                onPress={handleMorePress}
                style={[rowStyles.moreBtn, isWeb && rowStyles.cardMoreBtn]}
            >
                <Ionicons name="ellipsis-vertical" size={18} color="#aaa" />
            </Pressable>
        </View>
    )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ThoughtsScreen() {
    const { width: windowWidth, height: windowHeight } = useWindowDimensions()
    const [session, setSession] = useState<Session | null>(null)
    const [notes, setNotes] = useState<Note[]>([])
    const [notebooks, setNotebooks] = useState<Notebook[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null)
    const [noteActionsAnchor, setNoteActionsAnchor] = useState<{ x: number; y: number } | null>(null)
    const [noteActionsTarget, setNoteActionsTarget] = useState<Note | null>(null)
    const [assigningNotebookId, setAssigningNotebookId] = useState<string | null>(null)

    // Drawer
    const [drawerVisible, setDrawerVisible] = useState(false)
    const drawerAnim = useRef(new Animated.Value(0)).current
    const shimmerValue = useRef(new Animated.Value(0)).current

    // Search & notebook management
    const [mainSearch, setMainSearch] = useState('')
    const [newNotebookName, setNewNotebookName] = useState('')
    const [showNewNotebookInput, setShowNewNotebookInput] = useState(false)
    const [creatingNotebook, setCreatingNotebook] = useState(false)
    const [notebookMenuTarget, setNotebookMenuTarget] = useState<Notebook | null>(null)
    const [notebookMenuAnchor, setNotebookMenuAnchor] = useState<{ x: number; y: number } | null>(null)
    const [notebookToDelete, setNotebookToDelete] = useState<Notebook | null>(null)
    const [colorModalTarget, setColorModalTarget] = useState<Notebook | null>(null)
    const [selectedColor, setSelectedColor] = useState<string | null>(null)

    // User Profile
    const [profileName, setProfileName] = useState<string>('')
    const isWeb = Platform.OS === 'web'

    // Popover
    const [popoverMode, setPopoverMode] = useState<'actions' | 'picker' | null>(null)
    const slideAnim = useRef(new Animated.Value(0)).current
    const heightAnim = useRef(new Animated.Value(130)).current
    const topAnim = useRef(new Animated.Value(0)).current
    const tipTopAnim = useRef(new Animated.Value(0)).current

    // ─── Editor panel state ───────────────────────────────────────────────────
    const [editorVisible, setEditorVisible] = useState(false)
    const editorVisibleRef = useRef(false)
    const editorSlideAnim = useRef(new Animated.Value(0)).current

    const [editorNotebookId, setEditorNotebookId] = useState<string | null>(null)

    // ── useNoteEditor hook ─────────────────────────────────────────────────────
    const editor = useNoteEditor({
        session,
        notebookId: editorNotebookId,
    })

    // ─── Auth ─────────────────────────────────────────────────────────────────

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => setSession(data.session))
        const { data: sub } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
        return () => sub.subscription.unsubscribe()
    }, [])

    // ─── Data fetching ────────────────────────────────────────────────────────

    const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
        const { data: { session: s } } = await supabase.auth.getSession()
        if (!s?.user) { setLoading(false); return }

        const { data: profileData } = await supabase.from('profiles').select('display_name').eq('id', s.user.id).single()
        if (profileData?.display_name) setProfileName(profileData.display_name)

        if (!opts?.silent) setLoading(true)

        const { data: nbData } = await supabase
            .from('notebooks')
            .select('id, name, colour_tag')
            .eq('user_id', s.user.id)
        if (nbData) setNotebooks(nbData as Notebook[])

        const { data: noteData, error: noteError } = await supabase
            .from('notes')
            .select('id, title, raw_content, updated_at, created_at, notebook_id')
            .eq('user_id', s.user.id)
            .order('updated_at', { ascending: false })
        if (!noteError && noteData) setNotes(noteData as Note[])

        setLoading(false)
    }, [])

    useEffect(() => { fetchData() }, [fetchData])

    // Shimmer animation while loading
    useEffect(() => {
        if (!loading) return
        const anim = Animated.loop(
            Animated.timing(shimmerValue, {
                toValue: 1,
                duration: 1200,
                useNativeDriver: true,
            })
        )
        anim.start()
        return () => anim.stop()
    }, [loading, shimmerValue])

    useEffect(() => {
        const userId = session?.user?.id
        if (!userId) return
        const channel = supabase
            .channel('public:thoughts')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${userId}` }, () => {
                fetchData({ silent: true })
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notebooks', filter: `user_id=eq.${userId}` }, () => {
                fetchData({ silent: true })
            })
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [session?.user?.id, fetchData])

    // ─── Grouping ─────────────────────────────────────────────────────────────

    const filteredNotes = useMemo(() => {
        let result = notes
        if (selectedNotebookId !== null)
            result = result.filter(n => n.notebook_id === selectedNotebookId)
        const q = mainSearch.trim().toLowerCase()
        if (q)
            result = result.filter(n =>
                (n.title ?? '').toLowerCase().includes(q) ||
                (n.raw_content ?? '').toLowerCase().includes(q),
            )
        return result
    }, [notes, selectedNotebookId, mainSearch])

    // ─── Drawer ───────────────────────────────────────────────────────────────

    const openDrawer = useCallback(() => {
        setDrawerVisible(true)
        drawerAnim.stopAnimation(() => {
            Animated.timing(drawerAnim, {
                toValue: 1, duration: 240,
                easing: Easing.out(Easing.cubic), useNativeDriver: true,
            }).start()
        })
    }, [drawerAnim])

    const closeDrawer = useCallback(() => {
        drawerAnim.stopAnimation(() => {
            Animated.timing(drawerAnim, {
                toValue: 0, duration: 220,
                easing: Easing.out(Easing.cubic), useNativeDriver: true,
            }).start(({ finished }) => { if (finished) setDrawerVisible(false) })
        })
    }, [drawerAnim])

    // ─── Popover ──────────────────────────────────────────────────────────────

    const getPopoverMetrics = useCallback((mode: 'actions' | 'picker', anchorY: number, nbsLength: number, winHeight: number) => {
        const actionsH = 130
        const pickerH = Math.min(97 + nbsLength * 44, 400)
        const MENU_H = mode === 'picker' ? pickerH : actionsH
        const top = Math.min(Math.max(anchorY - MENU_H / 2, 40), winHeight - MENU_H - 80)
        const tipTop = Math.min(Math.max(anchorY - top - 7, 10), Math.max(MENU_H - 24, 10))
        return { height: MENU_H, top, tipTop }
    }, [])

    const handleSetPopoverMode = useCallback((mode: 'actions' | 'picker' | null) => {
        if (!mode) { setPopoverMode(null); slideAnim.setValue(0); return }
        const metrics = getPopoverMetrics(mode, noteActionsAnchor?.y ?? 120, notebooks.length, windowHeight)
        if (mode === 'picker') {
            setPopoverMode(mode)
            Animated.parallel([
                Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, friction: 8, tension: 60 }),
                Animated.spring(heightAnim, { toValue: metrics.height, useNativeDriver: false, friction: 8, tension: 60 }),
                Animated.spring(topAnim, { toValue: metrics.top, useNativeDriver: false, friction: 8, tension: 60 }),
                Animated.spring(tipTopAnim, { toValue: metrics.tipTop, useNativeDriver: false, friction: 8, tension: 60 }),
            ]).start()
        } else {
            Animated.parallel([
                Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 8, tension: 60 }),
                Animated.spring(heightAnim, { toValue: metrics.height, useNativeDriver: false, friction: 8, tension: 60 }),
                Animated.spring(topAnim, { toValue: metrics.top, useNativeDriver: false, friction: 8, tension: 60 }),
                Animated.spring(tipTopAnim, { toValue: metrics.tipTop, useNativeDriver: false, friction: 8, tension: 60 }),
            ]).start(() => setPopoverMode(mode))
        }
    }, [slideAnim, heightAnim, topAnim, tipTopAnim, noteActionsAnchor, notebooks.length, windowHeight, getPopoverMetrics])

    const openNoteActionsAt = (note: Note, anchor: { x: number; y: number }) => {
        setNoteActionsTarget(note)
        setNoteActionsAnchor(anchor)
        const metrics = getPopoverMetrics('actions', anchor.y, notebooks.length, windowHeight)
        slideAnim.setValue(0)
        heightAnim.setValue(metrics.height)
        topAnim.setValue(metrics.top)
        tipTopAnim.setValue(metrics.tipTop)
        setPopoverMode('actions')
    }

    const handleDelete = () => {
        if (!noteActionsTarget) return
        const note = noteActionsTarget
        setPopoverMode(null)

        const doDelete = async () => {
            const { error } = await supabase.from('notes').delete().eq('id', note.id)
            if (error) { Alert.alert('Error', error.message); return }
            fetchData()
        }

        if (Platform.OS === 'web') {
            if (window.confirm(`Delete "${note.title || 'Untitled'}"?\nThis action cannot be undone.`)) {
                doDelete()
            }
        } else {
            Alert.alert(`Delete "${note.title || 'Untitled'}"?`, 'This action cannot be undone.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: doDelete },
            ])
        }
    }

    const handleAssignNotebook = async (targetNotebookId: string | null) => {
        if (!noteActionsTarget) return
        const targetNoteId = noteActionsTarget.id
        setAssigningNotebookId(targetNotebookId ?? '__remove__')
        const { error } = await supabase.from('notes').update({ notebook_id: targetNotebookId }).eq('id', targetNoteId)
        setAssigningNotebookId(null)
        setPopoverMode(null)
        if (error) Alert.alert('Error', error.message)
        else fetchData()
    }

    const handleCreateNotebook = async () => {
        const name = newNotebookName.trim()
        if (!name || !session?.user?.id) return
        setCreatingNotebook(true)
        const { error } = await supabase.from('notebooks').insert({ user_id: session.user.id, name })
        setCreatingNotebook(false)
        if (error) { Alert.alert('Error', error.message); return }
        setNewNotebookName('')
        setShowNewNotebookInput(false)
        fetchData({ silent: true })
    }

    const handleDeleteNotebook = (nb: Notebook) => {
        setNotebookMenuTarget(null)
        setNotebookToDelete(nb)
    }

    const confirmDeleteNotebook = async () => {
        if (!notebookToDelete) return
        const nb = notebookToDelete

        const { error: moveError } = await supabase.from('notes').update({ notebook_id: null }).eq('notebook_id', nb.id)
        if (moveError) { Alert.alert('Error', moveError.message); return }

        const { error } = await supabase.from('notebooks').delete().eq('id', nb.id)
        if (error) { Alert.alert('Error', error.message); return }

        if (selectedNotebookId === nb.id) setSelectedNotebookId(null)
        setNotebookToDelete(null)
        fetchData({ silent: true })
    }

    const handleNotebookColorChange = async (nb: Notebook, color: string) => {
        const { error } = await supabase.from('notebooks').update({ colour_tag: color }).eq('id', nb.id)
        if (error) { Alert.alert('Error', error.message); return }
        setNotebooks(prev => prev.map(n => n.id === nb.id ? { ...n, colour_tag: color } : n))
        setNotebookMenuTarget(null)
    }

    // ─── Editor open / close ──────────────────────────────────────────────────

    const openEditor = useCallback((note?: Note) => {
        if (note) {
            editor.loadIntoEditor({
                id: note.id,
                title: note.title,
                raw_content: note.raw_content,
            })
            setEditorNotebookId(note.notebook_id ?? null)
        } else {
            editor.clearEditor()
            setEditorNotebookId(null)
        }
        editorVisibleRef.current = true
        setEditorVisible(true)
        Animated.spring(editorSlideAnim, { toValue: 1, useNativeDriver: true, friction: 8, tension: 60 }).start()
    }, [editorSlideAnim, editor])

    const closeEditor = useCallback(() => {
        if (editor.autosaveState === 'dirty' || editor.autosaveState === 'syncing') {
            editor.flushAutosave()
        }

        if (editor.noteId) {
            const nowIso = new Date().toISOString()
            setNotes(prev => {
                const exists = prev.some(n => n.id === editor.noteId)
                const patched = exists
                    ? prev.map(n => n.id === editor.noteId
                        ? { ...n, title: editor.title || null, raw_content: editor.rawContent || null, updated_at: nowIso }
                        : n,
                    )
                    : [{
                        id: editor.noteId!, title: editor.title || null, raw_content: editor.rawContent || null,
                        updated_at: nowIso, created_at: nowIso, notebook_id: editorNotebookId,
                    }, ...prev]
                return patched.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
            })
        }

        Animated.spring(editorSlideAnim, { toValue: 0, useNativeDriver: true, friction: 8, tension: 60 })
            .start(({ finished }) => {
                if (finished) {
                    editorVisibleRef.current = false
                    setEditorVisible(false)
                    fetchData({ silent: true })
                }
            })
    }, [editorSlideAnim, fetchData, editor, editorNotebookId])

    // ─── Layout ──────────────────────────────────────────────────────────────

    const contentWidth = isWeb ? windowWidth - 320 : windowWidth

    const editorTranslateX = editorSlideAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -contentWidth],
    })

    // ─── Render ───────────────────────────────────────────────────────────────

    const SidebarMarkup = (
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
            <Pressable
                style={[
                    drawerStyles.notebookRow,
                    isWeb && { borderBottomWidth: 0, paddingVertical: 10, marginHorizontal: 8, borderRadius: 8, marginTop: 8, overflow: 'hidden' },
                    !isWeb && selectedNotebookId === null && drawerStyles.notebookRowSelected,
                ]}
                onPress={() => { setSelectedNotebookId(null); if (!isWeb) closeDrawer() }}
            >
                {isWeb && selectedNotebookId === null && (
                    <LinearGradient colors={['#a855f7', '#6366f1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                )}
                <Ionicons name="layers-outline" size={16} color={selectedNotebookId === null ? (isWeb ? '#fff' : '#6366F1') : '#6B7280'} />
                <Text style={[{ marginLeft: 10 }, drawerStyles.notebookName, selectedNotebookId === null && (isWeb ? drawerStyles.notebookNameSelectedWeb : drawerStyles.notebookNameSelected)]}>
                    All Notes
                </Text>
                <Text style={[drawerStyles.notebookCount, selectedNotebookId === null && isWeb && drawerStyles.notebookCountSelectedWeb]}>{notes.length}</Text>
            </Pressable>

            <View style={drawerStyles.sectionHeader}>
                <Text style={drawerStyles.sectionLabel}>Notebooks</Text>
                <Pressable
                    hitSlop={8}
                    onPress={() => { setShowNewNotebookInput(v => !v); setNewNotebookName('') }}
                >
                    <Ionicons name={showNewNotebookInput ? 'close' : 'add'} size={20} color={isWeb ? '#9ca3af' : '#6366F1'} />
                </Pressable>
            </View>

            {showNewNotebookInput && (
                <View style={drawerStyles.newNotebookRow}>
                    <TextInput
                        style={drawerStyles.newNotebookInput}
                        placeholder="Notebook name…"
                        placeholderTextColor="#9ca3af"
                        value={newNotebookName}
                        onChangeText={setNewNotebookName}
                        autoFocus
                        autoCapitalize="words"
                        returnKeyType="done"
                        onSubmitEditing={handleCreateNotebook}
                    />
                    <Pressable
                        style={[drawerStyles.newNotebookSave, (!newNotebookName.trim() || creatingNotebook) && { opacity: 0.4 }]}
                        onPress={handleCreateNotebook}
                        disabled={!newNotebookName.trim() || creatingNotebook}
                    >
                        {creatingNotebook
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={drawerStyles.newNotebookSaveText}>Add</Text>
                        }
                    </Pressable>
                </View>
            )}

            {notebooks.length === 0 ? (
                <Text style={drawerStyles.muted}>No notebooks yet — tap + to create one.</Text>
            ) : (
                notebooks.map(nb => (
                    <View
                        key={nb.id}
                        style={[
                            drawerStyles.notebookRow,
                            isWeb && { borderBottomWidth: 0, marginHorizontal: 8, borderRadius: 8, overflow: 'hidden' },
                            !isWeb && selectedNotebookId === nb.id && drawerStyles.notebookRowSelected,
                            !isWeb && notebookMenuTarget?.id === nb.id && drawerStyles.notebookRowHighlighted,
                        ]}
                    >
                        {isWeb && selectedNotebookId === nb.id && (
                            <LinearGradient colors={['#a855f7', '#6366f1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                        )}
                        <Pressable
                            style={drawerStyles.notebookRowPressable}
                            onPress={() => { setSelectedNotebookId(nb.id); if (!isWeb) closeDrawer() }}
                        >
                            <View style={[drawerStyles.colorDot, { backgroundColor: nb.colour_tag || '#d1d5db' }, isWeb && selectedNotebookId === nb.id && { borderColor: 'rgba(255,255,255,0.4)', borderWidth: 1 }]} />
                            <Text style={[drawerStyles.notebookName, selectedNotebookId === nb.id && (isWeb ? drawerStyles.notebookNameSelectedWeb : drawerStyles.notebookNameSelected)]} numberOfLines={1}>
                                {nb.name}
                            </Text>
                            <Text style={[drawerStyles.notebookCount, selectedNotebookId === nb.id && isWeb && drawerStyles.notebookCountSelectedWeb]}>
                                {notes.filter(n => n.notebook_id === nb.id).length}
                            </Text>
                        </Pressable>
                        <TouchableOpacity
                            onPress={(e) => {
                                const x = e.nativeEvent.pageX ?? windowWidth / 2
                                const y = e.nativeEvent.pageY ?? windowHeight / 2
                                setNotebookMenuTarget(nb)
                                setNotebookMenuAnchor({ x, y })
                            }}
                            style={[
                                drawerStyles.notebookMenuBtn,
                                (notebookMenuTarget?.id === nb.id) && drawerStyles.notebookMenuBtnActive,
                            ]}
                            activeOpacity={0.5}
                        >
                            <Ionicons name="ellipsis-vertical" size={16} color={selectedNotebookId === nb.id && isWeb ? 'rgba(255,255,255,0.7)' : '#9CA3AF'} />
                        </TouchableOpacity>
                    </View>
                ))
            )}
        </ScrollView>
    )

    return (
        <View style={[styles.screen, isWeb && { flexDirection: 'row' }]}>
            <Stack.Screen options={{ headerShown: false }} />

            {isWeb && session?.user && !loading && (
                <View style={drawerStyles.webSidebar}>
                    <LinearGradient colors={['#a855f7', '#6366f1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={drawerStyles.webUserProfile}>
                        <View style={drawerStyles.webBackRow}>
                            <Pressable style={drawerStyles.webBackBtn}>
                                <Ionicons name="arrow-back" size={20} color="#fff" />
                                <Text style={drawerStyles.webBackText}>Back</Text>
                            </Pressable>
                            <Pressable>
                                <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
                            </Pressable>
                        </View>
                        <View style={drawerStyles.webUserRow}>
                            <View style={drawerStyles.webAvatar}>
                                <Text style={drawerStyles.webAvatarText}>{profileName ? profileName.substring(0, 2).toUpperCase() : 'DI'}</Text>
                            </View>
                            <View style={drawerStyles.webUserInfo}>
                                <Text style={drawerStyles.webAppTitle}>Aero Agent</Text>
                                <Text style={drawerStyles.webUserName}>{profileName || 'Ding-Ze Hu'}</Text>
                                <Text style={drawerStyles.webUserEmail} numberOfLines={1}>{session?.user?.email}</Text>
                            </View>
                        </View>
                    </LinearGradient>

                    <View style={drawerStyles.webManageRow}>
                        <Text style={drawerStyles.title}>Manage</Text>
                    </View>

                    {SidebarMarkup}
                </View>
            )}

            <View style={{ flex: 1, flexDirection: 'column' }}>
                {session?.user && !loading && (
                    <View style={[styles.toolbar, isWeb && styles.toolbarWeb]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: isWeb ? 1 : undefined }}>
                            {!isWeb && (
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel="Manage notebooks"
                                    onPress={openDrawer}
                                    style={styles.toolbarMenuBtn}
                                >
                                    <MaterialIcons name="menu" size={24} color="#111" />
                                </Pressable>
                            )}
                            {isWeb && (
                                <View style={styles.webToolbarSearch}>
                                    <Ionicons name="search" size={18} color="#9ca3af" />
                                    <TextInput
                                        style={styles.searchBarInputWeb}
                                        placeholder="Search Search"
                                        placeholderTextColor="#9ca3af"
                                        value={mainSearch}
                                        onChangeText={setMainSearch}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        returnKeyType="search"
                                    />
                                </View>
                            )}
                        </View>
                        {!isWeb ? (
                            <Pressable style={styles.newNoteBtn} onPress={() => openEditor()}>
                                <Ionicons name="add" size={18} color="#fff" />
                                <Text style={styles.newNoteBtnText}>New Thought</Text>
                            </Pressable>
                        ) : (
                            <View style={drawerStyles.webToolbarActions}>
                                <Pressable style={{ padding: 8 }}><Ionicons name="help-circle-outline" size={24} color="#9ca3af" /></Pressable>
                                <Pressable style={{ padding: 8 }} onPress={() => supabase.auth.signOut()}><Ionicons name="log-out-outline" size={24} color="#9ca3af" /></Pressable>
                            </View>
                        )}
                    </View>
                )}

                <View style={{ flex: 1, overflow: 'hidden' }}>
                    <Animated.View
                        style={{
                            flex: 1,
                            flexDirection: 'row',
                            width: contentWidth * 2,
                            transform: [{ translateX: editorTranslateX }],
                        }}
                    >
                        {/* Panel 1: Notes list */}
                        <View style={{ width: contentWidth, flex: 1 }}>
                            {loading ? (
                                <View style={{ padding: 16 }}>
                                    {[0, 1, 2, 3].map(i => {
                                        const shimmerTranslate = shimmerValue.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [-120, 300],
                                        })
                                        return (
                                            <View key={i} style={[styles.skeletonRow, { overflow: 'hidden' }]}>
                                                <View style={styles.skeletonDot} />
                                                <View style={{ flex: 1, gap: 6 }}>
                                                    <View style={styles.skeletonTitle} />
                                                    <View style={styles.skeletonPreview} />
                                                </View>
                                                <Animated.View
                                                    style={[styles.skeletonShimmer, { transform: [{ translateX: shimmerTranslate }] }]}
                                                />
                                            </View>
                                        )
                                    })}
                                </View>
                            ) : !session?.user ? (
                                <View style={styles.center}>
                                    <Ionicons name="lock-closed-outline" size={48} color="#ddd" />
                                    <Text style={styles.emptyTitle}>Sign in to see your thoughts</Text>
                                </View>
                            ) : notes.length === 0 ? (
                                <View style={styles.center}>
                                    <Ionicons name="document-text-outline" size={56} color="#e0e0e0" />
                                    <Text style={styles.emptyTitle}>No thoughts yet</Text>
                                    <Text style={styles.emptySubtitle}>Tap + to capture your first thought.</Text>
                                    <Pressable style={styles.createBtn} onPress={() => openEditor()}>
                                        <Ionicons name="add" size={18} color="#fff" />
                                        <Text style={styles.createBtnText}>New Thought</Text>
                                    </Pressable>
                                </View>
                            ) : (
                                <View style={{ flex: 1, backgroundColor: isWeb ? '#fafafa' : '#fff' }}>
                                    <View style={[styles.listHeader, isWeb && styles.listHeaderWeb]}>
                                        <Text style={[styles.listHeaderLabel, isWeb && styles.listHeaderLabelWeb]}>
                                            {selectedNotebookId
                                                ? (isWeb ? `Notes in "${notebooks.find(nb => nb.id === selectedNotebookId)?.name ?? 'Notebook'}"` : notebooks.find(nb => nb.id === selectedNotebookId)?.name ?? 'Notebook')
                                                : 'All Notes'}
                                        </Text>
                                        {!isWeb && <Text style={styles.listHeaderCount}>{filteredNotes.length}</Text>}
                                    </View>

                                    {!isWeb && (
                                        <View style={styles.searchBarRow}>
                                            <Ionicons name="search" size={15} color="#9ca3af" style={{ marginLeft: 12 }} />
                                            <TextInput
                                                style={styles.searchBarInput}
                                                placeholder={selectedNotebookId
                                                    ? `Search in ${notebooks.find(nb => nb.id === selectedNotebookId)?.name ?? 'notebook'}…`
                                                    : 'Search all notes…'}
                                                placeholderTextColor="#9ca3af"
                                                value={mainSearch}
                                                onChangeText={setMainSearch}
                                                autoCapitalize="none"
                                                autoCorrect={false}
                                                returnKeyType="search"
                                                clearButtonMode="while-editing"
                                            />
                                        </View>
                                    )}

                                    {filteredNotes.length === 0 ? (
                                        <View style={styles.center}>
                                            <Ionicons name="search-outline" size={40} color="#e0e0e0" />
                                            <Text style={styles.emptyTitle}>
                                                {mainSearch.trim() ? `No results for "${mainSearch}"` : 'No notes here'}
                                            </Text>
                                        </View>
                                    ) : (
                                        <ScrollView contentContainerStyle={[styles.list, isWeb && styles.listWeb]}>
                                            {filteredNotes.map(note => (
                                                <NoteRow
                                                    key={note.id}
                                                    note={note}
                                                    onPress={() => openEditor(note)}
                                                    onMorePress={(anchor) => openNoteActionsAt(note, anchor)}
                                                />
                                            ))}
                                        </ScrollView>
                                    )}
                                </View>
                            )}
                            {isWeb && session?.user && (
                                <Pressable style={styles.fabWeb} onPress={() => openEditor()}>
                                    <Ionicons name="add" size={24} color="#fff" />
                                    <Text style={styles.fabWebText}>New Thought</Text>
                                </Pressable>
                            )}
                        </View>

                        {/* Panel 2: Inline editor */}
                        <KeyboardAvoidingView
                            style={{ width: contentWidth, flex: 1 }}
                            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                            pointerEvents={editorVisible ? 'auto' : 'none'}
                        >
                            <View style={editorStyles.screen}>
                                <View style={editorStyles.backRow}>
                                    <Pressable style={editorStyles.backBtn} onPress={closeEditor}>
                                        <Ionicons name="arrow-back" size={20} color="#6366F1" />
                                        <Text style={editorStyles.backBtnText}>Thoughts</Text>
                                    </Pressable>
                                    <View pointerEvents="none" style={editorStyles.autosaveBadge}>
                                        {editor.autosaveState === 'syncing' ? (
                                            <ActivityIndicator size="small" color="#9CA3AF" />
                                        ) : editor.autosaveState === 'saved' ? (
                                            <Animated.View
                                                style={[
                                                    editorStyles.autosaveDot,
                                                    { transform: [{ scale: editor.autosavePulseScale }], opacity: editor.autosavePulseOpacity },
                                                ]}
                                            />
                                        ) : editor.autosaveState === 'dirty' ? (
                                            <MaterialIcons name="fiber-manual-record" size={10} color="#9CA3AF" />
                                        ) : null}
                                    </View>
                                </View>

                                <View style={editorStyles.topSection}>
                                    <Text style={editorStyles.label}>Note Title</Text>
                                    <TextInput
                                        style={editorStyles.titleInput}
                                        placeholder="Type a title…"
                                        value={editor.title}
                                        onChangeText={editor.setTitle}
                                        autoCapitalize="sentences"
                                        returnKeyType="done"
                                    />
                                    <Text style={[editorStyles.label, { marginTop: 12 }]}>Raw Notes</Text>
                                    <View style={editorStyles.rawInputWrap}>
                                        <TextInput
                                            style={editorStyles.rawInput}
                                            placeholder="Type your messy thoughts here…"
                                            value={editor.rawContent}
                                            onChangeText={editor.setRawContent}
                                            multiline
                                            autoFocus={false}
                                            textAlignVertical="top"
                                        />
                                    </View>
                                </View>

                                <View style={editorStyles.magicBar}>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={editorStyles.magicBarContent}>
                                        {PERSONAS.map(p => {
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
                                                        editor.setIsPreviewingAI(editor.rawContent.trim() ? true : false)
                                                        editor.runAiStyling(p.id)
                                                    }}
                                                />
                                            )
                                        })}
                                    </ScrollView>
                                </View>

                                <View style={editorStyles.canvas}>
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
                                    />
                                </View>
                            </View>
                        </KeyboardAvoidingView>
                    </Animated.View>
                </View>
            </View>

            {/* Manage drawer (mobile) */}
            {!isWeb && (
                <View pointerEvents={drawerVisible ? 'auto' : 'none'} style={StyleSheet.absoluteFillObject}>
                    <Animated.View style={[drawerStyles.backdrop, { opacity: drawerAnim }]} />
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={closeDrawer} />
                    <Animated.View
                        style={[
                            drawerStyles.drawer,
                            {
                                transform: [{
                                    translateX: drawerAnim.interpolate({
                                        inputRange: [0, 1], outputRange: [-320, 0],
                                    }),
                                }],
                            },
                        ]}
                    >
                        <View style={drawerStyles.topRow}>
                            <Text style={drawerStyles.title}>Manage</Text>
                            <Pressable hitSlop={10} style={drawerStyles.closeBtn} onPress={closeDrawer}>
                                <Ionicons name="close" size={22} color="#111" />
                            </Pressable>
                        </View>
                        {SidebarMarkup}
                    </Animated.View>
                </View>
            )}

            {/* Notebook Context Menu */}
            <Modal transparent visible={!!notebookMenuTarget} animationType="fade" onRequestClose={() => setNotebookMenuTarget(null)}>
                <View style={StyleSheet.absoluteFillObject}>
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setNotebookMenuTarget(null)} />
                    {!!notebookMenuTarget && notebookMenuAnchor && (() => {
                        const MENU_W = 220
                        const left = isWeb
                            ? notebookMenuAnchor.x + 20
                            : Math.min(Math.max(notebookMenuAnchor.x - MENU_W + 40, 16), windowWidth - MENU_W - 16)
                        const top = isWeb
                            ? Math.max(notebookMenuAnchor.y - 32, 16)
                            : Math.min(notebookMenuAnchor.y + 16, windowHeight - 200)
                        return (
                            <View style={[drawerStyles.contextMenuFloating, isWeb && drawerStyles.contextMenuFloatingWeb, { left, top, width: isWeb ? 160 : MENU_W }]}>
                                {isWeb && <View style={drawerStyles.contextMenuTip} />}
                                <>
                                    {!isWeb && <Text style={drawerStyles.contextMenuFloatingTitle}>Notebook Options</Text>}
                                    <Pressable
                                        style={drawerStyles.contextMenuItem}
                                        onPress={() => {
                                            setColorModalTarget(notebookMenuTarget)
                                            setSelectedColor(notebookMenuTarget.colour_tag || NOTEBOOK_COLORS[0])
                                            setNotebookMenuTarget(null)
                                        }}
                                    >
                                        <Ionicons name="color-palette" size={18} color="#4b5563" />
                                        <Text style={drawerStyles.contextMenuItemText}>Change Color</Text>
                                    </Pressable>
                                    {!isWeb && <View style={drawerStyles.contextMenuDivider} />}
                                    <Pressable
                                        style={drawerStyles.contextMenuItem}
                                        onPress={() => { handleDeleteNotebook(notebookMenuTarget) }}
                                    >
                                        <Ionicons name="trash" size={18} color="#ef4444" />
                                        <Text style={[drawerStyles.contextMenuItemText, { color: '#ef4444' }]}>Delete</Text>
                                    </Pressable>
                                </>
                            </View>
                        )
                    })()}
                </View>
            </Modal>

            {/* Notebook Color Picker Modal */}
            <Modal transparent visible={!!colorModalTarget} animationType="fade" onRequestClose={() => setColorModalTarget(null)}>
                <View style={drawerStyles.deleteModalBackdrop}>
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setColorModalTarget(null)} />
                    <Animated.View style={drawerStyles.colorModalContent}>
                        <Text style={drawerStyles.colorModalTitle}>
                            Change Color: {colorModalTarget?.name}
                        </Text>
                        <Text style={drawerStyles.colorModalMessage}>
                            Select a new color for your notebook.
                        </Text>
                        <View style={drawerStyles.colorGrid}>
                            {NOTEBOOK_COLORS.map(color => (
                                <Pressable
                                    key={color}
                                    onPress={() => setSelectedColor(color)}
                                    style={[drawerStyles.colorSwatchLarge, { backgroundColor: color }]}
                                >
                                    {selectedColor === color && (
                                        <Ionicons name="checkmark" size={24} color="#fff" style={{ opacity: 0.9 }} />
                                    )}
                                </Pressable>
                            ))}
                        </View>
                        <View style={drawerStyles.deleteModalActions}>
                            <Pressable style={drawerStyles.deleteModalCancelBtn} onPress={() => setColorModalTarget(null)}>
                                <Text style={[drawerStyles.deleteModalCancelText, { color: '#6d28d9' }]}>Cancel</Text>
                            </Pressable>
                            <Pressable
                                style={[drawerStyles.deleteModalConfirmBtn, { backgroundColor: '#6d28d9' }]}
                                onPress={() => {
                                    if (colorModalTarget && selectedColor) {
                                        handleNotebookColorChange(colorModalTarget, selectedColor)
                                        setColorModalTarget(null)
                                    }
                                }}
                            >
                                <Text style={drawerStyles.deleteModalConfirmText}>Save</Text>
                            </Pressable>
                        </View>
                    </Animated.View>
                </View>
            </Modal>

            {/* Notebook Delete Confirmation Modal */}
            <Modal transparent visible={!!notebookToDelete} animationType="fade" onRequestClose={() => setNotebookToDelete(null)}>
                <View style={drawerStyles.deleteModalBackdrop}>
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setNotebookToDelete(null)} />
                    <Animated.View style={drawerStyles.deleteModalContent}>
                        <View style={drawerStyles.deleteModalIconWrap}>
                            <Ionicons name="warning-outline" size={36} color="#ef4444" />
                        </View>
                        <Text style={drawerStyles.deleteModalTitle}>
                            Delete &quot;{notebookToDelete?.name}&quot;?
                        </Text>
                        <Text style={drawerStyles.deleteModalMessage}>
                            Deleting this notebook will remove all {notebookToDelete ? notes.filter(n => n.notebook_id === notebookToDelete.id).length : 0} notes within it. This action cannot be undone.
                        </Text>
                        <View style={drawerStyles.deleteModalActions}>
                            <Pressable style={drawerStyles.deleteModalCancelBtn} onPress={() => setNotebookToDelete(null)}>
                                <Text style={drawerStyles.deleteModalCancelText}>Cancel</Text>
                            </Pressable>
                            <Pressable style={drawerStyles.deleteModalConfirmBtn} onPress={confirmDeleteNotebook}>
                                <Text style={drawerStyles.deleteModalConfirmText}>Delete</Text>
                            </Pressable>
                        </View>
                    </Animated.View>
                </View>
            </Modal>

            {/* Anchored Popover */}
            <Modal transparent visible={!!popoverMode} animationType="fade" onRequestClose={() => handleSetPopoverMode(null)}>
                <View style={StyleSheet.absoluteFillObject}>
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={() => handleSetPopoverMode(null)} />
                    {!!popoverMode && (() => {
                        const MENU_W = 240
                        const anchorX = noteActionsAnchor?.x ?? windowWidth - 20
                        const left = Math.max(anchorX - MENU_W - 15, 8)
                        return (
                            <Animated.View style={[styles.popoverWrapper, { width: MENU_W, left, top: topAnim, height: heightAnim }]}>
                                <Animated.View style={[styles.popoverTipBorder, { right: -8, top: tipTopAnim }]} />
                                <Animated.View style={[styles.popoverTip, { right: -7, top: tipTopAnim }]} />
                                <View style={[styles.popoverOverflowHidden, { flex: 1 }]}>
                                    <Animated.View style={[
                                        styles.popoverSlidingContainer,
                                        {
                                            width: MENU_W * 2,
                                            height: '100%',
                                            transform: [{
                                                translateX: slideAnim.interpolate({
                                                    inputRange: [0, 1], outputRange: [0, -MENU_W],
                                                }),
                                            }],
                                        },
                                    ]}>
                                        {/* Actions Panel */}
                                        <View style={{ width: MENU_W, height: 130 }}>
                                            <Text style={styles.popoverTitle} numberOfLines={1}>
                                                {noteActionsTarget?.title || '(Untitled)'}
                                            </Text>
                                            <Pressable style={styles.popoverItem} onPress={() => handleSetPopoverMode('picker')}>
                                                <Ionicons name="folder-outline" size={18} color={tokens.colors.primary} />
                                                <Text style={styles.popoverItemText}>Add to Notebook</Text>
                                            </Pressable>
                                            <Pressable
                                                style={[styles.popoverItem, { borderTopWidth: 1, borderTopColor: '#f1f1f1' }]}
                                                onPress={handleDelete}
                                            >
                                                <Ionicons name="trash-outline" size={18} color="#EF4444" />
                                                <Text style={[styles.popoverItemText, { color: '#EF4444' }]}>Delete Thought</Text>
                                            </Pressable>
                                        </View>

                                        {/* Picker Panel */}
                                        <View style={{ width: MENU_W, paddingBottom: 8, height: '100%' }}>
                                            <View style={styles.popoverHeader}>
                                                <Pressable onPress={() => handleSetPopoverMode('actions')} style={{ padding: 4 }}>
                                                    <Ionicons name="arrow-back" size={20} color="#666" />
                                                </Pressable>
                                                <Text style={styles.popoverTitle}>Choose Notebook</Text>
                                            </View>
                                            <ScrollView style={{ flex: 1 }}>
                                                <Pressable
                                                    style={styles.popoverItem}
                                                    onPress={() => handleAssignNotebook(null)}
                                                    disabled={!!assigningNotebookId}
                                                >
                                                    <View style={[styles.colorDot, { backgroundColor: '#e0e0e0', marginHorizontal: 0, marginRight: 8 }]} />
                                                    <Text style={[styles.popoverItemText, noteActionsTarget?.notebook_id === null && { fontWeight: '700', color: tokens.colors.primary }]}>
                                                        General Notes
                                                    </Text>
                                                    {assigningNotebookId === '__remove__' && <ActivityIndicator size="small" color={tokens.colors.primary} style={{ marginLeft: 'auto' }} />}
                                                </Pressable>
                                                {notebooks.map(nb => (
                                                    <Pressable
                                                        key={nb.id}
                                                        style={styles.popoverItem}
                                                        onPress={() => handleAssignNotebook(nb.id)}
                                                        disabled={!!assigningNotebookId}
                                                    >
                                                        <View style={[styles.colorDot, { backgroundColor: nb.colour_tag || '#e0e0e0', marginHorizontal: 0, marginRight: 8 }]} />
                                                        <Text style={[styles.popoverItemText, noteActionsTarget?.notebook_id === nb.id && { fontWeight: '700', color: tokens.colors.primary }]}>
                                                            {nb.name}
                                                        </Text>
                                                        {assigningNotebookId === nb.id && <ActivityIndicator size="small" color={tokens.colors.primary} style={{ marginLeft: 'auto' }} />}
                                                    </Pressable>
                                                ))}
                                            </ScrollView>
                                        </View>
                                    </Animated.View>
                                </View>
                            </Animated.View>
                        )
                    })()}
                </View>
            </Modal>
        </View>
    )
}

// ─── List / toolbar styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#fff' },
    toolbar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: '#fff',
    },
    toolbarMenuBtn: { padding: 6 },
    listHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 4,
    },
    listHeaderLabel: { fontSize: 16, fontWeight: '800', color: '#111' },
    listHeaderCount: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
    searchBarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginBottom: 8,
        marginTop: 6,
        backgroundColor: '#F9FAFB',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    searchBarInput: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 8,
        fontSize: 14,
        color: '#111',
    },
    newNoteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#6366F1',
        ...Platform.select({
            web: { paddingVertical: 8, paddingHorizontal: 16, cursor: 'pointer' },
            default: { paddingVertical: 5, paddingHorizontal: 10 },
        }),
        borderRadius: 10,
    },
    newNoteBtnText: {
        ...Platform.select({
            web: { fontSize: 14 },
            default: { fontSize: 12 },
        }),
        color: '#fff', fontWeight: '700',
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyTitle: { marginTop: 16, fontSize: 17, fontWeight: '700', color: '#888', textAlign: 'center' },
    emptySubtitle: { marginTop: 6, fontSize: 14, color: '#aaa', textAlign: 'center', maxWidth: 260 },
    createBtn: {
        marginTop: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#6366F1',
        ...Platform.select({
            web: { paddingVertical: 12, paddingHorizontal: 20, cursor: 'pointer' },
            default: { paddingVertical: 8, paddingHorizontal: 14 },
        }),
        borderRadius: 10,
    },
    createBtnText: {
        ...Platform.select({
            web: { fontSize: 15 },
            default: { fontSize: 13 },
        }),
        color: '#fff', fontWeight: '700',
    },
    list: { padding: 16, paddingTop: 8 },
    colorDot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 8 },
    popoverWrapper: {
        position: 'absolute',
        backgroundColor: '#fff',
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 8,
        borderWidth: 1,
        borderColor: '#eee',
    },
    popoverOverflowHidden: { overflow: 'hidden', borderRadius: 12, paddingVertical: 4 },
    popoverSlidingContainer: { flexDirection: 'row' },
    popoverTitle: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 12,
        fontWeight: '700',
        color: '#999',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        borderBottomWidth: 1,
        borderBottomColor: '#f9f9f9',
    },
    popoverHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f9f9f9',
    },
    popoverItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        gap: 12,
    },
    popoverItemText: { fontSize: 14, fontWeight: '600', color: '#333' },
    popoverTip: {
        position: 'absolute',
        width: 14,
        height: 14,
        backgroundColor: '#fff',
        transform: [{ rotate: '45deg' }],
        zIndex: 1,
    },
    popoverTipBorder: {
        position: 'absolute',
        width: 14,
        height: 14,
        backgroundColor: '#eee',
        transform: [{ rotate: '45deg' }],
    },
    toolbarWeb: {
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
        paddingHorizontal: 24,
        paddingVertical: 14,
    },
    webToolbarSearch: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f9fafb',
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingVertical: 8,
        width: 320,
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    searchBarInputWeb: {
        flex: 1,
        marginLeft: 10,
        fontSize: 15,
        color: '#111',
    },
    listHeaderWeb: {
        paddingHorizontal: 32,
        paddingTop: 32,
        paddingBottom: 24,
    },
    listHeaderLabelWeb: { fontSize: 28, color: '#111', textTransform: 'none', letterSpacing: 0, fontWeight: '800' },
    listWeb: { gap: 24, flexDirection: 'row', flexWrap: 'wrap', paddingLeft: 32 },
    fabWeb: {
        position: 'absolute',
        bottom: 32,
        right: 32,
        backgroundColor: '#7c3aed',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 32,
        gap: 8,
        shadowColor: '#7c3aed',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 12,
        cursor: 'pointer' as any,
    },
    fabWebText: { color: '#fff', fontSize: 16, fontWeight: '700' },

    // Skeleton loader
    skeletonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 4,
        marginBottom: 4,
    },
    skeletonDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: tokens.colors.border,
    },
    skeletonTitle: {
        height: 14,
        borderRadius: 8,
        backgroundColor: tokens.colors.border,
        width: '60%',
    },
    skeletonPreview: {
        height: 12,
        borderRadius: 8,
        backgroundColor: tokens.colors.border,
        width: '80%',
    },
    skeletonShimmer: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 120,
        backgroundColor: 'rgba(255,255,255,0.55)',
    },
})

// ─── Note row styles ──────────────────────────────────────────────────────────

const rowStyles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    pressable: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingRight: 10,
    },
    dot: { width: 4, height: 36, borderRadius: 2, backgroundColor: '#d1d5db', marginHorizontal: 10, alignSelf: 'center' },
    content: { flex: 1 },
    title: { fontSize: 14, fontWeight: '600', color: '#111' },
    preview: { fontSize: 12, color: '#6B7280', marginTop: 3, lineHeight: 17 },
    meta: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
    moreBtn: { padding: 10 },
    cardContainer: {
        width: 174,
        height: 220,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        padding: 0,
    },
    cardPressable: {
        flex: 1,
        flexDirection: 'column',
        alignItems: 'flex-start',
        padding: 20,
        paddingHorizontal: 20,
    },
    cardContent: {
        flex: 1,
        width: '100%',
        justifyContent: 'space-between',
    },
    cardPreview: {
        fontSize: 15,
        color: '#374151',
        lineHeight: 22,
        paddingRight: 10,
    },
    cardMeta: {
        fontSize: 13,
        color: '#9ca3af',
        marginTop: 0,
    },
    cardMoreBtn: {
        position: 'absolute',
        top: 20,
        right: 12,
        padding: 4,
    },
})

// ─── Drawer styles ────────────────────────────────────────────────────────────

const drawerStyles = StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
    drawer: Platform.select({
        web: {
            position: 'absolute' as any,
            top: 0, left: 0, bottom: 0,
            width: 300,
            backgroundColor: '#fff',
            paddingTop: 18,
            paddingBottom: 16,
            boxShadow: '4px 0 10px rgba(0,0,0,0.1)',
        } as any,
        default: {
            position: 'absolute',
            top: 0, left: 0, bottom: 0,
            width: 300,
            backgroundColor: '#fff',
            paddingTop: 18,
            paddingBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 4, height: 0 },
            shadowOpacity: 0.1,
            shadowRadius: 10,
            elevation: 10,
        },
    })!,
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
        paddingHorizontal: 16,
    },
    webSidebar: {
        width: 320,
        backgroundColor: '#fff',
        borderRightWidth: 1,
        borderRightColor: '#f3f4f6',
        zIndex: 10,
    },
    webUserProfile: { paddingVertical: 24 },
    webBackRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    webBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    webBackText: { color: '#fff', fontSize: 16 },
    webUserRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 16 },
    webAvatar: {
        width: 64, height: 64, borderRadius: 32,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
        alignItems: 'center', justifyContent: 'center',
    },
    webAvatarText: { color: '#fff', fontSize: 24, fontWeight: '700' },
    webUserInfo: { flex: 1 },
    webAppTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    webUserName: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 2, marginBottom: 2 },
    webUserEmail: { color: 'rgba(255,255,255,0.7)', fontSize: 14, maxWidth: 170 },
    webManageRow: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16 },
    webToolbarActions: { flexDirection: 'row', gap: 8 },
    title: { fontSize: 18, fontWeight: '800', color: '#111' },
    closeBtn: { paddingHorizontal: 6, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F3F4F6' },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        marginTop: 20,
        marginBottom: 8,
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '800',
        color: '#9CA3AF',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        paddingHorizontal: 16,
        marginBottom: 8,
    },
    muted: { fontSize: 12, color: '#9CA3AF', paddingHorizontal: 16, marginTop: 6, fontStyle: 'italic' },
    colorDot: { width: 9, height: 9, borderRadius: 5 },
    notebookRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 2,
        paddingLeft: 16,
        paddingRight: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    notebookRowSelected: { backgroundColor: '#EEF2FF' },
    notebookRowPressable: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingRight: 8 },
    notebookName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111' },
    notebookNameSelected: { color: tokens.colors.primary, fontWeight: '700' },
    notebookNameSelectedWeb: { color: '#fff', fontWeight: '700' },
    notebookCountSelectedWeb: { color: 'rgba(255,255,255,0.7)' },
    notebookCount: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
    notebookMenuBtn: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
    contextMenuFloating: {
        position: 'absolute',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 8,
        borderWidth: 1,
        borderColor: '#f4f4f5',
    },
    contextMenuFloatingWeb: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 10,
    },
    contextMenuTip: {
        position: 'absolute',
        top: 26,
        left: -5,
        width: 10,
        height: 10,
        backgroundColor: '#fff',
        borderLeftWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#f4f4f5',
        transform: [{ rotate: '45deg' }],
    },
    contextMenuFloatingTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 16 },
    contextMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
    contextMenuItemText: { fontSize: 15, fontWeight: '600', color: '#111' },
    contextMenuDivider: { height: 1, backgroundColor: '#f4f4f5', marginVertical: 6 },
    notebookRowHighlighted: { backgroundColor: '#f3f4f6' },
    notebookMenuBtnActive: { backgroundColor: '#e5e7eb', borderRadius: 16 },
    deleteModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    deleteModalContent: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
    deleteModalIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    deleteModalTitle: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 12, textAlign: 'center' },
    deleteModalMessage: { fontSize: 15, color: '#4b5563', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    deleteModalActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', width: '100%', gap: 12 },
    deleteModalCancelBtn: { paddingVertical: 12, paddingHorizontal: 16 },
    deleteModalCancelText: { fontSize: 15, fontWeight: '700', color: '#6b7280' },
    deleteModalConfirmBtn: { backgroundColor: '#ef4444', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
    deleteModalConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    colorModalContent: { backgroundColor: '#fff', borderRadius: 20, padding: 24, paddingBottom: 20, width: '100%', maxWidth: 360, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
    colorModalTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 8, alignSelf: 'flex-start' },
    colorModalMessage: { fontSize: 15, color: '#4b5563', marginBottom: 24, alignSelf: 'flex-start' },
    colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 24, justifyContent: 'center' },
    colorSwatchLarge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    newNotebookRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 16,
        marginBottom: 8,
    },
    newNotebookInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#6366F1',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 7,
        fontSize: 13,
        color: '#111',
        backgroundColor: '#FAFAFE',
    },
    newNotebookSave: {
        backgroundColor: '#6366F1',
        borderRadius: 8,
        paddingVertical: 7,
        paddingHorizontal: 14,
    },
    newNotebookSaveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
})
