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
import { supabase } from '../lib/supabase'

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

  // Today's captures
  const [todayCaptures, setTodayCaptures] = useState<Capture[]>([])

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

  // ─── Today's captures fetch ────────────────────────────────────────────────
  const fetchTodayCaptures = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('captures')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', startOfToday().toISOString())
      .order('created_at', { ascending: false })
    setTodayCaptures((data as Capture[]) ?? [])
  }, [])

  // ─── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user) return
    const userId = session.user.id

    fetchStats(userId)
    fetchTodayCaptures(userId)

    // Stats refresh every 60s for relative time accuracy
    const statsInterval = setInterval(() => fetchStats(userId), 60000)

    const channel = supabase
      .channel(`captures:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'captures', filter: `user_id=eq.${userId}` },
        () => {
          fetchStats(userId)
          fetchTodayCaptures(userId)
        }
      )
      .subscribe()

    return () => {
      clearInterval(statsInterval)
      supabase.removeChannel(channel)
    }
  }, [session?.user?.id, fetchStats, fetchTodayCaptures])

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
    const level = Math.max(0, (amplitude + 160) / 160)
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
    extracted: Record<string, unknown>,
    source: 'text' | 'voice',
  ) => {
    const { data: captureRow } = await supabase
      .from('captures')
      .insert({
        user_id: userId,
        raw_text: rawText,
        classification,
        ai_confidence: confidence,
        extracted_data: extracted,
        source,
      })
      .select()
      .single()

    const captureId = captureRow?.id ?? null

    if (classification === 'task') {
      await supabase.from('tasks').insert({
        user_id: userId,
        capture_id: captureId,
        title: (extracted.title as string) ?? rawText,
      })
    } else if (classification === 'shopping') {
      await supabase.from('shopping_items').insert({
        user_id: userId,
        capture_id: captureId,
        item_name: (extracted.item_name as string) ?? rawText,
        quantity: (extracted.quantity as string) ?? null,
      })
    } else if (classification === 'journal') {
      await supabase.from('journal_entries').insert({
        user_id: userId,
        capture_id: captureId,
        content: (extracted.content as string) ?? rawText,
        mood: (extracted.mood as string) ?? null,
      })
    }

    return captureRow as Capture | null
  }, [])

  // ─── Text capture flow ─────────────────────────────────────────────────────
  const submitText = useCallback(async (text: string) => {
    if (!session?.user || !text.trim()) return
    const userId = session.user.id
    const optimisticId = `optimistic-${Date.now()}`

    setInputText('')
    setTodayCaptures(prev => [{
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
      const { classification = 'unclassified', confidence = 0, extracted = {} } = result

      const saved = await saveCapture(userId, text, classification, confidence, extracted, 'text')

      setTodayCaptures(prev => prev.map(c =>
        c.id === optimisticId ? (saved ?? { ...c, classification, id: Date.now().toString() }) : c
      ))
      showSuccess(classification)
    } catch (e) {
      console.error('submitText error', e)
      const saved = await saveCapture(userId, text, 'unclassified', 0, {}, 'text').catch(() => null)
      setTodayCaptures(prev => prev.map(c =>
        c.id === optimisticId ? (saved ?? { ...c, classification: 'unclassified' }) : c
      ))
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

    setTodayCaptures(prev => [{
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
      const blob = await response.blob()
      const { error: uploadErr } = await supabase.storage
        .from('voice-captures')
        .upload(fileName, blob, { contentType: 'audio/m4a', upsert: false })

      if (uploadErr) throw uploadErr
      storagePath = fileName

      // Transcribe
      setProcessingLabel('Transcribing...')
      const transcribeResult = await callEdgeFunction('voice-transcribe', {
        audio_storage_path: storagePath,
      })
      if (transcribeResult.error) throw new Error(transcribeResult.error)
      transcript = transcribeResult.transcript

      // Classify
      setProcessingLabel('Classifying...')
      const classifyResult = await callEdgeFunction('ai-classifier', { raw_text: transcript })
      const { classification = 'unclassified', confidence = 0, extracted = {} } = classifyResult

      const saved = await saveCapture(userId, transcript!, classification, confidence, extracted, 'voice')
      setTodayCaptures(prev => prev.map(c =>
        c.id === optimisticId ? (saved ?? { ...c, classification }) : c
      ))
      showSuccess(classification)
    } catch (e) {
      console.error('voice capture error', e)
      const fallbackText = transcript ?? '[Voice capture — upload failed]'
      const saved = await saveCapture(userId, fallbackText, 'unclassified', 0, {}, 'voice').catch(() => null)
      setTodayCaptures(prev => prev.map(c =>
        c.id === optimisticId ? (saved ?? { ...c, classification: 'unclassified', raw_text: fallbackText }) : c
      ))
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
    )
  }

  return (
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
          {/* ── Stats bar ─────────────────────────────────────────────── */}
          {weekCaptureCount === 0 && !lastCaptureAt ? (
            <View style={styles.statsBar}>
              <Text style={[styles.statsText, { textAlign: 'center', width: '100%' }]}>
                Start your first capture ↓
              </Text>
            </View>
          ) : (
            <View style={[styles.statsBar, { flexDirection: 'row', justifyContent: 'space-between' }]}>
              <Text style={styles.statsText}>{weekCaptureCount} captures this week</Text>
              <Text style={styles.statsText}>
                {lastCaptureAt ? `Last capture: ${relativeTime(lastCaptureAt)}` : 'No captures yet'}
              </Text>
            </View>
          )}

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
            {feedbackState === 'success' && successClassification && (
              <Animated.View style={[styles.shelfSuccessOuter, { opacity: chipOpacity }]}>
                <Animated.View style={[
                  styles.chip,
                  { backgroundColor: CHIP_LABEL[successClassification]?.bg ?? '#6B7280' },
                  { transform: [{ scale: chipScale }] },
                ]}>
                  <Text style={styles.chipText}>
                    {CHIP_LABEL[successClassification]?.text ?? '✓ Captured'}
                  </Text>
                </Animated.View>
              </Animated.View>
            )}
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

          {/* ── Today's captures ──────────────────────────────────────── */}
          <View style={styles.capturesList}>
            {todayCaptures.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={40} color="#E5E7EB" />
                <Text style={styles.emptyTitle}>No captures today</Text>
                <Text style={styles.emptySubtitle}>Your thoughts will appear here</Text>
              </View>
            ) : (
              todayCaptures.map((item) => {
                const badge = BADGE[item.classification] ?? BADGE.unclassified
                const isOptimistic = item.id.startsWith('optimistic-')
                return (
                  <View key={item.id} style={styles.captureItem}>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[
                        styles.badgeText,
                        item.classification === 'processing' && { color: '#6B7280' },
                      ]}>
                        {badge.label}
                      </Text>
                    </View>
                    <Text style={styles.captureText} numberOfLines={2}>
                      {item.raw_text ?? '…'}
                    </Text>
                    <Text style={styles.captureTime}>
                      {isOptimistic ? 'Just now' : relativeTime(item.created_at)}
                    </Text>
                  </View>
                )
              })
            )}
          </View>

          {/* ── Ghost buttons ─────────────────────────────────────────── */}
          <View style={styles.ghostRow}>
            <Pressable style={styles.ghostButton} onPress={() => router.push('/thoughts')}>
              <Text style={styles.ghostButtonText}>Thoughts</Text>
            </Pressable>
            <Pressable style={styles.ghostButton} onPress={() => router.push('/taskManager')}>
              <Text style={styles.ghostButtonText}>Open Task Manager</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
  },
  signInButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },

  // Scroll
  scrollContent: {
    paddingBottom: 40,
  },

  // Stats bar
  statsBar: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statsText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
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
  },
  ghostButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
})
