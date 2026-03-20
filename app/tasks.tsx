import { Ionicons } from '@expo/vector-icons'
import { Stack, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { tokens } from '../constants/tokens'
import { TabSlideWrapper } from '../components/TabSlideWrapper'

type Task = {
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

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfTomorrow(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 1)
  return d
}

function getDueDateUrgency(dueDate: string | null): { bg: string; text: string } | null {
  if (!dueDate) return null
  const due = new Date(dueDate)
  const today = startOfToday()
  const tomorrow = startOfTomorrow()
  if (due < today)    return { bg: '#FEF2F2', text: '#DC2626' }   // overdue — red
  if (due < tomorrow) return { bg: '#FEF3C7', text: '#92400E' }   // today — amber
  return { bg: '#EEF2FF', text: '#6366F1' }                       // future — indigo muted
}

function SwipeableTaskRow({
  task,
  onToggle,
  onDelete,
  onTitleSave,
  onDueDatePress,
}: {
  task: Task
  onToggle: () => void
  onDelete: () => void
  onTitleSave: (newTitle: string) => void
  onDueDatePress: () => void
}) {
  const translateX = useRef(new Animated.Value(0)).current
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, gs) => Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderMove: (_e, gs) => {
        if (gs.dx < 0) translateX.setValue(Math.max(gs.dx, -100))
      },
      onPanResponderRelease: (_e, gs) => {
        if (gs.dx < -60) {
          Animated.spring(translateX, { toValue: -80, useNativeDriver: true }).start()
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start()
        }
      },
    })
  ).current

  const handleTitleBlur = () => {
    setEditing(false)
    const trimmed = editTitle.trim()
    if (trimmed && trimmed !== task.title) {
      onTitleSave(trimmed)
    } else {
      setEditTitle(task.title)
    }
  }

  const dueDateLabel = formatDate(task.due_date)

  return (
    <View style={rowStyles.wrapper}>
      <View style={rowStyles.deleteZone}>
        <Pressable style={rowStyles.deleteButton} onPress={onDelete}>
          <Ionicons name="trash-outline" size={18} color="#fff" />
        </Pressable>
      </View>

      <Animated.View
        style={[rowStyles.row, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Pressable
          style={[rowStyles.checkbox, task.completed && rowStyles.checkboxDone]}
          onPress={onToggle}
        >
          {task.completed && <Ionicons name="checkmark" size={14} color="#fff" />}
        </Pressable>

        <View style={rowStyles.content}>
          {editing ? (
            <TextInput
              style={rowStyles.titleInput}
              value={editTitle}
              onChangeText={setEditTitle}
              onBlur={handleTitleBlur}
              onSubmitEditing={handleTitleBlur}
              autoFocus
              returnKeyType="done"
              selectTextOnFocus
            />
          ) : (
            <Pressable onPress={() => { if (!task.completed) { setEditing(true); setEditTitle(task.title) } }}>
              <Text style={[rowStyles.title, task.completed && rowStyles.titleDone]} numberOfLines={2}>
                {task.title}
              </Text>
            </Pressable>
          )}
          {task.completed && task.completed_at && (
            <Text style={rowStyles.meta}>Done {formatDate(task.completed_at)}</Text>
          )}
        </View>

        {!task.completed && (() => {
          const urgency = getDueDateUrgency(task.due_date)
          return (
            <Pressable
              style={[rowStyles.dueDateArea, urgency && { backgroundColor: urgency.bg }]}
              onPress={onDueDatePress}
            >
              <Text style={[
                rowStyles.dueDateText,
                urgency ? { color: urgency.text } : { color: tokens.colors.textMuted },
              ]}>
                {dueDateLabel ?? 'No date'}
              </Text>
            </Pressable>
          )
        })()}
      </Animated.View>
    </View>
  )
}

export default function TasksScreen() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showCompleted, setShowCompleted] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const fetchTasks = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    setTasks((data as Task[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!session?.user) return
    const userId = session.user.id
    fetchTasks(userId)

    const channel = supabase
      .channel(`tasks:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` },
        () => fetchTasks(userId)
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [session?.user?.id, fetchTasks])

  const toggleTask = useCallback(async (task: Task) => {
    const newCompleted = !task.completed
    setTasks(prev => prev.map(t =>
      t.id === task.id
        ? { ...t, completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null }
        : t
    ))
    await supabase.from('tasks').update({
      completed: newCompleted,
      completed_at: newCompleted ? new Date().toISOString() : null,
    }).eq('id', task.id)
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

  const updateTitle = useCallback(async (taskId: string, newTitle: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, title: newTitle } : t))
    await supabase.from('tasks').update({ title: newTitle }).eq('id', taskId)
  }, [])

  const toggleDueDate = useCallback(async (task: Task) => {
    if (task.due_date) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, due_date: null } : t))
      await supabase.from('tasks').update({ due_date: null }).eq('id', task.id)
    } else {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(9, 0, 0, 0)
      const iso = tomorrow.toISOString()
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, due_date: iso } : t))
      await supabase.from('tasks').update({ due_date: iso }).eq('id', task.id)
    }
  }, [])

  const activeTasks = tasks.filter(t => !t.completed)
  const completedTasks = tasks.filter(t => t.completed)

  if (!session?.user) {
    return (
      <TabSlideWrapper tabIndex={0}>
        <View style={s.container}>
          <Stack.Screen options={{ headerShown: false }} />
          <View style={s.emptyWrap}>
            <Text style={s.emptyTitle}>Sign in to see your tasks</Text>
          </View>
        </View>
      </TabSlideWrapper>
    )
  }

  return (
    <TabSlideWrapper tabIndex={0}>
    <View style={s.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>Tasks</Text>
          {activeTasks.length > 0 && (
            <View style={s.countPill}>
              <Text style={s.countPillText}>{activeTasks.length} active</Text>
            </View>
          )}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={tokens.colors.primary} style={{ marginTop: 40 }} />
        ) : tasks.length === 0 ? (
          <View style={s.emptyWrap}>
            <Ionicons name="checkmark-circle-outline" size={48} color={tokens.colors.border} />
            <Text style={s.emptyTitle}>No tasks yet</Text>
            <Text style={s.emptySubtitle}>Capture something to get started</Text>
            <Pressable style={s.emptyButton} onPress={() => router.replace('/')}>
              <Ionicons name="flash" size={16} color="#fff" />
              <Text style={s.emptyButtonText}>Go to Capture</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Active tasks */}
            {activeTasks.map(task => (
              <SwipeableTaskRow
                key={task.id}
                task={task}
                onToggle={() => toggleTask(task)}
                onDelete={() => deleteTask(task)}
                onTitleSave={(t) => updateTitle(task.id, t)}
                onDueDatePress={() => toggleDueDate(task)}
              />
            ))}

            {/* Completed section */}
            {completedTasks.length > 0 && (
              <>
                <Pressable
                  style={s.completedHeader}
                  onPress={() => setShowCompleted(p => !p)}
                >
                  <Ionicons
                    name={showCompleted ? 'chevron-down' : 'chevron-forward'}
                    size={16}
                    color={tokens.colors.textMuted}
                  />
                  <Text style={s.completedHeaderText}>
                    Completed ({completedTasks.length})
                  </Text>
                </Pressable>

                {showCompleted && completedTasks.map(task => (
                  <SwipeableTaskRow
                    key={task.id}
                    task={task}
                    onToggle={() => toggleTask(task)}
                    onDelete={() => deleteTask(task)}
                    onTitleSave={(t) => updateTitle(task.id, t)}
                    onDueDatePress={() => toggleDueDate(task)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
    </TabSlideWrapper>
  )
}

const rowStyles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    overflow: 'hidden',
  },
  deleteZone: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.colors.error,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 24,
  },
  deleteButton: {
    padding: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.colors.surface,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    ...tokens.shadow.card,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: tokens.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: {
    backgroundColor: tokens.colors.primary,
    borderColor: tokens.colors.primary,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: tokens.fontSize.base,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.textPrimary,
    lineHeight: 20,
  },
  titleDone: {
    textDecorationLine: 'line-through',
    color: tokens.colors.textMuted,
  },
  titleInput: {
    fontSize: tokens.fontSize.base,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.textPrimary,
    lineHeight: 20,
    padding: 0,
    margin: 0,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.primary,
  },
  meta: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.textMuted,
    marginTop: 2,
  },
  dueDateArea: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: tokens.colors.surfaceMuted,
  },
  dueDateText: {
    fontSize: tokens.fontSize.xs,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.textTertiary,
  },
})

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bgTasks,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: tokens.fontSize.h1,
    fontWeight: tokens.fontWeight.extrabold,
    color: tokens.colors.textPrimary,
  },
  headerCount: {
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.textMuted,
  },
  countPill: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countPillText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#6366F1',
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
    ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
  },
  completedHeaderText: {
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.textMuted,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.bold,
    color: tokens.colors.textTertiary,
  },
  emptySubtitle: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.textMuted,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tokens.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: tokens.radius.lg,
    marginTop: 12,
    ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
  },
  emptyButtonText: {
    color: '#fff',
    fontWeight: tokens.fontWeight.bold,
    fontSize: tokens.fontSize.base,
  },
})
