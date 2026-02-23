import { Ionicons } from '@expo/vector-icons'
import type { Session } from '@supabase/supabase-js'
import { Stack, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View
} from 'react-native'
import ProfileHeader from '../components/ProfileHeader'
import { supabase } from '../lib/supabase'

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

// ─── Note Row ──────────────────────────────────────────────────────────────────

function NoteRow({
    note,
    onPress,
    onMorePress,
}: {
    note: Note
    onPress: () => void
    onMorePress: (anchor: { x: number, y: number }) => void
}) {
    const moreBtnRef = useRef<View>(null)

    const handleMorePress = () => {
        moreBtnRef.current?.measureInWindow((x, y, width, height) => {
            // Provide the center point of the icon as the anchor
            onMorePress({ x: x + width / 2, y: y + height / 2 })
        })
    }

    return (
        <View style={rowStyles.container}>
            <Pressable style={rowStyles.pressable} onPress={onPress}>
                <View style={rowStyles.dot} />
                <View style={rowStyles.content}>
                    <Text style={rowStyles.title} numberOfLines={1}>{note.title || 'Untitled'}</Text>
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

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ThoughtsScreen() {
    const router = useRouter()
    const { width: windowWidth, height: windowHeight } = useWindowDimensions()
    const [session, setSession] = useState<Session | null>(null)
    const [notes, setNotes] = useState<Note[]>([])
    const [notebooks, setNotebooks] = useState<Notebook[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedNotebookIds, setExpandedNotebookIds] = useState<string[]>(['__none__'])

    // Popover state
    const [popoverMode, setPopoverMode] = useState<'actions' | 'picker' | null>(null)
    const [noteActionsAnchor, setNoteActionsAnchor] = useState<{ x: number, y: number } | null>(null)
    const [noteActionsTarget, setNoteActionsTarget] = useState<Note | null>(null)
    const [assigningNotebookId, setAssigningNotebookId] = useState<string | null>(null)

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => setSession(data.session))
        const { data: sub } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
        return () => sub.subscription.unsubscribe()
    }, [])

    const fetchData = useCallback(async () => {
        const { data: { session: s } } = await supabase.auth.getSession()
        if (!s?.user) { setLoading(false); return }

        setLoading(true)

        // Fetch notebooks
        const { data: nbData } = await supabase
            .from('notebooks')
            .select('id, name, colour_tag')
            .eq('user_id', s.user.id)

        if (nbData) setNotebooks(nbData as Notebook[])

        // Fetch notes
        const { data: noteData, error: noteError } = await supabase
            .from('notes')
            .select('id, title, raw_content, updated_at, created_at, notebook_id')
            .eq('user_id', s.user.id)
            .order('updated_at', { ascending: false })

        if (!noteError && noteData) {
            setNotes(noteData as Note[])
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // Real-time subscription
    useEffect(() => {
        const userId = session?.user?.id
        if (!userId) return

        const channel = supabase
            .channel('public:thoughts')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${userId}` },
                () => fetchData()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'notebooks', filter: `user_id=eq.${userId}` },
                () => fetchData()
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [session?.user?.id, fetchData])

    const groupedNotes = useMemo(() => {
        const groups: Record<string, GroupedNotes> = {}

        // Bucket for notes without a notebook
        groups['__none__'] = { notebookId: null, notebookName: 'General Notes', colour: null, notes: [] }

        // Buckets for existing notebooks
        notebooks.forEach(nb => {
            groups[nb.id] = { notebookId: nb.id, notebookName: nb.name, colour: nb.colour_tag, notes: [] }
        })

        // Populate buckets
        notes.forEach(note => {
            const nid = note.notebook_id || '__none__'
            if (!groups[nid]) {
                groups[nid] = { notebookId: nid, notebookName: 'Other', colour: null, notes: [] }
            }
            groups[nid].notes.push(note)
        })

        // Return buckets with notes, starting with General Notes then alpha by name
        const result = Object.values(groups).filter(g => g.notes.length > 0)
        return result.sort((a, b) => {
            if (a.notebookId === null) return -1
            if (b.notebookId === null) return 1
            return a.notebookName.localeCompare(b.notebookName)
        })
    }, [notebooks, notes])

    const toggleExpand = (id: string) => {
        setExpandedNotebookIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        )
    }

    const openNoteActionsAt = (note: Note, anchor: { x: number, y: number }) => {
        setNoteActionsTarget(note)
        setNoteActionsAnchor(anchor)
        setPopoverMode('actions')
    }

    const handleDelete = () => {
        if (!noteActionsTarget) return
        const note = noteActionsTarget
        setPopoverMode(null)

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
                        fetchData()
                    },
                },
            ]
        )
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
        setPopoverMode(null)
        if (error) {
            Alert.alert('Error', error.message)
        } else {
            fetchData()
        }
    }

    const openEditor = (note?: Note) => {
        if (note) {
            router.push({
                pathname: '/notes',
                params: { noteId: note.id, notebookId: note.notebook_id || '' } as any
            })
        } else {
            router.push('/notes')
        }
    }

    return (
        <View style={styles.screen}>
            <Stack.Screen
                options={{
                    headerTitle: () => (
                        <Pressable onPress={() => router.replace('/')} style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111' }}>Aero Agent</Text>
                            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#999', marginHorizontal: 8 }}>/</Text>
                            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111' }}>Thoughts</Text>
                        </Pressable>
                    ),
                    headerRight: () => (
                        <Pressable onPress={() => openEditor()} style={{ paddingHorizontal: 14, paddingVertical: 6 }}>
                            <Ionicons name="add" size={26} color="#6366F1" />
                        </Pressable>
                    ),
                }}
            />

            {session?.user && <ProfileHeader email={session.user.email} />}

            <View style={styles.mainContent}>
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
                    <ScrollView contentContainerStyle={styles.list}>
                        {groupedNotes.map(group => {
                            const groupId = group.notebookId || '__none__'
                            const isExpanded = expandedNotebookIds.includes(groupId)

                            return (
                                <View key={groupId} style={styles.groupContainer}>
                                    <Pressable
                                        style={styles.groupHeader}
                                        onPress={() => toggleExpand(groupId)}
                                    >
                                        <Ionicons
                                            name={isExpanded ? "chevron-down" : "chevron-forward"}
                                            size={20}
                                            color="#666"
                                        />
                                        {group.colour && (
                                            <View style={[styles.colorDot, { backgroundColor: group.colour }]} />
                                        )}
                                        <Text style={styles.groupTitle}>
                                            {group.notebookName} ({group.notes.length})
                                        </Text>
                                    </Pressable>

                                    {isExpanded && (
                                        <View style={styles.groupContent}>
                                            {group.notes.map(note => (
                                                <NoteRow
                                                    key={note.id}
                                                    note={note}
                                                    onPress={() => openEditor(note)}
                                                    onMorePress={(anchor) => openNoteActionsAt(note, anchor)}
                                                />
                                            ))}
                                        </View>
                                    )}
                                </View>
                            )
                        })}
                    </ScrollView>
                )}
            </View>

            {/* Anchored Popover */}
            <Modal
                transparent
                visible={!!popoverMode}
                animationType="fade"
                onRequestClose={() => setPopoverMode(null)}
            >
                <View style={StyleSheet.absoluteFillObject}>
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setPopoverMode(null)} />

                    {popoverMode === 'actions' && (() => {
                        const MENU_W = 240
                        const MENU_H = 160
                        const anchorX = noteActionsAnchor?.x ?? windowWidth - 20
                        const anchorY = noteActionsAnchor?.y ?? 120

                        const left = Math.max(anchorX - MENU_W - 15, 8)
                        // Buffer for bottom nav (80px) and top status bar (40px)
                        const top = Math.min(Math.max(anchorY - MENU_H / 2, 40), windowHeight - MENU_H - 80)

                        // Tip calculation: point exactly at anchorY relative to popover top
                        const tipTop = Math.min(Math.max(anchorY - top - 7, 10), MENU_H - 24)

                        return (
                            <View style={[styles.popover, { width: MENU_W, left, top }]}>
                                <View style={[styles.popoverTipBorder, { right: -8, top: tipTop }]} />
                                <View style={[styles.popoverTip, { right: -7, top: tipTop }]} />

                                <Text style={styles.popoverTitle} numberOfLines={1}>
                                    {noteActionsTarget?.title || '(Untitled)'}
                                </Text>
                                <Pressable
                                    style={styles.popoverItem}
                                    onPress={() => setPopoverMode('picker')}
                                >
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
                        )
                    })()}

                    {popoverMode === 'picker' && (() => {
                        const MENU_W = 240
                        const MENU_H = 400
                        const anchorX = noteActionsAnchor?.x ?? windowWidth - 20
                        const anchorY = noteActionsAnchor?.y ?? 120

                        const left = Math.max(anchorX - MENU_W - 15, 8)
                        // Buffer for bottom nav (80px) and top status bar (40px)
                        const top = Math.min(Math.max(anchorY - MENU_H / 2, 40), windowHeight - MENU_H - 80)

                        const tipTop = Math.min(Math.max(anchorY - top - 7, 10), MENU_H - 24)

                        return (
                            <View style={[styles.popover, { width: MENU_W, left, top, paddingBottom: 8 }]}>
                                <View style={[styles.popoverTipBorder, { right: -8, top: tipTop }]} />
                                <View style={[styles.popoverTip, { right: -7, top: tipTop }]} />
                                <View style={styles.popoverHeader}>
                                    <Pressable onPress={() => setPopoverMode('actions')} style={{ padding: 4 }}>
                                        <Ionicons name="arrow-back" size={20} color="#666" />
                                    </Pressable>
                                    <Text style={styles.popoverTitle}>Choose Notebook</Text>
                                </View>
                                <ScrollView style={{ maxHeight: 300 }}>
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
                        )
                    })()}
                </View>
            </Modal>
        </View>
    )
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#fff' },
    mainContent: { flex: 2 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyTitle: { marginTop: 16, fontSize: 17, fontWeight: '700', color: '#888', textAlign: 'center' },
    emptySubtitle: { marginTop: 6, fontSize: 14, color: '#aaa', textAlign: 'center', maxWidth: 260 },
    createBtn: {
        marginTop: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#6366F1',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 10,
    },
    createBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    list: { padding: 16 },
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
    colorDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginHorizontal: 8,
    },
    groupTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: '#374151',
        flex: 1,
        marginLeft: 4,
    },
    groupContent: {
        paddingLeft: 20,
    },
    // Popover Styles
    popover: {
        position: 'absolute',
        backgroundColor: '#fff',
        borderRadius: 12,
        paddingVertical: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 8,
        borderWidth: 1,
        borderColor: '#eee',
    },
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
    popoverItemText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
    },
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
    dot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#d1d5db',
        marginHorizontal: 10,
    },
    content: {
        flex: 1,
    },
    title: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    meta: {
        fontSize: 11,
        color: '#9ca3af',
        marginTop: 2,
    },
    moreBtn: {
        padding: 10,
    },
})
