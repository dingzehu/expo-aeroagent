import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { Stack, router } from 'expo-router'
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio'
import type { Session } from '@supabase/supabase-js'
import { useAuthModal } from '../context/AuthModalContext'
import { TabSlideWrapper } from '../components/TabSlideWrapper'
import { supabase } from '../lib/supabase'
import { tokens } from '../constants/tokens'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!


// ─── Types ────────────────────────────────────────────────────────────────────
type Classification = 'task' | 'shopping' | 'journal' | 'unclassified' | 'processing'

type Capture = {
  id: string
  user_id: string
  raw_text: string | null
  raw_audio_url: string | null
  classification: Classification
  ai_confidence: number | null
  extracted_data: Record<string, unknown> | null
  source: 'text' | 'voice'
  created_at: string
}

type GestureState = 'idle' | 'recording' | 'cancel' | 'lock' | 'locked'
type FeedbackState = 'idle' | 'recording' | 'processing' | 'success'
type ProcessingLabel = 'Transcribing...' | 'Classifying...'

// ─── Badge config ─────────────────────────────────────────────────────────────
const BADGE: Record<Classification, { bg: string; label: string }> = {
  task:          { bg: '#6366F1', label: 'TASK' },
  shopping:      { bg: '#D97706', label: 'SHOPPING' },
  journal:       { bg: '#10B981', label: 'JOURNAL' },
  unclassified:  { bg: '#6B7280', label: 'UNCLASSIFIED' },
  processing:    { bg: '#E5E7EB', label: '...' },
}

const CHIP_LABEL: Record<string, { bg: string; text: string }> = {
  task:          { bg: '#6366F1', text: '✓  Saved as Task' },
  shopping:      { bg: '#D97706', text: '✓  Added to Shopping' },
  journal:       { bg: '#10B981', text: '✓  Journal entry saved' },
  unclassified:  { bg: '#6B7280', text: '✓  Captured' },
}

type ExtractedItem = {
  type: 'task' | 'shopping' | 'journal' | 'unclassified'
  title?: string
  due_date_hint?: string
  item_name?: string
  quantity?: string
  content?: string
  mood?: string
}

function buildSuccessChip(items: ExtractedItem[]): { bg: string; text: string } {
  if (items.length <= 1) {
    const type = items[0]?.type ?? 'unclassified'
    return CHIP_LABEL[type] ?? CHIP_LABEL.unclassified
  }
  const counts: Partial<Record<string, number>> = {}
  for (const item of items) {
    counts[item.type] = (counts[item.type] ?? 0) + 1
  }
  const parts = Object.entries(counts).map(([type, n]) => `${n} ${type}`)
  return { bg: '#6366F1', text: `✓  ${parts.join(' + ')}` }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function startOfWeek(): Date {
  const now = new Date()
  const day = now.getDay()
  const diff = (day === 0 ? -6 : 1) - day // Monday = 0
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function getCaptureBadgeTypes(capture: Capture): Classification[] {
  // Processing captures (optimistic, pre-classification): extracted_data is null,
  // classification is 'processing'. Returns ['processing'] → renders grey "..." badge.
  const items = capture.extracted_data?.items as { type: string }[] | null
  if (items && items.length > 0) {
    const seen = new Set<string>()
    const types: Classification[] = []
    for (const item of items) {
      if (item.type && !seen.has(item.type) && item.type !== 'processing') {
        seen.add(item.type)
        types.push(item.type as Classification)
      }
    }
    if (types.length > 0) return types
  }
  return [capture.classification]  // fallback: single badge (processing + older captures)
}

function sevenDaysAgo(): Date {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  d.setHours(0, 0, 0, 0)
  return d
}

function dateLabelFor(iso: string): string {
  const date = new Date(iso)
  const today = startOfToday()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (date >= today) return 'Today'
  if (date >= yesterday) return 'Yesterday'

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const weekStart = startOfWeek()
  if (date >= weekStart) return dayNames[date.getDay()]

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

type CaptureSection = { label: string; data: Capture[] }

function triggerHaptic(type: 'light' | 'medium' | 'success') {
  if (Platform.OS === 'web') return
  try {
    if (type === 'light')   Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (type === 'medium')  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    if (type === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  } catch { /* ignore on unsupported devices */ }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Index() {
  const { openAuthModal } = useAuthModal()

  // Session
  const [session, setSession] = useState<Session | null>(null)

  // Input
  const [inputText, setInputText] = useState('')

  // Voice gesture state machine
  const [gestureState, setGestureState] = useState<GestureState>('idle')
  const audioRecorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true })
  const meteringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingStartTime = useRef<number>(0)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Waveform — 20 animated bars
  const waveformValues = useRef(
    Array.from({ length: 20 }, () => new Animated.Value(4))
  ).current

  // Feedback area
  const [feedbackState, setFeedbackState] = useState<FeedbackState>('idle')
  const [processingLabel, setProcessingLabel] = useState<ProcessingLabel>('Classifying...')
  const [successClassification, setSuccessClassification] = useState<string | null>(null)
  const [successChipOverride, setSuccessChipOverride] = useState<{ bg: string; text: string } | null>(null)
  const feedbackHeight = useRef(new Animated.Value(0)).current
  const chipScale = useRef(new Animated.Value(0.85)).current
  const chipOpacity = useRef(new Animated.Value(1)).current

  // Pulsing ring behind mic button
  const pulseScale = useRef(new Animated.Value(1)).current
  const pulseOpacity = useRef(new Animated.Value(0.6)).current
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null)

  // Stats
  const [weekCaptureCount, setWeekCaptureCount] = useState<number>(0)
  const [lastCaptureAt, setLastCaptureAt] = useState<string | null>(null)

  // Recent captures (7-day rolling window)
  const [recentCaptures, setRecentCaptures] = useState<Capture[]>([])
  const [loadingCaptures, setLoadingCaptures] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [completedCaptureIds, setCompletedCaptureIds] = useState<Set<string>>(new Set())

  // Skeleton shimmer
  const shimmerValue = useRef(new Animated.Value(0)).current

  // Derived
  const isRecording =
    gestureState === 'recording' ||
    gestureState === 'cancel' ||
    gestureState === 'lock' ||
    gestureState === 'locked'
  const isProcessing = feedbackState === 'processing'

  // ─── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      // Deduplicate: INITIAL_SESSION fires with the same token as getSession().
      // Returning `prev` keeps the same reference → React bails out, no re-render.
      setSession(prev =>
        prev?.access_token === s?.access_token && prev?.user?.id === s?.user?.id ? prev : s
      )
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // ─── Stats fetch ───────────────────────────────────────────────────────────
  const fetchStats = useCallback(async (userId: string) => {
    const { count } = await supabase
      .from('captures')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startOfWeek().toISOString())

    const { data: lastRow } = await supabase
      .from('captures')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    setWeekCaptureCount(count ?? 0)
    setLastCaptureAt(lastRow?.created_at ?? null)
  }, [])

  // ─── Recent captures fetch (7-day rolling) ────────────────────────────────
  const PAGE_SIZE = 20

  const fetchCompletionStatus = useCallback(async (captures: Capture[]) => {
    const captureIds = captures
      .filter(c => c.classification !== 'processing' && c.classification !== 'unclassified')
      .map(c => c.id)
      .filter(id => !id.startsWith('optimistic-'))
    if (captureIds.length === 0) return new Set<string>()

    const [{ data: tasks }, { data: shopping }] = await Promise.all([
      supabase.from('tasks').select('capture_id, completed').in('capture_id', captureIds),
      supabase.from('shopping_items').select('capture_id, completed').in('capture_id', captureIds),
    ])

    const allItems = [...(tasks ?? []), ...(shopping ?? [])]
    const grouped: Record<string, boolean[]> = {}
    for (const row of allItems) {
      if (!row.capture_id) continue
      if (!grouped[row.capture_id]) grouped[row.capture_id] = []
      grouped[row.capture_id].push(row.completed)
    }

    const completed = new Set<string>()
    for (const cap of captures) {
      if (cap.classification === 'journal') {
        completed.add(cap.id)
      } else if (grouped[cap.id] && grouped[cap.id].length > 0 && grouped[cap.id].every(Boolean)) {
        completed.add(cap.id)
      }
    }
    return completed
  }, [])

  const fetchRecentCaptures = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('captures')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo().toISOString())
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1)

    const rows = (data as Capture[]) ?? []
    const hasMoreRows = rows.length > PAGE_SIZE
    const page = hasMoreRows ? rows.slice(0, PAGE_SIZE) : rows

    setRecentCaptures(page)
    setHasMore(hasMoreRows)
    setLoadingCaptures(false)

    const completedIds = await fetchCompletionStatus(page)
    setCompletedCaptureIds(completedIds)
  }, [fetchCompletionStatus])

  const loadMoreCaptures = useCallback(async (userId: string) => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)

    const lastItem = recentCaptures[recentCaptures.length - 1]
    if (!lastItem) { setLoadingMore(false); return }

    const { data } = await supabase
      .from('captures')
      .select('*')
      .eq('user_id', userId)
      .lt('created_at', lastItem.created_at)
      .gte('created_at', sevenDaysAgo().toISOString())
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1)

    const rows = (data as Capture[]) ?? []
    const hasMoreRows = rows.length > PAGE_SIZE
    const page = hasMoreRows ? rows.slice(0, PAGE_SIZE) : rows

    const merged = [...recentCaptures, ...page]
    setRecentCaptures(merged)
    setHasMore(hasMoreRows)
    setLoadingMore(false)

    const completedIds = await fetchCompletionStatus(merged)
    setCompletedCaptureIds(completedIds)
  }, [recentCaptures, hasMore, loadingMore, fetchCompletionStatus])

  // ─── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user) return
    const userId = session.user.id

    fetchStats(userId)
    fetchRecentCaptures(userId)

    const statsInterval = setInterval(() => fetchStats(userId), 60000)

    const channel = supabase
      .channel(`captures:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'captures', filter: `user_id=eq.${userId}` },
        () => {
          fetchStats(userId)
          fetchRecentCaptures(userId)
        }
      )
      .subscribe()

    return () => {
      clearInterval(statsInterval)
      supabase.removeChannel(channel)
    }
  }, [session?.user?.id, fetchStats, fetchRecentCaptures])

  // ─── Skeleton shimmer animation ────────────────────────────────────────────
  useEffect(() => {
    if (!loadingCaptures) return
    const anim = Animated.loop(
      Animated.timing(shimmerValue, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    )
    anim.start()
    return () => anim.stop()
  }, [loadingCaptures, shimmerValue])

  // ─── Feedback shelf animation ──────────────────────────────────────────────
  const openShelf = useCallback((targetHeight: number) => {
    Animated.spring(feedbackHeight, {
      toValue: targetHeight,
      friction: 8,
      tension: 60,
      useNativeDriver: false,
    }).start()
  }, [feedbackHeight])

  const closeShelf = useCallback(() => {
    Animated.spring(feedbackHeight, {
      toValue: 0,
      friction: 8,
      tension: 60,
      useNativeDriver: false,
    }).start()
  }, [feedbackHeight])

  // ─── Pulse animation ───────────────────────────────────────────────────────
  const startPulse = useCallback(() => {
    pulseScale.setValue(1)
    pulseOpacity.setValue(0.6)
    const anim = Animated.loop(
      Animated.parallel([
        Animated.timing(pulseScale, { toValue: 1.15, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    )
    pulseAnimRef.current = anim
    anim.start()
  }, [pulseScale, pulseOpacity])

  const stopPulse = useCallback(() => {
    pulseAnimRef.current?.stop()
    pulseScale.setValue(1)
    pulseOpacity.setValue(0)
  }, [pulseScale, pulseOpacity])

  // ─── Waveform update helper ────────────────────────────────────────────────
  const updateWaveform = useCallback((amplitude: number) => {
    // dBFS: ambient silence ≈ −50, speech ≈ −20, loud ≈ 0.
    // Map −50..0 → 0..1 so the mic sits flat when idle.
    const level = Math.max(0, Math.min(1, (amplitude + 50) / 50))
    const barHeight = 4 + level * 44 // 4–48px
    const current = waveformValues.map((v) => (v as any)._value as number)
    current.shift()
    current.push(barHeight)
    current.forEach((h, i) => {
      Animated.timing(waveformValues[i], {
        toValue: h,
        duration: 60,
        useNativeDriver: false,
      }).start()
    })
  }, [waveformValues])

  // ─── Recording timer ───────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    recordingStartTime.current = Date.now()
    setRecordingSeconds(0)
    timerRef.current = setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - recordingStartTime.current) / 1000))
    }, 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    setRecordingSeconds(0)
  }, [])

  const formatTimer = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  // ─── Callback refs for PanResponder (prevents stale closures) ────────────
  const startRecordingRef = useRef<() => Promise<void>>(async () => {})
  const cancelRecordingRef = useRef<() => Promise<void>>(async () => {})
  const stopAndSubmitRef = useRef<() => Promise<void>>(async () => {})

  // ─── Recording start / stop / cancel ──────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync()
      if (!granted) return
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await audioRecorder.prepareToRecordAsync()
      audioRecorder.record()
      // Poll metering manually — avoids useAudioRecorderState re-rendering the whole screen
      meteringIntervalRef.current = setInterval(() => {
        const status = audioRecorder.getStatus()
        updateWaveform(status.metering ?? -160)
      }, 60)
      setFeedbackState('recording')
      openShelf(72)
      startPulse()
      startTimer()
    } catch (e) {
      console.error('startRecording error', e)
    }
  }, [audioRecorder, updateWaveform, openShelf, startPulse, startTimer])

  const cancelRecording = useCallback(async () => {
    if (meteringIntervalRef.current) { clearInterval(meteringIntervalRef.current); meteringIntervalRef.current = null }
    try {
      if (audioRecorder.isRecording) await audioRecorder.stop()
    } catch {}
    stopPulse()
    stopTimer()
    setGestureState('idle')
    setFeedbackState('idle')
    closeShelf()
  }, [audioRecorder, stopPulse, stopTimer, closeShelf])

  // ─── Show success chip ─────────────────────────────────────────────────────
  const showSuccess = useCallback((classification: string) => {
    setSuccessClassification(classification)
    setFeedbackState('success')
    openShelf(56)
    chipOpacity.setValue(1)
    chipScale.setValue(0.85)
    Animated.spring(chipScale, {
      toValue: 1,
      friction: 8,
      tension: 60,
      useNativeDriver: true,
    }).start()
    triggerHaptic('success')

    setTimeout(() => {
      Animated.timing(chipOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setFeedbackState('idle')
        setSuccessClassification(null)
        setSuccessChipOverride(null)
        closeShelf()
      })
    }, 2500)
  }, [openShelf, closeShelf, chipScale, chipOpacity])

  // ─── Call Edge Function helper ─────────────────────────────────────────────
  const callEdgeFunction = useCallback(async (name: string, payload: object) => {
    const { data: { session: freshSession } } = await supabase.auth.getSession()
    const token = freshSession?.access_token
    if (!token) throw new Error('Not authenticated')
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) {
      const body = await resp.text()
      console.error(`[callEdgeFunction] ${name} HTTP ${resp.status}:`, body)
      throw new Error(`Edge Function returned a non-2xx status code | body:${body}`)
    }
    return resp.json()
  }, [])

  // ─── Save capture to DB ────────────────────────────────────────────────────
  const saveCapture = useCallback(async (
    userId: string,
    rawText: string,
    classification: string,
    confidence: number,
    items: ExtractedItem[],
    source: 'text' | 'voice',
  ) => {
    const { data: captureRow } = await supabase
      .from('captures')
      .insert({
        user_id: userId,
        raw_text: rawText,
        classification,
        ai_confidence: confidence,
        extracted_data: { items },
        source,
      })
      .select()
      .single()

    const captureId = captureRow?.id ?? null

    const insertPromises = items.map((item) => {
      if (item.type === 'task') {
        return supabase.from('tasks').insert({
          user_id: userId,
          capture_id: captureId,
          title: item.title ?? rawText,
          due_date: item.due_date_hint ?? null,
        })
      } else if (item.type === 'shopping') {
        return supabase.from('shopping_items').insert({
          user_id: userId,
          capture_id: captureId,
          item_name: item.item_name ?? rawText,
          quantity: item.quantity ?? null,
        })
      } else if (item.type === 'journal') {
        return supabase.from('journal_entries').insert({
          user_id: userId,
          capture_id: captureId,
          content: item.content ?? rawText,
          mood: item.mood ?? null,
        })
      }
      return Promise.resolve()
    })

    await Promise.all(insertPromises)

    return captureRow as Capture | null
  }, [])

  // ─── Text capture flow ─────────────────────────────────────────────────────
  const submitText = useCallback(async (text: string) => {
    if (!session?.user || !text.trim()) return
    const userId = session.user.id
    const optimisticId = `optimistic-${Date.now()}`

    setInputText('')
    setRecentCaptures(prev => [{
      id: optimisticId,
      user_id: userId,
      raw_text: text,
      raw_audio_url: null,
      classification: 'processing',
      ai_confidence: null,
      extracted_data: null,
      source: 'text',
      created_at: new Date().toISOString(),
    }, ...prev])

    setProcessingLabel('Classifying...')
    setFeedbackState('processing')
    openShelf(72)

    try {
      const result = await callEdgeFunction('ai-classifier', { raw_text: text })
      const { classification = 'unclassified', confidence = 0 } = result
      const items: ExtractedItem[] = Array.isArray(result.items) && result.items.length > 0
        ? result.items
        : [{ type: classification }]

      const saved = await saveCapture(userId, text, classification, confidence, items, 'text')

      setRecentCaptures(prev => prev.map(c =>
        c.id === optimisticId ? (saved ?? { ...c, classification, id: Date.now().toString() }) : c
      ))
      const chip = buildSuccessChip(items)
      setSuccessChipOverride(chip)
      showSuccess(classification)
    } catch (e) {
      console.error('submitText error', e)
      const fallbackItems: ExtractedItem[] = [{ type: 'unclassified' }]
      const saved = await saveCapture(userId, text, 'unclassified', 0, fallbackItems, 'text').catch(() => null)
      setRecentCaptures(prev => prev.map(c =>
        c.id === optimisticId ? (saved ?? { ...c, classification: 'unclassified' }) : c
      ))
      setSuccessChipOverride(null)
      showSuccess('unclassified')
    }
  }, [session, callEdgeFunction, saveCapture, showSuccess, openShelf])

  // ─── Voice capture flow ────────────────────────────────────────────────────
  const stopAndSubmitRecording = useCallback(async () => {
    if (!session?.user) return
    const userId = session.user.id
    const optimisticId = `optimistic-${Date.now()}`

    if (meteringIntervalRef.current) { clearInterval(meteringIntervalRef.current); meteringIntervalRef.current = null }
    stopPulse()
    stopTimer()
    setGestureState('idle')

    try {
      if (audioRecorder.isRecording) await audioRecorder.stop()
    } catch {}
    const uri = audioRecorder.uri

    setRecentCaptures(prev => [{
      id: optimisticId,
      user_id: userId,
      raw_text: null,
      raw_audio_url: null,
      classification: 'processing',
      ai_confidence: null,
      extracted_data: null,
      source: 'voice',
      created_at: new Date().toISOString(),
    }, ...prev])

    setProcessingLabel('Transcribing...')
    setFeedbackState('processing')
    openShelf(72)

    let transcript: string | null = null
    let storagePath: string | null = null

    try {
      if (!uri) throw new Error('No audio URI')

      // Upload audio to Supabase Storage
      const fileName = `${userId}/${Date.now()}.m4a`
      const response = await fetch(uri)
      const arrayBuffer = await response.arrayBuffer()
      const { error: uploadErr } = await supabase.storage
        .from('voice-captures')
        .upload(fileName, arrayBuffer, { contentType: 'audio/m4a', upsert: false })

      if (uploadErr) throw uploadErr
      storagePath = fileName

      // Transcribe
      setProcessingLabel('Transcribing...')
      const transcribeResult = await callEdgeFunction('voice-transcribe-deepgram', {
        audio_storage_path: storagePath,
      })
      if (transcribeResult.error) throw new Error(`${transcribeResult.error}${transcribeResult.detail ? ` | ${transcribeResult.detail}` : ''}`)
      transcript = transcribeResult.transcript

      // Classify
      setProcessingLabel('Classifying...')
      const classifyResult = await callEdgeFunction('ai-classifier', { raw_text: transcript })
      const { classification = 'unclassified', confidence = 0 } = classifyResult
      const items: ExtractedItem[] = Array.isArray(classifyResult.items) && classifyResult.items.length > 0
        ? classifyResult.items
        : [{ type: classification }]

      const saved = await saveCapture(userId, transcript!, classification, confidence, items, 'voice')
      setRecentCaptures(prev => prev.map(c =>
        c.id === optimisticId ? (saved ?? { ...c, classification }) : c
      ))
      const chip = buildSuccessChip(items)
      setSuccessChipOverride(chip)
      showSuccess(classification)
    } catch (e) {
      console.error('voice capture error', e)
      const fallbackText = transcript ?? '[Voice capture — upload failed]'
      const fallbackItems: ExtractedItem[] = [{ type: 'unclassified' }]
      const saved = await saveCapture(userId, fallbackText, 'unclassified', 0, fallbackItems, 'voice').catch(() => null)
      setRecentCaptures(prev => prev.map(c =>
        c.id === optimisticId ? (saved ?? { ...c, classification: 'unclassified', raw_text: fallbackText }) : c
      ))
      setSuccessChipOverride(null)
      showSuccess('unclassified')
    }
  }, [session, audioRecorder, stopPulse, stopTimer, callEdgeFunction, saveCapture, showSuccess, openShelf])

  // ─── PanResponder ──────────────────────────────────────────────────────────
  // Sync callback refs on every render so PanResponder always calls the latest version
  const gestureStateRef = useRef<GestureState>('idle')
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => gestureStateRef.current !== 'idle',

      onPanResponderGrant: () => {
        gestureStateRef.current = 'recording'
        setGestureState('recording')
        triggerHaptic('light')
        startRecordingRef.current()
      },

      onPanResponderMove: (_evt, gs) => {
        const current = gestureStateRef.current
        if (current === 'locked') return
        const { dx, dy } = gs
        if (dx < -60) {
          if (current !== 'cancel') {
            gestureStateRef.current = 'cancel'
            setGestureState('cancel')
            triggerHaptic('medium')
          }
        } else if (dy < -60) {
          if (current !== 'lock') {
            gestureStateRef.current = 'lock'
            setGestureState('lock')
            triggerHaptic('medium')
          }
        } else {
          if (current === 'cancel' || current === 'lock') {
            gestureStateRef.current = 'recording'
            setGestureState('recording')
          }
        }
      },

      onPanResponderRelease: () => {
        const current = gestureStateRef.current
        if (current === 'cancel') {
          cancelRecordingRef.current()
          gestureStateRef.current = 'idle'
          triggerHaptic('medium')
        } else if (current === 'lock') {
          gestureStateRef.current = 'locked'
          setGestureState('locked')
          triggerHaptic('light')
        } else {
          gestureStateRef.current = 'idle'
          stopAndSubmitRef.current()
        }
      },
    })
  ).current

  // Sync callback refs every render so PanResponder always has latest closures
  startRecordingRef.current = startRecording
  cancelRecordingRef.current = cancelRecording
  stopAndSubmitRef.current = stopAndSubmitRecording

  // ─── Mic button colours / icon by state ───────────────────────────────────
  const micAppearance = (() => {
    switch (gestureState) {
      case 'recording': return { bg: '#FEF2F2', icon: 'mic' as const,           iconColor: '#DC2626' }
      case 'cancel':    return { bg: '#FEF2F2', icon: 'trash-outline' as const, iconColor: '#DC2626' }
      case 'lock':      return { bg: '#EEF2FF', icon: 'lock-closed' as const,   iconColor: '#6366F1' }
      case 'locked':    return { bg: '#6366F1', icon: 'stop' as const,          iconColor: '#fff' }
      default:          return { bg: '#F3F4F6', icon: 'mic' as const,           iconColor: '#374151' }
    }
  })()

  // ─── Render ────────────────────────────────────────────────────────────────
  if (!session?.user) {
    return (
      <TabSlideWrapper tabIndex={2}>
        <View style={styles.container}>
          <Stack.Screen options={{ headerShown: false }} />
          <View style={styles.lockScreen}>
            <Ionicons name="lock-closed-outline" size={48} color="#E5E7EB" />
            <Text style={styles.lockTitle}>Sign in to start capturing</Text>
            <Text style={styles.lockSubtitle}>Your thoughts, organised by AI</Text>
            <Pressable style={styles.signInButton} onPress={openAuthModal}>
              <Text style={styles.signInButtonText}>Sign In</Text>
            </Pressable>
          </View>
        </View>
      </TabSlideWrapper>
    )
  }

  return (
    <TabSlideWrapper tabIndex={2}>
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Screen header with inline stats ─────────────────────── */}
          <View style={styles.screenHeader}>
            <Text style={styles.screenTitle}>Capture</Text>
            {(weekCaptureCount > 0 || lastCaptureAt) && (
              <Text style={styles.screenStats}>
                {weekCaptureCount > 0 ? `${weekCaptureCount} this week` : ''}
                {weekCaptureCount > 0 && lastCaptureAt ? ' · ' : ''}
                {lastCaptureAt ? relativeTime(lastCaptureAt) : ''}
              </Text>
            )}
          </View>

          {/* ── Text input ────────────────────────────────────────────── */}
          <View style={[styles.inputWrapper, styles.inputWrapperFocused]}>
            <TextInput
              placeholder="What's on your mind?"
              placeholderTextColor="#6B7280"
              value={inputText}
              onChangeText={setInputText}
              multiline
              autoFocus={false}
              autoCapitalize="sentences"
              returnKeyType="default"
              editable={!isRecording && !isProcessing}
              style={[
                styles.textInput,
                isRecording && { opacity: 0.4 },
              ]}
            />
          </View>

          {/* ── Dynamic Shelf ─────────────────────────────────────────── */}
          <Animated.View style={[styles.shelf, { height: feedbackHeight, overflow: 'hidden' }]}>
            {/* STATE B — RECORDING */}
            {feedbackState === 'recording' && (
              <View style={[styles.shelfInner, styles.shelfRecording]}>
                {/* Waveform */}
                <View style={styles.waveform}>
                  {waveformValues.map((val, i) => (
                    <Animated.View
                      key={i}
                      style={[styles.waveBar, { height: val }]}
                    />
                  ))}
                </View>
                {/* Timer */}
                <Text style={styles.timerText}>{formatTimer(recordingSeconds)}</Text>
                {/* Hint */}
                <Text style={styles.hintText}>← cancel  |  ↑ lock</Text>
              </View>
            )}

            {/* STATE C — PROCESSING */}
            {feedbackState === 'processing' && (
              <View style={[styles.shelfInner, styles.shelfProcessing]}>
                <ActivityIndicator size="small" color="#6366F1" />
                <Text style={styles.processingText}>{processingLabel}</Text>
              </View>
            )}

            {/* STATE D — SUCCESS */}
            {feedbackState === 'success' && successClassification && (() => {
              const chipInfo = successChipOverride ?? CHIP_LABEL[successClassification] ?? CHIP_LABEL.unclassified
              return (
                <Animated.View style={[styles.shelfSuccessOuter, { opacity: chipOpacity }]}>
                  <Animated.View style={[
                    styles.chip,
                    { backgroundColor: chipInfo.bg },
                    { transform: [{ scale: chipScale }] },
                  ]}>
                    <Text style={styles.chipText}>{chipInfo.text}</Text>
                  </Animated.View>
                </Animated.View>
              )
            })()}
          </Animated.View>

          {/* ── Action row ────────────────────────────────────────────── */}
          <View style={styles.actionRow}>
            {/* Mic button with pulsing ring */}
            <View style={styles.micWrapper}>
              {isRecording && gestureState !== 'locked' && (
                <Animated.View style={[
                  styles.pulseRing,
                  {
                    transform: [{ scale: pulseScale }],
                    opacity: pulseOpacity,
                  },
                ]} />
              )}
              <View
                style={[styles.micButton, { backgroundColor: micAppearance.bg }]}
                {...panResponder.panHandlers}
              >
                {gestureState === 'locked' ? (
                  <Pressable style={styles.micButtonInner} onPress={() => stopAndSubmitRef.current()}>
                    <Ionicons name={micAppearance.icon} size={22} color={micAppearance.iconColor} />
                  </Pressable>
                ) : isProcessing ? (
                  <View style={styles.micButtonInner}>
                    <ActivityIndicator size="small" color="#6366F1" />
                  </View>
                ) : (
                  <View style={styles.micButtonInner}>
                    <Ionicons name={micAppearance.icon} size={22} color={micAppearance.iconColor} />
                  </View>
                )}
              </View>
            </View>

            {/* Send button */}
            <Pressable
              style={[
                styles.sendButton,
                (!inputText.trim() && gestureState !== 'locked') && styles.sendButtonDisabled,
              ]}
              onPress={() => submitText(inputText)}
              disabled={(!inputText.trim() && gestureState !== 'locked') || isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="arrow-up" size={22} color="#fff" />
              )}
            </Pressable>
          </View>

          {/* ── Captures history (7-day rolling) ────────────────────── */}
          <View style={styles.capturesList}>
            {loadingCaptures ? (
              [0, 1, 2].map((i) => {
                const shimmerTranslate = shimmerValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-120, 300],
                })
                return (
                  <View key={i} style={[styles.captureItem, { overflow: 'hidden' }]}>
                    <View style={styles.skeletonBadge} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={styles.skeletonTextWide} />
                      <View style={styles.skeletonTextNarrow} />
                    </View>
                    <View style={styles.skeletonTime} />
                    <Animated.View
                      style={[styles.skeletonShimmer, { transform: [{ translateX: shimmerTranslate }] }]}
                    />
                  </View>
                )
              })
            ) : recentCaptures.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={40} color="#E5E7EB" />
                <Text style={styles.emptyTitle}>No captures yet</Text>
                <Text style={styles.emptySubtitle}>Your thoughts will appear here</Text>
              </View>
            ) : (() => {
              const sections: CaptureSection[] = []
              for (const cap of recentCaptures) {
                const label = dateLabelFor(cap.created_at)
                const last = sections[sections.length - 1]
                if (last && last.label === label) {
                  last.data.push(cap)
                } else {
                  sections.push({ label, data: [cap] })
                }
              }
              return sections.map((section) => (
                <View key={section.label}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionHeaderText}>{section.label}</Text>
                    <Text style={styles.sectionHeaderCount}>{section.data.length}</Text>
                  </View>
                  {section.data.map((item) => {
                    const badgeTypes = getCaptureBadgeTypes(item)
                    const isOptimistic = item.id.startsWith('optimistic-')
                    const isCompleted = completedCaptureIds.has(item.id)
                    return (
                      <View
                        key={item.id}
                        style={[styles.captureItem, isCompleted && { opacity: 0.6 }]}
                      >
                        <View style={styles.badgeColumn}>
                          {badgeTypes.map(type => {
                            const badge = BADGE[type] ?? BADGE.unclassified
                            return (
                              <View key={type} style={[styles.badge, { backgroundColor: badge.bg }]}>
                                <Text style={[
                                  styles.badgeText,
                                  type === 'processing' && { color: '#6B7280' },
                                ]}>
                                  {badge.label}
                                </Text>
                              </View>
                            )
                          })}
                        </View>
                        <Text style={styles.captureText} numberOfLines={2}>
                          {item.raw_text ?? '…'}
                        </Text>
                        <Text style={styles.captureTime}>
                          {isOptimistic ? 'Just now' : relativeTime(item.created_at)}
                        </Text>
                      </View>
                    )
                  })}
                </View>
              ))
            })()}

            {/* Load more */}
            {hasMore && !loadingCaptures && (
              <Pressable
                style={styles.loadMoreButton}
                onPress={() => session?.user && loadMoreCaptures(session.user.id)}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <ActivityIndicator size="small" color={tokens.colors.primary} />
                ) : (
                  <Text style={styles.loadMoreText}>Load more</Text>
                )}
              </Pressable>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
    </TabSlideWrapper>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bgTasks,
  },

  // Lock screen
  lockScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  lockTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6B7280',
    marginTop: 16,
    textAlign: 'center',
  },
  lockSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
  },
  signInButton: {
    marginTop: 24,
    backgroundColor: '#6366F1',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 12,
    ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
  },
  signInButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },

  // Scroll
  scrollContent: {
    paddingBottom: 80,
  },

  // Screen header
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: tokens.colors.textPrimary,
  },
  screenStats: {
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.textMuted,
  },

  // Text input
  inputWrapper: {
    marginHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
    padding: 12,
  },
  inputWrapperFocused: {
    backgroundColor: '#fff',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.06)' } as any,
    }),
  },
  textInput: {
    fontSize: 16,
    lineHeight: 24,
    color: '#111827',
    minHeight: 120,
    maxHeight: 220,
    textAlignVertical: 'top',
  },

  // Dynamic shelf
  shelf: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  shelfInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderLeftWidth: 3,
    borderRadius: 12,
  },
  shelfRecording: {
    backgroundColor: 'rgba(220,38,38,0.06)',
    borderLeftColor: '#DC2626',
  },
  shelfProcessing: {
    backgroundColor: 'rgba(99,102,241,0.06)',
    borderLeftColor: '#6366F1',
    gap: 10,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 48,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(220,38,38,0.8)',
  },
  timerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginLeft: 10,
    minWidth: 40,
  },
  hintText: {
    fontSize: 11,
    color: '#6B7280',
    fontStyle: 'italic',
    marginLeft: 'auto',
  },
  processingText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  shelfSuccessOuter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  chipText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  // Action row
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginTop: 10,
    gap: 12,
  },
  micWrapper: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    backgroundColor: '#DC2626',
  },
  micButton: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  micButtonInner: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  sendButton: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },

  // Captures list
  capturesList: {
    marginTop: 20,
    paddingHorizontal: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  captureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.04)' } as any,
    }),
  },
  badgeColumn: {
    flexDirection: 'column',
    gap: 3,
    alignSelf: 'flex-start',
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  captureText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  captureTime: {
    fontSize: 12,
    color: '#9CA3AF',
    alignSelf: 'flex-start',
    minWidth: 48,
    textAlign: 'right',
  },

  // Ghost buttons
  ghostRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginTop: 24,
    gap: 10,
  },
  ghostButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: 'transparent',
    ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
  },
  ghostButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },

  // Load more button
  loadMoreButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
  },
  loadMoreText: {
    fontSize: tokens.fontSize.base,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.primary,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 6,
  },
  sectionHeaderText: {
    fontSize: tokens.fontSize.base,
    fontWeight: tokens.fontWeight.extrabold,
    color: tokens.colors.textPrimary,
  },
  sectionHeaderCount: {
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.textMuted,
  },

  // Skeleton loader
  skeletonBadge: {
    width: 60,
    height: 20,
    borderRadius: 6,
    backgroundColor: tokens.colors.border,
  },
  skeletonTextWide: {
    height: 12,
    borderRadius: 8,
    backgroundColor: tokens.colors.border,
    width: '70%',
  },
  skeletonTextNarrow: {
    height: 12,
    borderRadius: 8,
    backgroundColor: tokens.colors.border,
    width: '40%',
  },
  skeletonTime: {
    width: 40,
    height: 12,
    borderRadius: 8,
    backgroundColor: tokens.colors.border,
    alignSelf: 'flex-start',
  },
  skeletonShimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 120,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
})
