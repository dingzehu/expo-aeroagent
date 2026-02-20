import { Ionicons } from '@expo/vector-icons'
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
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
  onDelete,
}: {
  note: Note
  accentColor: string
  onPress: () => void
  onDelete: () => void
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
        onPress={(e) => { e.stopPropagation?.(); onDelete() }}
        style={card.deleteBtn}
      >
        <Ionicons name="trash-outline" size={15} color="#ccc" />
      </Pressable>
    </Pressable>
  )
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function NotebookDetailScreen() {
  const { notebookId } = useLocalSearchParams<{ notebookId: string }>()
  const router = useRouter()

  const [notebook, setNotebook] = useState<Notebook | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)

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

  // Initial load
  useEffect(() => { fetchData() }, [fetchData])

  // Refresh when returning from the note editor
  useFocusEffect(useCallback(() => { fetchData() }, [fetchData]))

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

  // Open the full note editor with notebook context
  const openEditor = (note?: Note) => {
    const base = `/notebook?notebookId=${notebookId}`
    if (note) {
      router.push(`${base}&noteId=${note.id}`)
    } else {
      router.push(base)
    }
  }

  return (
    <View style={s.screen}>
      <Stack.Screen
        options={{
          title: notebook?.name ?? 'Notebook',
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
              onDelete={() => handleDelete(note)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F9FAFB' },
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
  deleteBtn: { padding: 6 },
})
