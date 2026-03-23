// context/AppDataContext.tsx
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Alert, Platform } from 'react-native'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Task = {
  id: string
  user_id: string
  capture_id: string | null
  title: string
  completed: boolean
  completed_at: string | null
  due_date: string | null
  created_at: string
  updated_at: string
}

export type ShoppingItem = {
  id: string
  user_id: string
  capture_id: string | null
  item_name: string
  quantity: string | null
  completed: boolean
  completed_at: string | null
  created_at: string
}

export type JournalEntry = {
  id: string
  user_id: string
  capture_id: string | null
  content: string
  mood: string | null
  created_at: string
}

// ─── Context shape ────────────────────────────────────────────────────────────

type AppDataContextValue = {
  isSignedIn: boolean

  tasks: Task[]
  tasksLoading: boolean
  toggleTask: (task: Task) => Promise<void>
  deleteTask: (task: Task) => Promise<void>
  updateTaskTitle: (taskId: string, newTitle: string) => Promise<void>
  setTaskDueDate: (taskId: string, dueDate: string | null) => Promise<void>

  shoppingItems: ShoppingItem[]
  shoppingLoading: boolean
  toggleShoppingItem: (item: ShoppingItem) => Promise<void>
  deleteShoppingItem: (item: ShoppingItem) => Promise<void>
  updateQuantity: (itemId: string, qty: string) => Promise<void>

  journalEntries: JournalEntry[]
  journalLoading: boolean
  removeJournalEntry: (id: string) => void
  updateJournalEntryContent: (id: string, content: string) => void

  invalidateTasks: () => Promise<void>
  invalidateShopping: () => Promise<void>
  invalidateJournal: () => Promise<void>
}

const AppDataContext = createContext<AppDataContextValue>({
  isSignedIn: false,
  tasks: [], tasksLoading: false,
  toggleTask: async () => {}, deleteTask: async () => {}, updateTaskTitle: async () => {}, setTaskDueDate: async () => {},
  shoppingItems: [], shoppingLoading: false,
  toggleShoppingItem: async () => {}, deleteShoppingItem: async () => {}, updateQuantity: async () => {},
  journalEntries: [], journalLoading: false,
  removeJournalEntry: () => {}, updateJournalEntryContent: () => {},
  invalidateTasks: async () => {}, invalidateShopping: async () => {}, invalidateJournal: async () => {},
})

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)

  const [tasks, setTasks] = useState<Task[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)

  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([])
  const [shoppingLoading, setShoppingLoading] = useState(false)

  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [journalLoading, setJournalLoading] = useState(false)

  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([])

  // ─── Fetch helpers ──────────────────────────────────────────────────────────

  const fetchTasks = useCallback(async (uid: string, silent = false) => {
    if (!silent) setTasksLoading(true)
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
    setTasks((data as Task[]) ?? [])
    if (!silent) setTasksLoading(false)
  }, [])

  const fetchShopping = useCallback(async (uid: string, silent = false) => {
    if (!silent) setShoppingLoading(true)
    const { data } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
    setShoppingItems((data as ShoppingItem[]) ?? [])
    if (!silent) setShoppingLoading(false)
  }, [])

  const fetchJournal = useCallback(async (uid: string, silent = false) => {
    if (!silent) setJournalLoading(true)
    const { data } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
    setJournalEntries((data as JournalEntry[]) ?? [])
    if (!silent) setJournalLoading(false)
  }, [])

  // ─── Realtime subscriptions ─────────────────────────────────────────────────

  const teardownChannels = useCallback(() => {
    channelsRef.current.forEach(ch => supabase.removeChannel(ch))
    channelsRef.current = []
  }, [])

  const setupChannels = useCallback((uid: string) => {
    teardownChannels()
    const t = supabase
      .channel(`appdata:tasks:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${uid}` }, () => fetchTasks(uid, true))
      .subscribe()
    const s = supabase
      .channel(`appdata:shopping:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter: `user_id=eq.${uid}` }, () => fetchShopping(uid, true))
      .subscribe()
    const j = supabase
      .channel(`appdata:journal:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_entries', filter: `user_id=eq.${uid}` }, () => fetchJournal(uid, true))
      .subscribe()
    channelsRef.current = [t, s, j]
  }, [teardownChannels, fetchTasks, fetchShopping, fetchJournal])

  // ─── Auth listener ──────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null
      setUserId(uid)
      if (uid) {
        fetchTasks(uid)
        fetchShopping(uid)
        fetchJournal(uid)
        setupChannels(uid)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null
      setUserId(uid)
      if (uid) {
        fetchTasks(uid)
        fetchShopping(uid)
        fetchJournal(uid)
        setupChannels(uid)
      } else {
        setTasks([])
        setShoppingItems([])
        setJournalEntries([])
        teardownChannels()
      }
    })

    return () => {
      sub.subscription.unsubscribe()
      teardownChannels()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Task mutations ─────────────────────────────────────────────────────────

  const toggleTask = useCallback(async (task: Task) => {
    const newCompleted = !task.completed
    const completed_at = newCompleted ? new Date().toISOString() : null
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: newCompleted, completed_at } : t))
    await supabase.from('tasks').update({ completed: newCompleted, completed_at }).eq('id', task.id)
  }, [])

  const deleteTask = useCallback(async (task: Task) => {
    const doDelete = async () => {
      setTasks(prev => prev.filter(t => t.id !== task.id))
      await supabase.from('tasks').delete().eq('id', task.id)
    }
    if (Platform.OS === 'web') {
      if (confirm('Delete this task?')) doDelete()
    } else {
      Alert.alert('Delete Task', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ])
    }
  }, [])

  const updateTaskTitle = useCallback(async (taskId: string, newTitle: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, title: newTitle } : t))
    await supabase.from('tasks').update({ title: newTitle }).eq('id', taskId)
  }, [])

  const setTaskDueDate = useCallback(async (taskId: string, dueDate: string | null) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, due_date: dueDate } : t))
    await supabase.from('tasks').update({ due_date: dueDate }).eq('id', taskId)
  }, [])

  // ─── Shopping mutations ─────────────────────────────────────────────────────

  const toggleShoppingItem = useCallback(async (item: ShoppingItem) => {
    const newCompleted = !item.completed
    const completed_at = newCompleted ? new Date().toISOString() : null
    setShoppingItems(prev => prev.map(i => i.id === item.id ? { ...i, completed: newCompleted, completed_at } : i))
    await supabase.from('shopping_items').update({ completed: newCompleted, completed_at }).eq('id', item.id)
  }, [])

  const deleteShoppingItem = useCallback(async (item: ShoppingItem) => {
    const doDelete = async () => {
      setShoppingItems(prev => prev.filter(i => i.id !== item.id))
      await supabase.from('shopping_items').delete().eq('id', item.id)
    }
    if (Platform.OS === 'web') {
      if (confirm('Delete this item?')) doDelete()
    } else {
      Alert.alert('Delete Item', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ])
    }
  }, [])

  const updateQuantity = useCallback(async (itemId: string, qty: string) => {
    const value = qty || null
    setShoppingItems(prev => prev.map(i => i.id === itemId ? { ...i, quantity: value } : i))
    await supabase.from('shopping_items').update({ quantity: value }).eq('id', itemId)
  }, [])

  // ─── Journal local-only mutations (Realtime handles server sync) ────────────

  const removeJournalEntry = useCallback((id: string) => {
    setJournalEntries(prev => prev.filter(e => e.id !== id))
  }, [])

  const updateJournalEntryContent = useCallback((id: string, content: string) => {
    setJournalEntries(prev => prev.map(e => e.id === id ? { ...e, content } : e))
  }, [])

  // ─── Invalidation (for post-capture refresh) ────────────────────────────────

  const invalidateTasks = useCallback(async () => {
    if (userId) await fetchTasks(userId, true)
  }, [userId, fetchTasks])

  const invalidateShopping = useCallback(async () => {
    if (userId) await fetchShopping(userId, true)
  }, [userId, fetchShopping])

  const invalidateJournal = useCallback(async () => {
    if (userId) await fetchJournal(userId, true)
  }, [userId, fetchJournal])

  return (
    <AppDataContext.Provider value={{
      isSignedIn: userId !== null,
      tasks, tasksLoading, toggleTask, deleteTask, updateTaskTitle, setTaskDueDate,
      shoppingItems, shoppingLoading, toggleShoppingItem, deleteShoppingItem, updateQuantity,
      journalEntries, journalLoading, removeJournalEntry, updateJournalEntryContent,
      invalidateTasks, invalidateShopping, invalidateJournal,
    }}>
      {children}
    </AppDataContext.Provider>
  )
}

export function useAppData() {
  return useContext(AppDataContext)
}
