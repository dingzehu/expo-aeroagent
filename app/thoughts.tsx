import { Ionicons, MaterialIcons } from '@expo/vector-icons'
import type { Session } from '@supabase/supabase-js'
import { BlurView } from 'expo-blur'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { Stack } from 'expo-router'
import { Sparkles } from 'lucide-react-native'
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
    useWindowDimensions,
    View,
} from 'react-native'
import { MarkdownView } from '@/components/MarkdownView'
import { supabase } from '@/lib/supabase'

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

type PersonaId = 'Executive' | 'Social' | 'Summarize' | 'Academic'
type AutosaveState = 'idle' | 'dirty' | 'syncing' | 'saved' | 'error'

const PERSONAS: { id: PersonaId; label: string }[] = [
    { id: 'Executive', label: 'Executive' },
    { id: 'Social', label: 'Social Media' },
    { id: 'Summarize', label: 'Summarize' },
    { id: 'Academic', label: 'Academic' },
]

const PERSONA_HELP: Record<PersonaId, string> = {
    Executive: 'Formal, bulleted, action-oriented',
    Social: 'Engaging, concise, shareable tone',
    Summarize: 'Short, clear summary with key points',
    Academic: 'Structured, analytical, citation-friendly tone',
}

// ─── Editor styles (defined here so PersonaPill can reference them) ────────────

const editorStyles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#fff',
        padding: 16,
    },
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
    backBtnText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#6366F1',
    },
    autosaveBadge: {
        width: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    autosaveDot: {
        width: 8,
        height: 8,
        borderRadius: 999,
        backgroundColor: '#10B981',
    },
    label: {
        fontSize: 12,
        fontWeight: '800',
        color: '#222',
        marginBottom: 6,
    },
    titleInput: {
        borderWidth: 1,
        borderColor: '#e4e4e7',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#fff',
        fontSize: 15,
    },
    rawInputWrap: {
        flex: 1,
        position: 'relative',
        marginBottom: 0,
    },
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
    magicBar: {
        paddingVertical: 10,
    },
    magicBarContent: {
        gap: 8,
        paddingRight: 8,
    },
    pillBase: {
        borderRadius: 50,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.35)',
    },
    pillGlassFallback: {
        backgroundColor: 'rgba(255,255,255,0.55)',
    },
    pillInner: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pillActiveGlass: Platform.select({
        web: { boxShadow: '0 6px 14px rgba(129, 140, 248, 0.28)' } as any,
        default: {
            shadowColor: '#818CF8',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.28,
            shadowRadius: 14,
            elevation: 8,
        },
    })!,
    pillText: {
        fontSize: 13,
        fontWeight: '900',
        color: '#111827',
    },
    pillTextActive: {
        color: '#fff',
    },
    canvas: {
        flex: 1,
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        padding: 14,
    },
    canvasLabel: {
        fontSize: 11,
        fontWeight: '900',
        color: '#666',
        marginBottom: 10,
        letterSpacing: 0.6,
    },
    card: Platform.select({
        web: {
            flex: 1,
            backgroundColor: '#fff',
            borderRadius: 16,
            padding: 20,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        } as any,
        default: {
            flex: 1,
            backgroundColor: '#fff',
            borderRadius: 16,
            padding: 20,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 12,
            elevation: 5,
        },
    })!,
    cardAiMode: {
        borderWidth: 1,
        borderColor: 'rgba(99,102,241,0.35)',
    },
    cardAiTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 10,
    },
    aiBadge: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: 'rgba(99,102,241,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(99,102,241,0.25)',
    },
    aiBadgeText: {
        fontSize: 12,
        fontWeight: '900',
        color: '#4f46e5',
    },
    backToDraftButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: '#F3F4F6',
    },
    backToDraftText: {
        fontSize: 12,
        fontWeight: '900',
        color: '#374151',
    },
    cardBody: {
        flex: 1,
        marginBottom: 12,
    },
    previewEmpty: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
    },
    previewEmptyIcon: {
        width: 46,
        height: 46,
        borderRadius: 16,
        backgroundColor: 'rgba(99,102,241,0.10)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    previewEmptyTitle: {
        fontSize: 14,
        fontWeight: '900',
        color: '#111827',
        marginBottom: 6,
    },
    previewEmptySubtitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#6b7280',
        textAlign: 'center',
        maxWidth: 320,
    },
    skeletonWrap: {
        position: 'relative',
        overflow: 'hidden',
        paddingVertical: 6,
    },
    skeletonBar: {
        height: 12,
        borderRadius: 8,
        backgroundColor: '#E5E7EB',
        marginBottom: 10,
        width: '72%',
    },
    skeletonBarWide: {
        height: 12,
        borderRadius: 8,
        backgroundColor: '#E5E7EB',
        marginBottom: 10,
        width: '94%',
    },
    skeletonShimmer: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 120,
        backgroundColor: 'rgba(255,255,255,0.55)',
        opacity: 0.9,
    },
    cardFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    cardMetaText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#6b7280',
        flexShrink: 1,
    },
    cardActionsRow: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    copyButton: {
        flex: 1,
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#10B981',
        borderRadius: 14,
        paddingVertical: 12,
    },
    copyButtonCopied: {
        backgroundColor: '#059669',
    },
    copyButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '900',
    },
    shareButton: {
        width: 44,
        height: 44,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#d1d5db',
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
    },
    aiErrorText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#b91c1c',
        marginBottom: 10,
    },
    disabled: {
        opacity: 0.6,
    },
    topSection: {
        flex: 1,
    },
})

// ─── PersonaPill ──────────────────────────────────────────────────────────────

function PersonaPill(props: {
    label: string
    help: string
    active: boolean
    disabled?: boolean
    onPress: () => void
}) {
    const { label, help, active, disabled, onPress } = props
    return (
        <Pressable
            {...(Platform.OS === 'web' ? ({ title: `${label}: ${help}` } as any) : null)}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onPress}
            disabled={disabled}
            style={[editorStyles.pillBase, active && editorStyles.pillActiveGlass, disabled && editorStyles.disabled]}
        >
            {active ? (
                <LinearGradient colors={['#818CF8', '#6366F1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            ) : Platform.OS === 'web' ? (
                <View style={[StyleSheet.absoluteFill, editorStyles.pillGlassFallback]} />
            ) : (
                <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} />
            )}
            <View style={editorStyles.pillInner}>
                <Text style={[editorStyles.pillText, active && editorStyles.pillTextActive]} numberOfLines={1}>
                    {label}
                </Text>
            </View>
        </Pressable>
    )
}

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

type GroupedNotes = {
    notebookId: string | null
    notebookName: string
    colour: string | null
    notes: Note[]
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

    return (
        <View style={rowStyles.container}>
            <Pressable style={rowStyles.pressable} onPress={onPress}>
                <View style={rowStyles.dot} />
                <View style={rowStyles.content}>
                    <Text style={rowStyles.title} numberOfLines={1}>{note.title || 'Untitled'}</Text>
                    {preview.length > 0 && (
                        <Text style={rowStyles.preview} numberOfLines={2}>{preview}</Text>
                    )}
                    <Text style={rowStyles.meta}>{timeAgo(note.updated_at)}</Text>
                </View>
            </Pressable>
            <Pressable
                ref={moreBtnRef}
                hitSlop={10}
                onPress={handleMorePress}
                style={rowStyles.moreBtn}
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

    // Search & notebook management
    const [mainSearch, setMainSearch] = useState('')
    const [newNotebookName, setNewNotebookName] = useState('')
    const [showNewNotebookInput, setShowNewNotebookInput] = useState(false)
    const [creatingNotebook, setCreatingNotebook] = useState(false)

    // Popover
    const [popoverMode, setPopoverMode] = useState<'actions' | 'picker' | null>(null)
    const slideAnim = useRef(new Animated.Value(0)).current
    const heightAnim = useRef(new Animated.Value(130)).current
    const topAnim = useRef(new Animated.Value(0)).current
    const tipTopAnim = useRef(new Animated.Value(0)).current

    // ─── Editor panel state ───────────────────────────────────────────────────
    const [editorVisible, setEditorVisible] = useState(false)
    const editorVisibleRef = useRef(false)   // ref mirror — always current inside subscription closures
    const editorSlideAnim = useRef(new Animated.Value(0)).current

    const [editorNoteId, setEditorNoteId] = useState<string | null>(null)
    const [editorTitle, setEditorTitle] = useState('')
    const [editorContent, setEditorContent] = useState('')
    const [editorFormatted, setEditorFormatted] = useState('')
    const [editorStyle, setEditorStyle] = useState<PersonaId | null>(null)
    const [editorNotebookId, setEditorNotebookId] = useState<string | null>(null)

    const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle')
    const [isPreviewingAI, setIsPreviewingAI] = useState(false)
    const [styling, setStyling] = useState(false)
    const [aiError, setAiError] = useState<string | null>(null)
    const [copiedFlash, setCopiedFlash] = useState(false)

    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const autosaveInFlightRef = useRef(false)
    const autosavePendingRef = useRef(false)
    const lastSavedSigRef = useRef('')
    const lastRawRef = useRef('')
    const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const skeletonAnim = useRef(new Animated.Value(0)).current
    const autosavePulseAnim = useRef(new Animated.Value(0)).current

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
                (n.raw_content ?? '').toLowerCase().includes(q)
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
        Alert.alert(`Delete "${note.title || 'Untitled'}"?`, 'This action cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive',
                onPress: async () => {
                    const { error } = await supabase.from('notes').delete().eq('id', note.id)
                    if (error) { Alert.alert('Error', error.message); return }
                    fetchData()
                },
            },
        ])
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
        Alert.alert(
            `Delete "${nb.name}"?`,
            'Notes in this notebook will move to General Notes.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete', style: 'destructive',
                    onPress: async () => {
                        const { error } = await supabase.from('notebooks').delete().eq('id', nb.id)
                        if (error) { Alert.alert('Error', error.message); return }
                        fetchData({ silent: true })
                    },
                },
            ],
        )
    }

    // ─── Editor open / close ──────────────────────────────────────────────────

    const openEditor = useCallback((note?: Note) => {
        setEditorNoteId(note?.id ?? null)
        setEditorTitle(note?.title ?? '')
        setEditorContent(note?.raw_content ?? '')
        setEditorFormatted('')
        setEditorStyle(null)
        setEditorNotebookId(note?.notebook_id ?? null)
        setAutosaveState('idle')
        setIsPreviewingAI(false)
        setAiError(null)
        lastSavedSigRef.current = note
            ? `${(note.title ?? '').trim()}\n---\n${note.raw_content ?? ''}` : ''
        lastRawRef.current = note?.raw_content ?? ''
        editorVisibleRef.current = true
        setEditorVisible(true)
        Animated.spring(editorSlideAnim, { toValue: 1, useNativeDriver: true, friction: 8, tension: 60 }).start()
    }, [editorSlideAnim])

    const closeEditor = useCallback(() => {
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)

        // Optimistic list update: patch notes state before the slide-back reveals the list,
        // so it shows correct data the instant it becomes visible (no spinner, no reorder flash).
        if (editorNoteId) {
            const nowIso = new Date().toISOString()
            setNotes(prev => {
                const exists = prev.some(n => n.id === editorNoteId)
                const patched = exists
                    ? prev.map(n => n.id === editorNoteId
                        ? { ...n, title: editorTitle || null, raw_content: editorContent || null, updated_at: nowIso }
                        : n
                    )
                    : [{ id: editorNoteId, title: editorTitle || null, raw_content: editorContent || null,
                         updated_at: nowIso, created_at: nowIso, notebook_id: editorNotebookId }, ...prev]
                return patched.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
            })
        }

        Animated.spring(editorSlideAnim, { toValue: 0, useNativeDriver: true, friction: 8, tension: 60 })
            .start(({ finished }) => {
                if (finished) {
                    editorVisibleRef.current = false  // unblock real-time handler after animation
                    setEditorVisible(false)
                    fetchData({ silent: true })       // background reconcile, no spinner
                }
            })
    }, [editorSlideAnim, fetchData, editorNoteId, editorTitle, editorContent, editorNotebookId])

    // ─── Autosave ─────────────────────────────────────────────────────────────

    const makeEditorSig = useCallback((t: string, c: string) => `${t.trim()}\n---\n${c}`, [])

    const saveNoteDraft = useCallback(async (opts?: { reason?: 'debounce' | 'flush' | 'ai' }) => {
        const userId = session?.user?.id
        if (!userId) { setAutosaveState('error'); return false }

        const sig = makeEditorSig(editorTitle, editorContent)
        const hasMeaningfulContent = !!(editorTitle.trim() || editorContent.trim())

        if (!editorNoteId && !hasMeaningfulContent) return true
        if (sig === lastSavedSigRef.current && opts?.reason !== 'flush') return true
        if (autosaveInFlightRef.current) { autosavePendingRef.current = true; return true }

        autosaveInFlightRef.current = true
        setAutosaveState('syncing')

        const nowIso = new Date().toISOString()
        try {
            if (!editorNoteId) {
                const payload = {
                    user_id: userId,
                    title: editorTitle,
                    raw_content: editorContent,
                    formatted_content: editorFormatted || null,
                    selected_style: editorStyle,
                    notebook_id: editorNotebookId ?? null,
                    updated_at: nowIso,
                }
                const { data, error } = await supabase.from('notes').insert(payload).select('id').single()
                if (error) throw error
                setEditorNoteId(data.id)
            } else {
                const payload = {
                    title: editorTitle,
                    raw_content: editorContent,
                    formatted_content: editorFormatted || null,
                    selected_style: editorStyle,
                    updated_at: nowIso,
                }
                const { error } = await supabase.from('notes').update(payload).eq('id', editorNoteId).eq('user_id', userId)
                if (error) throw error
            }
            lastSavedSigRef.current = sig
            setAutosaveState('saved')
            return true
        } catch {
            setAutosaveState('error')
            return false
        } finally {
            autosaveInFlightRef.current = false
            if (autosavePendingRef.current) {
                autosavePendingRef.current = false
                void saveNoteDraft({ reason: 'debounce' })
            }
        }
    }, [editorContent, editorFormatted, editorNoteId, editorNotebookId, editorStyle, editorTitle, makeEditorSig, session?.user?.id])

    // Debounced autosave on content change
    useEffect(() => {
        if (!editorVisible) return
        const userId = session?.user?.id
        if (!userId) return

        const sig = makeEditorSig(editorTitle, editorContent)
        if (sig === lastSavedSigRef.current) return
        if (!editorNoteId && !(editorTitle.trim() || editorContent.trim())) return

        setAutosaveState(prev => prev === 'dirty' ? prev : 'dirty')

        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = setTimeout(() => {
            void saveNoteDraft({ reason: 'debounce' })
        }, 2000)

        return () => {
            if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null }
        }
    }, [editorContent, editorNoteId, editorTitle, editorVisible, makeEditorSig, saveNoteDraft, session?.user?.id])

    // ─── Hybrid preview ───────────────────────────────────────────────────────

    const previewMarkdown = useMemo(
        () => isPreviewingAI ? editorFormatted : editorContent,
        [isPreviewingAI, editorFormatted, editorContent]
    )

    // Exit AI mode when raw content changes
    useEffect(() => {
        const prevRaw = lastRawRef.current
        const didChange = editorContent !== prevRaw
        lastRawRef.current = editorContent
        if (isPreviewingAI && didChange) setIsPreviewingAI(false)
    }, [isPreviewingAI, editorContent])

    // ─── AI Styling ───────────────────────────────────────────────────────────

    const runAiStyling = useCallback(async (persona: PersonaId) => {
        const userId = session?.user?.id
        if (!userId) { setAiError('Login required: please login before using AI styling.'); return }
        if (!editorContent.trim()) { setAiError('Nothing to style: type some notes first.'); return }

        setAiError(null)
        setEditorStyle(persona)
        setStyling(true)

        try {
            const { data: { session: currentSession } } = await supabase.auth.getSession()
            const accessToken = currentSession?.access_token
            if (!accessToken) throw new Error('No access token found. Please login again.')

            const resp = await fetch(`${SUPABASE_URL}/functions/v1/note-style`, {
                method: 'POST',
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ title: editorTitle, raw_content: editorContent, persona }),
            })

            const text = await resp.text()
            if (!resp.ok) {
                throw Object.assign(new Error('Edge Function returned a non-2xx status code'), {
                    status: resp.status, details: text,
                })
            }

            const data = JSON.parse(text)
            const markdown = (data?.formatted_content ?? '') as string
            if (!markdown) throw new Error('Edge function returned empty formatted_content')

            setEditorFormatted(markdown)
            void saveNoteDraft({ reason: 'ai' })
        } catch (e: any) {
            const status = e?.context?.status ?? e?.status
            const details = e?.context?.body ?? e?.context?.response ?? e?.details
            const message = e?.message ?? 'Unknown error'
            const extra = details ? `\nDetails: ${typeof details === 'string' ? details : JSON.stringify(details)}` : ''
            const statusPart = status ? ` (HTTP ${status})` : ''
            setAiError(`AI styling failed${statusPart}: ${message}${extra}`)
            console.error('[AI styling error]', e)
            setIsPreviewingAI(false)
        } finally {
            setStyling(false)
        }
    }, [editorContent, editorTitle, saveNoteDraft, session?.user?.id])

    // ─── Skeleton shimmer ─────────────────────────────────────────────────────

    useEffect(() => {
        if (!styling) return
        skeletonAnim.setValue(0)
        const loop = Animated.loop(
            Animated.timing(skeletonAnim, { toValue: 1, duration: 1100, useNativeDriver: true })
        )
        loop.start()
        return () => loop.stop()
    }, [skeletonAnim, styling])

    const skeletonTranslateX = skeletonAnim.interpolate({ inputRange: [0, 1], outputRange: [-140, 260] })

    // ─── Autosave pulse ───────────────────────────────────────────────────────

    useEffect(() => {
        if (autosaveState !== 'saved') {
            autosavePulseAnim.stopAnimation()
            autosavePulseAnim.setValue(0)
            return
        }
        autosavePulseAnim.setValue(0)
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(autosavePulseAnim, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                Animated.timing(autosavePulseAnim, { toValue: 0, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            ])
        )
        loop.start()
        return () => loop.stop()
    }, [autosavePulseAnim, autosaveState])

    const autosavePulseScale = autosavePulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] })
    const autosavePulseOpacity = autosavePulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.35] })

    // ─── Copy result ──────────────────────────────────────────────────────────

    const copyResult = useCallback(async () => {
        const textToCopy = previewMarkdown || ''
        if (!textToCopy.trim()) { Alert.alert('Nothing to copy', 'Generate some formatted content first.'); return }
        await Clipboard.setStringAsync(textToCopy)
        setCopiedFlash(true)
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
        copiedTimerRef.current = setTimeout(() => setCopiedFlash(false), 1500)
    }, [previewMarkdown])

    useEffect(() => {
        return () => { if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current) }
    }, [])

    // ─── Word count ───────────────────────────────────────────────────────────

    const wordCount = useMemo(() => {
        const text = (previewMarkdown ?? '').trim()
        if (!text) return 0
        return text.split(/\s+/).filter(Boolean).length
    }, [previewMarkdown])

    const readingTimeMinutes = useMemo(() => {
        if (!wordCount) return 0
        return Math.max(1, Math.ceil(wordCount / 200))
    }, [wordCount])

    const editorTranslateX = editorSlideAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -windowWidth],
    })

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <View style={styles.screen}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* ── Toolbar (always at top, never animated) ── */}
            {session?.user && !loading && (
                <View style={styles.toolbar}>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Manage notebooks"
                        onPress={openDrawer}
                        style={styles.toolbarMenuBtn}
                    >
                        <MaterialIcons name="menu" size={24} color="#111" />
                    </Pressable>
                    <Pressable style={styles.newNoteBtn} onPress={() => openEditor()}>
                        <Ionicons name="add" size={18} color="#fff" />
                        <Text style={styles.newNoteBtnText}>New Thought</Text>
                    </Pressable>
                </View>
            )}

            {/* ── Two-panel container (clips overflow so panel 2 is hidden until slid in) ── */}
            <View style={{ flex: 1, overflow: 'hidden' }}>
                <Animated.View
                    style={{
                        flex: 1,
                        flexDirection: 'row',
                        width: windowWidth * 2,
                        transform: [{ translateX: editorTranslateX }],
                    }}
                >
                    {/* ── Panel 1: Notes list ── */}
                    <View style={{ width: windowWidth, flex: 1 }}>
                        {loading ? (
                            <View style={styles.center}>
                                <ActivityIndicator size="large" color="#6366F1" />
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
                            <View style={{ flex: 1 }}>
                                {/* Filter label + count */}
                                <View style={styles.listHeader}>
                                    <Text style={styles.listHeaderLabel}>
                                        {selectedNotebookId
                                            ? (notebooks.find(nb => nb.id === selectedNotebookId)?.name ?? 'Notebook')
                                            : 'All Notes'}
                                    </Text>
                                    <Text style={styles.listHeaderCount}>{filteredNotes.length}</Text>
                                </View>

                                {/* Always-visible search bar */}
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

                                {/* Flat note list */}
                                {filteredNotes.length === 0 ? (
                                    <View style={styles.center}>
                                        <Ionicons name="search-outline" size={40} color="#e0e0e0" />
                                        <Text style={styles.emptyTitle}>
                                            {mainSearch.trim() ? `No results for "${mainSearch}"` : 'No notes here'}
                                        </Text>
                                    </View>
                                ) : (
                                    <ScrollView contentContainerStyle={styles.list}>
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
                    </View>

                    {/* ── Panel 2: Inline editor ── */}
                    <KeyboardAvoidingView
                        style={{ width: windowWidth, flex: 1 }}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        pointerEvents={editorVisible ? 'auto' : 'none'}
                    >
                        <View style={editorStyles.screen}>
                            {/* Back row */}
                            <View style={editorStyles.backRow}>
                                <Pressable style={editorStyles.backBtn} onPress={closeEditor}>
                                    <Ionicons name="arrow-back" size={20} color="#6366F1" />
                                    <Text style={editorStyles.backBtnText}>Thoughts</Text>
                                </Pressable>
                                <View pointerEvents="none" style={editorStyles.autosaveBadge}>
                                    {autosaveState === 'syncing' ? (
                                        <ActivityIndicator size="small" color="#9CA3AF" />
                                    ) : autosaveState === 'saved' ? (
                                        <Animated.View
                                            style={[
                                                editorStyles.autosaveDot,
                                                { transform: [{ scale: autosavePulseScale }], opacity: autosavePulseOpacity },
                                            ]}
                                        />
                                    ) : autosaveState === 'dirty' ? (
                                        <MaterialIcons name="fiber-manual-record" size={10} color="#9CA3AF" />
                                    ) : null}
                                </View>
                            </View>

                            {/* Top section: title + raw notes */}
                            <View style={editorStyles.topSection}>
                                <Text style={editorStyles.label}>Note Title</Text>
                                <TextInput
                                    style={editorStyles.titleInput}
                                    placeholder="Type a title…"
                                    value={editorTitle}
                                    onChangeText={setEditorTitle}
                                    autoCapitalize="sentences"
                                    returnKeyType="done"
                                />
                                <Text style={[editorStyles.label, { marginTop: 12 }]}>Raw Notes</Text>
                                <View style={editorStyles.rawInputWrap}>
                                    <TextInput
                                        style={editorStyles.rawInput}
                                        placeholder="Type your messy thoughts here…"
                                        value={editorContent}
                                        onChangeText={setEditorContent}
                                        multiline
                                        autoFocus={false}
                                        textAlignVertical="top"
                                    />
                                </View>
                            </View>

                            {/* Magic Bar */}
                            <View style={editorStyles.magicBar}>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={editorStyles.magicBarContent}>
                                    {PERSONAS.map(p => {
                                        const active = editorStyle === p.id
                                        const label = styling && active ? 'Styling…' : p.label
                                        return (
                                            <PersonaPill
                                                key={p.id}
                                                label={label}
                                                help={PERSONA_HELP[p.id]}
                                                active={active}
                                                disabled={styling}
                                                onPress={async () => {
                                                    if (Platform.OS !== 'web') {
                                                        try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch { }
                                                    }
                                                    setIsPreviewingAI(editorContent.trim() ? true : false)
                                                    runAiStyling(p.id)
                                                }}
                                            />
                                        )
                                    })}
                                </ScrollView>
                            </View>

                            {/* Canvas */}
                            <View style={editorStyles.canvas}>
                                <Text style={editorStyles.canvasLabel}>AI STYLED PREVIEW</Text>
                                {aiError ? <Text style={editorStyles.aiErrorText}>{aiError}</Text> : null}

                                <View style={[editorStyles.card, isPreviewingAI && editorStyles.cardAiMode]}>
                                    {isPreviewingAI ? (
                                        <View style={editorStyles.cardAiTopRow}>
                                            <View style={editorStyles.aiBadge}>
                                                <Text style={editorStyles.aiBadgeText}>✨ AI Generated</Text>
                                            </View>
                                            <Pressable
                                                accessibilityRole="button"
                                                accessibilityLabel="Back to draft"
                                                onPress={() => setIsPreviewingAI(false)}
                                                style={editorStyles.backToDraftButton}
                                            >
                                                <MaterialIcons name="undo" size={16} color="#374151" />
                                                <Text style={editorStyles.backToDraftText}>Back to Draft</Text>
                                            </Pressable>
                                        </View>
                                    ) : null}

                                    <ScrollView style={editorStyles.cardBody} keyboardShouldPersistTaps="handled">
                                        {styling ? (
                                            <View style={editorStyles.skeletonWrap}>
                                                <View style={editorStyles.skeletonBar} />
                                                <View style={editorStyles.skeletonBarWide} />
                                                <View style={editorStyles.skeletonBar} />
                                                <View style={editorStyles.skeletonBarWide} />
                                                <Animated.View style={[editorStyles.skeletonShimmer, { transform: [{ translateX: skeletonTranslateX }] }]} />
                                            </View>
                                        ) : !previewMarkdown.trim() ? (
                                            <View style={editorStyles.previewEmpty}>
                                                <View style={editorStyles.previewEmptyIcon}>
                                                    <Sparkles size={28} color="#6366F1" />
                                                </View>
                                                <Text style={editorStyles.previewEmptyTitle}>Ready to transform</Text>
                                                <Text style={editorStyles.previewEmptySubtitle}>
                                                    Select a persona above to transform your thoughts.
                                                </Text>
                                            </View>
                                        ) : (
                                            <MarkdownView markdown={previewMarkdown} />
                                        )}
                                    </ScrollView>

                                    <View style={editorStyles.cardFooterRow}>
                                        <Text style={editorStyles.cardMetaText}>
                                            {wordCount ? `${wordCount} words • ${readingTimeMinutes} min read` : '—'}
                                        </Text>
                                        <View style={editorStyles.cardActionsRow}>
                                            <Pressable
                                                style={[
                                                    editorStyles.copyButton,
                                                    copiedFlash && editorStyles.copyButtonCopied,
                                                    (!previewMarkdown.trim() || styling) && editorStyles.disabled,
                                                ]}
                                                onPress={copyResult}
                                                disabled={!previewMarkdown.trim() || styling}
                                            >
                                                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                                                <Text style={editorStyles.copyButtonText}>
                                                    {copiedFlash ? 'Copied! ✅' : 'Copy Result'}
                                                </Text>
                                            </Pressable>
                                            <Pressable
                                                disabled
                                                style={[editorStyles.shareButton, editorStyles.disabled]}
                                                onPress={() => { }}
                                            >
                                                <MaterialIcons name="ios-share" size={18} color="#111827" />
                                            </Pressable>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </Animated.View>
            </View>

            {/* ── Manage drawer (hamburger) — control panel, not a note list ── */}
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

                    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                        {/* All Notes navigation item */}
                        <Pressable
                            style={[drawerStyles.notebookRow, selectedNotebookId === null && drawerStyles.notebookRowSelected]}
                            onPress={() => { setSelectedNotebookId(null); closeDrawer() }}
                        >
                            <Ionicons name="layers-outline" size={16} color={selectedNotebookId === null ? '#6366F1' : '#6B7280'} />
                            <Text style={[drawerStyles.notebookName, selectedNotebookId === null && drawerStyles.notebookNameSelected]}>
                                All Notes
                            </Text>
                            <Text style={drawerStyles.notebookCount}>{notes.length}</Text>
                        </Pressable>

                        {/* Notebooks section header */}
                        <View style={drawerStyles.sectionHeader}>
                            <Text style={drawerStyles.sectionLabel}>Notebooks</Text>
                            <Pressable
                                hitSlop={8}
                                onPress={() => {
                                    setShowNewNotebookInput(v => !v)
                                    setNewNotebookName('')
                                }}
                            >
                                <Ionicons name={showNewNotebookInput ? 'close' : 'add'} size={20} color="#6366F1" />
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
                                    style={[drawerStyles.notebookRow, selectedNotebookId === nb.id && drawerStyles.notebookRowSelected]}
                                >
                                    {/* Row pressable stops before the delete zone (paddingRight reserves space) */}
                                    <Pressable
                                        style={drawerStyles.notebookRowPressable}
                                        onPress={() => { setSelectedNotebookId(nb.id); closeDrawer() }}
                                    >
                                        <View style={[drawerStyles.colorDot, { backgroundColor: nb.colour_tag || '#d1d5db' }]} />
                                        <Text style={[drawerStyles.notebookName, selectedNotebookId === nb.id && drawerStyles.notebookNameSelected]} numberOfLines={1}>
                                            {nb.name}
                                        </Text>
                                        <Text style={drawerStyles.notebookCount}>
                                            {notes.filter(n => n.notebook_id === nb.id).length}
                                        </Text>
                                    </Pressable>
                                    {/* Absolutely positioned delete button so it never overlaps the row pressable */}
                                    <Pressable
                                        onPress={() => handleDeleteNotebook(nb)}
                                        style={drawerStyles.notebookDeleteBtn}
                                    >
                                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                                    </Pressable>
                                </View>
                            ))
                        )}
                    </ScrollView>
                </Animated.View>
            </View>

            {/* ── Anchored Popover ── */}
            <Modal
                transparent
                visible={!!popoverMode}
                animationType="fade"
                onRequestClose={() => handleSetPopoverMode(null)}
            >
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
                                                <Ionicons name="folder-outline" size={18} color="#4F46E5" />
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
                                                    <Text style={[styles.popoverItemText, noteActionsTarget?.notebook_id === null && { fontWeight: '700', color: '#4F46E5' }]}>
                                                        General Notes
                                                    </Text>
                                                    {assigningNotebookId === '__remove__' && <ActivityIndicator size="small" color="#4F46E5" style={{ marginLeft: 'auto' }} />}
                                                </Pressable>
                                                {notebooks.map(nb => (
                                                    <Pressable
                                                        key={nb.id}
                                                        style={styles.popoverItem}
                                                        onPress={() => handleAssignNotebook(nb.id)}
                                                        disabled={!!assigningNotebookId}
                                                    >
                                                        <View style={[styles.colorDot, { backgroundColor: nb.colour_tag || '#e0e0e0', marginHorizontal: 0, marginRight: 8 }]} />
                                                        <Text style={[styles.popoverItemText, noteActionsTarget?.notebook_id === nb.id && { fontWeight: '700', color: '#4F46E5' }]}>
                                                            {nb.name}
                                                        </Text>
                                                        {assigningNotebookId === nb.id && <ActivityIndicator size="small" color="#4F46E5" style={{ marginLeft: 'auto' }} />}
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
            web: { paddingVertical: 8, paddingHorizontal: 16 },
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
            web: { paddingVertical: 12, paddingHorizontal: 20 },
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
    groupContainer: {
        marginBottom: 8,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#fff',
    },
    groupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: '#f9fafb',
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    colorDot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 8 },
    groupTitle: { fontSize: 14, fontWeight: '800', color: '#374151', flex: 1, marginLeft: 4 },
    groupContent: { paddingLeft: 20 },
    // Popover
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
    // Notebook rows
    notebookRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 2,
        paddingLeft: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    notebookRowSelected: { backgroundColor: '#EEF2FF' },
    // flex: 1 but with paddingRight so it never reaches the delete button's zone
    notebookRowPressable: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingRight: 8 },
    notebookName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111' },
    notebookNameSelected: { color: '#4F46E5', fontWeight: '700' },
    notebookCount: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
    // Large tap target, absolutely clear of the row pressable
    notebookDeleteBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    // New notebook input
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
