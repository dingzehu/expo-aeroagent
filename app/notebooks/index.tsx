import { Ionicons } from '@expo/vector-icons'
import type { Session } from '@supabase/supabase-js'
import { Stack, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { supabase } from '../../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type Notebook = {
  id: string
  name: string
  colour_tag: string | null
  created_at: string
  note_count?: number
}

// ─── Colour options for the picker ────────────────────────────────────────────

const COLORS = [
  { label: 'Indigo', value: '#6366F1' },
  { label: 'Pink', value: '#EC4899' },
  { label: 'Teal', value: '#14B8A6' },
  { label: 'Amber', value: '#F59E0B' },
  { label: 'Rose', value: '#F43F5E' },
  { label: 'Slate', value: '#64748B' },
]

// ─── New Notebook Modal ───────────────────────────────────────────────────────

function NewNotebookModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean
  onClose: () => void
  onCreated: (nb: Notebook) => void
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[0].value)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const reset = () => {
    setName('')
    setColor(COLORS[0].value)
    setErrorMsg(null)
  }

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setErrorMsg(null)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      setErrorMsg('You must be signed in to create notebooks.')
      return
    }

    setSaving(true)
    const { data, error } = await supabase
      .from('notebooks')
      .insert({ name: trimmed, colour_tag: color, user_id: session.user.id })
      .select('id, name, colour_tag, created_at')
      .single()

    setSaving(false)
    if (error) {
      console.error('[NewNotebook] Supabase error:', error)
      setErrorMsg(error.message)
      return
    }
    onCreated(data as Notebook)
    reset()
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modal.overlay} onPress={onClose}>
        <Pressable style={modal.card} onPress={() => { }}>
          <Text style={modal.title}>New Notebook</Text>

          <Text style={modal.label}>Name</Text>
          <TextInput
            style={modal.input}
            placeholder="e.g. Work notes"
            placeholderTextColor="#aaa"
            value={name}
            onChangeText={(t) => { setName(t); setErrorMsg(null) }}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />

          <Text style={modal.label}>Colour</Text>
          <View style={modal.colorRow}>
            {COLORS.map((c) => (
              <Pressable
                key={c.value}
                style={[modal.colorSwatch, { backgroundColor: c.value }, color === c.value && modal.colorSelected]}
                onPress={() => setColor(c.value)}
              />
            ))}
          </View>

          {errorMsg ? (
            <View style={modal.errorBox}>
              <Ionicons name="alert-circle-outline" size={14} color="#ef4444" />
              <Text style={modal.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          <View style={modal.buttonRow}>
            <Pressable style={modal.cancelBtn} onPress={() => { reset(); onClose() }}>
              <Text style={modal.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[modal.createBtn, { backgroundColor: color }, (!name.trim() || saving) && { opacity: 0.5 }]}
              onPress={handleCreate}
              disabled={!name.trim() || saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={modal.createText}>Create</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ─── Notebook Card ────────────────────────────────────────────────────────────

function NotebookCard({
  notebook,
  onPress,
  onDelete,
}: {
  notebook: Notebook
  onPress: () => void
  onDelete: () => void
}) {
  const color = notebook.colour_tag || '#6366F1'
  const initials = notebook.name.slice(0, 2).toUpperCase()

  return (
    <Pressable style={card.wrap} onPress={onPress}>
      <View style={[card.icon, { backgroundColor: color + '22' }]}>
        <Text style={[card.initials, { color }]}>{initials}</Text>
      </View>
      <View style={card.info}>
        <Text style={card.name} numberOfLines={1}>{notebook.name}</Text>
        <Text style={card.meta}>
          {notebook.note_count !== undefined
            ? `${notebook.note_count} note${notebook.note_count !== 1 ? 's' : ''}`
            : '—'}
        </Text>
      </View>
      <View style={[card.accent, { backgroundColor: color }]} />
      <Pressable
        hitSlop={10}
        onPress={(e) => { e.stopPropagation?.(); onDelete() }}
        style={card.deleteBtn}
      >
        <Ionicons name="trash-outline" size={16} color="#aaa" />
      </Pressable>
    </Pressable>
  )
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function NotebooksScreen() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const fetchNotebooks = useCallback(async () => {
    const { data: { session: s } } = await supabase.auth.getSession()
    if (!s?.user) { setLoading(false); return }

    setLoading(true)
    const { data, error } = await supabase
      .from('notebooks')
      .select('id, name, colour_tag, created_at')
      .eq('user_id', s.user.id)
      .order('created_at', { ascending: false })

    if (!error && data) {
      const withCounts = await Promise.all(
        (data as Notebook[]).map(async (nb) => {
          const { count } = await supabase
            .from('notes')
            .select('id', { count: 'exact', head: true })
            .eq('notebook_id', nb.id)
          return { ...nb, note_count: count ?? 0 }
        })
      )
      setNotebooks(withCounts)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchNotebooks() }, [fetchNotebooks])

  // Real-time subscription for notebooks list
  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return

    console.log('[Realtime] Subscribing to notebooks (list) for user:', userId)
    const channel = supabase
      .channel('public:notebooks:list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notebooks', filter: `user_id=eq.${userId}` },
        (payload) => {
          console.log('[Realtime] Notebook list change:', payload.eventType)
          fetchNotebooks()
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Notebooks list status:', status)
      })

    const notesChannel = supabase
      .channel('public:notes:count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${userId}` },
        (payload) => {
          console.log('[Realtime] Note count change:', payload.eventType)
          fetchNotebooks()
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Notes count status:', status)
      })

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(notesChannel)
    }
  }, [session?.user?.id, fetchNotebooks])

  const handleDelete = (nb: Notebook) => {
    Alert.alert(
      `Delete "${nb.name}"?`,
      'All notes inside will be unlinked but not deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('notebooks').delete().eq('id', nb.id)
            setNotebooks((prev) => prev.filter((x) => x.id !== nb.id))
          },
        },
      ]
    )
  }

  return (
    <View style={s.screen}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable onPress={() => router.replace('/')} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111' }}>Aero Agent</Text>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#999', marginHorizontal: 8 }}>/</Text>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111' }}>Library</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={() => setShowNew(true)} style={{ paddingHorizontal: 14, paddingVertical: 6 }}>
              <Ionicons name="add" size={26} color="#6366F1" />
            </Pressable>
          ),
        }}
      />

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      ) : !session?.user ? (
        <View style={s.center}>
          <Ionicons name="lock-closed-outline" size={48} color="#ddd" />
          <Text style={s.emptyTitle}>Sign in to see your notebooks</Text>
        </View>
      ) : notebooks.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="book-outline" size={56} color="#e0e0e0" />
          <Text style={s.emptyTitle}>No notebooks yet</Text>
          <Text style={s.emptySubtitle}>Tap + to create your first notebook.</Text>
          <Pressable style={s.createBtn} onPress={() => setShowNew(true)}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={s.createBtnText}>New Notebook</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          <Text style={s.sectionLabel}>
            {notebooks.length} notebook{notebooks.length !== 1 ? 's' : ''}
          </Text>
          {notebooks.map((nb) => (
            <NotebookCard
              key={nb.id}
              notebook={nb}
              onPress={() => router.push(`/notebooks/${nb.id}`)}
              onDelete={() => handleDelete(nb)}
            />
          ))}
        </ScrollView>
      )}

      <NewNotebookModal
        visible={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(nb) => setNotebooks((prev) => [{ ...nb, note_count: 0 }, ...prev])}
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    backgroundColor: '#6366F1',
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
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: 16, fontWeight: '800' },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: '#111' },
  meta: { marginTop: 3, fontSize: 12, color: '#999', fontWeight: '500' },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  deleteBtn: { padding: 6 },
})

const modal = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 18 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e4e4e7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
    marginBottom: 18,
  },
  colorRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  colorSwatch: { width: 30, height: 30, borderRadius: 999 },
  colorSelected: { borderWidth: 3, borderColor: '#111' },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#f4f4f5' },
  cancelText: { fontWeight: '600', color: '#555' },
  createBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  createText: { fontWeight: '700', color: '#fff', fontSize: 15 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 14,
  },
  errorText: { flex: 1, fontSize: 13, color: '#ef4444' },
})
