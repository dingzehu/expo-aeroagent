import { Ionicons } from '@expo/vector-icons'
import { Stack, useRouter } from 'expo-router'
import React, { useRef, useState } from 'react'
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { tokens } from '../constants/tokens'
import { TabSlideWrapper } from '../components/TabSlideWrapper'
import { useAppData, type Task } from '../context/AppDataContext'

function TaskSkeleton() {
  const pulseAnim = useRef(new Animated.Value(0.5)).current
  React.useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])
  return (
    <Animated.View style={{ opacity: pulseAnim, paddingTop: 8 }}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={[sk.row]}>
          <View style={sk.checkbox} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={[sk.box, { height: 14, width: '75%' }]} />
          </View>
          <View style={[sk.box, { width: 52, height: 22, borderRadius: 6 }]} />
        </View>
      ))}
    </Animated.View>
  )
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

// ─── Quick-pick date options ───────────────────────────────────────────────────
function quickDateISO(option: 'today' | 'tomorrow' | 'in3days' | 'nextweek'): string {
  const d = new Date()
  d.setHours(9, 0, 0, 0)
  if (option === 'tomorrow')  d.setDate(d.getDate() + 1)
  if (option === 'in3days')   d.setDate(d.getDate() + 3)
  if (option === 'nextweek')  d.setDate(d.getDate() + 7)
  return d.toISOString()
}

function DueDateSheet({
  task,
  onSelect,
  onClose,
}: {
  task: Task
  onSelect: (iso: string | null) => void
  onClose: () => void
}) {
  const options: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; value: 'today' | 'tomorrow' | 'in3days' | 'nextweek' }[] = [
    { label: 'Today',     icon: 'sunny-outline',    value: 'today' },
    { label: 'Tomorrow',  icon: 'arrow-forward-circle-outline', value: 'tomorrow' },
    { label: 'In 3 days', icon: 'time-outline',     value: 'in3days' },
    { label: 'Next week', icon: 'calendar-outline', value: 'nextweek' },
  ]

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={ds.backdrop} onPress={onClose} />
      <View style={ds.sheet}>
        <View style={ds.handle} />
        <Text style={ds.title}>Set due date</Text>
        <Text style={ds.subtitle} numberOfLines={1}>{task.title}</Text>

        <View style={ds.optionList}>
          {options.map(opt => {
            const isActive = task.due_date && new Date(task.due_date).toDateString() === new Date(quickDateISO(opt.value)).toDateString()
            return (
              <Pressable
                key={opt.value}
                style={[ds.option, isActive && ds.optionActive]}
                onPress={() => { onSelect(quickDateISO(opt.value)); onClose() }}
                {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
              >
                <Ionicons name={opt.icon} size={18} color={isActive ? tokens.colors.primary : tokens.colors.textSecondary} />
                <Text style={[ds.optionText, isActive && ds.optionTextActive]}>{opt.label}</Text>
                {isActive && <Ionicons name="checkmark" size={16} color={tokens.colors.primary} style={{ marginLeft: 'auto' }} />}
              </Pressable>
            )
          })}
        </View>

        {task.due_date && (
          <>
            <View style={ds.divider} />
            <Pressable
              style={ds.clearBtn}
              onPress={() => { onSelect(null); onClose() }}
              {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
            >
              <Ionicons name="close-circle-outline" size={18} color={tokens.colors.error} />
              <Text style={ds.clearText}>Remove due date</Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  )
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
  const {
    isSignedIn,
    tasks,
    tasksLoading: loading,
    toggleTask,
    deleteTask,
    updateTaskTitle,
    setTaskDueDate,
  } = useAppData()
  const [showCompleted, setShowCompleted] = useState(false)
  const [dueDateTaskId, setDueDateTaskId] = useState<string | null>(null)
  const dueDateTask = tasks.find(t => t.id === dueDateTaskId) ?? null

  const activeTasks = tasks.filter(t => !t.completed)
  const completedTasks = tasks.filter(t => t.completed)

  if (!isSignedIn) {
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
          <TaskSkeleton />
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
                onTitleSave={(t) => updateTaskTitle(task.id, t)}
                onDueDatePress={() => setDueDateTaskId(task.id)}
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
                    onTitleSave={(t) => updateTaskTitle(task.id, t)}
                    onDueDatePress={() => setDueDateTaskId(task.id)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      {dueDateTask && (
        <DueDateSheet
          task={dueDateTask}
          onSelect={(iso) => setTaskDueDate(dueDateTask.id, iso)}
          onClose={() => setDueDateTaskId(null)}
        />
      )}
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

// Skeleton styles
const sk = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.colors.surface,
    marginHorizontal: 16,
    marginBottom: 6,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    ...tokens.shadow.card,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: tokens.colors.border,
  },
  box: {
    backgroundColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
  },
})

// DueDateSheet styles
const ds = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: tokens.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.bold,
    color: tokens.colors.textPrimary,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.textMuted,
    marginBottom: 16,
  },
  optionList: {
    gap: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: tokens.colors.surfaceAlt,
  },
  optionActive: {
    backgroundColor: tokens.colors.primaryBg,
  },
  optionText: {
    fontSize: tokens.fontSize.base,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.textPrimary,
    flex: 1,
  },
  optionTextActive: {
    color: tokens.colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: tokens.colors.border,
    marginVertical: 12,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
  },
  clearText: {
    fontSize: tokens.fontSize.base,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.error,
  },
})
