import * as Clipboard from 'expo-clipboard'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Animated, Easing } from 'react-native'
import { supabase } from './supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PersonaId = 'Executive' | 'Social' | 'Summarize' | 'Academic'
export type AutosaveState = 'idle' | 'dirty' | 'syncing' | 'saved' | 'error'

// ─── Constants ────────────────────────────────────────────────────────────────

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

export const PERSONAS: { id: PersonaId; label: string }[] = [
  { id: 'Executive', label: 'Executive' },
  { id: 'Social', label: 'Social Media' },
  { id: 'Summarize', label: 'Summarize' },
  { id: 'Academic', label: 'Academic' },
]

export const PERSONA_HELP: Record<PersonaId, string> = {
  Executive: 'Formal, bulleted, action-oriented',
  Social: 'Engaging, concise, shareable tone',
  Summarize: 'Short, clear summary with key points',
  Academic: 'Structured, analytical, citation-friendly tone',
}

// ─── Hook options ─────────────────────────────────────────────────────────────

export interface UseNoteEditorOptions {
  /** Supabase session (pass from the screen's own auth state) */
  session: { user?: { id: string } | null } | null
  /** Called after a NEW note row is created (insert). Use to optimistically update lists. */
  onNoteCreated?: (id: string, title: string, updatedAt: string) => void
  /** Called after an EXISTING note row is updated. Use to optimistically update lists. */
  onNoteUpdated?: (id: string, title: string, updatedAt: string) => void
  /** If true, insert/update falls back to the legacy `body` column on error. */
  useLegacyFallback?: boolean
  /** Notebook ID to attach to newly created notes. */
  notebookId?: string | null
}

// ─── Hook return type ─────────────────────────────────────────────────────────

export interface NoteEditorState {
  noteId: string | null
  setNoteId: (id: string | null) => void
  title: string
  setTitle: (t: string) => void
  rawContent: string
  setRawContent: (c: string) => void
  formattedContent: string
  setFormattedContent: (c: string) => void
  selectedStyle: PersonaId | null
  setSelectedStyle: (s: PersonaId | null) => void
  isPreviewingAI: boolean
  setIsPreviewingAI: (v: boolean) => void
  styling: boolean
  aiError: string | null
  setAiError: (e: string | null) => void
  autosaveState: AutosaveState
  setAutosaveState: (s: AutosaveState) => void
  copiedFlash: boolean

  previewMarkdown: string
  wordCount: number
  readingTimeMinutes: number

  skeletonTranslateX: Animated.AnimatedInterpolation<number>
  autosavePulseScale: Animated.AnimatedInterpolation<number>
  autosavePulseOpacity: Animated.AnimatedInterpolation<number>
  skeletonAnim: Animated.Value
  autosavePulseAnim: Animated.Value

  saveNoteDraft: (opts?: { reason?: 'debounce' | 'flush' | 'ai' }) => Promise<boolean>
  flushAutosave: () => Promise<boolean>
  runAiStyling: (persona: PersonaId) => Promise<void>
  copyResult: () => Promise<void>
  clearEditor: () => void
  loadIntoEditor: (note: {
    id: string
    title?: string | null
    raw_content?: string | null
    formatted_content?: string | null
    selected_style?: string | null
    notebook_id?: string | null
  }) => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNoteEditor(opts: UseNoteEditorOptions): NoteEditorState {
  const { session, onNoteCreated, onNoteUpdated, useLegacyFallback = false, notebookId } = opts

  // ── State ──────────────────────────────────────────────────────────────────
  const [noteId, setNoteId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [rawContent, setRawContent] = useState('')
  const [formattedContent, setFormattedContent] = useState('')
  const [selectedStyle, setSelectedStyle] = useState<PersonaId | null>(null)
  const [isPreviewingAI, setIsPreviewingAI] = useState(false)
  const [styling, setStyling] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle')
  const [copiedFlash, setCopiedFlash] = useState(false)

  // ── Refs ───────────────────────────────────────────────────────────────────
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosaveInFlightRef = useRef(false)
  const autosavePendingRef = useRef(false)
  const lastSavedSignatureRef = useRef<string>('')
  const lastRawContentRef = useRef(rawContent)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skeletonAnim = useRef(new Animated.Value(0)).current
  const autosavePulseAnim = useRef(new Animated.Value(0)).current

  // ── Derived ────────────────────────────────────────────────────────────────
  const previewMarkdown = useMemo(
    () => (isPreviewingAI ? formattedContent : rawContent),
    [formattedContent, isPreviewingAI, rawContent],
  )

  const wordCount = useMemo(() => {
    const text = (previewMarkdown ?? '').trim()
    if (!text) return 0
    return text.split(/\s+/).filter(Boolean).length
  }, [previewMarkdown])

  const readingTimeMinutes = useMemo(() => {
    if (!wordCount) return 0
    return Math.max(1, Math.ceil(wordCount / 200))
  }, [wordCount])

  // ── Autosave signature ─────────────────────────────────────────────────────
  const makeSignature = useCallback(
    (t: string, r: string) => `${t.trim()}\n---\n${r}`,
    [],
  )

  // ── Save draft ─────────────────────────────────────────────────────────────
  const saveNoteDraft = useCallback(
    async (saveOpts?: { reason?: 'debounce' | 'flush' | 'ai' }): Promise<boolean> => {
      const userId = session?.user?.id
      if (!userId) {
        setAutosaveState('error')
        return false
      }

      const sig = makeSignature(title, rawContent)
      const hasMeaningfulContent = !!(title.trim() || rawContent.trim())

      if (!noteId && !hasMeaningfulContent) return true
      if (sig === lastSavedSignatureRef.current && saveOpts?.reason !== 'flush') return true
      if (autosaveInFlightRef.current) {
        autosavePendingRef.current = true
        return true
      }

      autosaveInFlightRef.current = true
      setAutosaveState('syncing')
      const nowIso = new Date().toISOString()

      try {
        if (!noteId) {
          if (useLegacyFallback) {
            try {
              const payload = {
                user_id: userId,
                title,
                raw_content: rawContent,
                formatted_content: formattedContent || null,
                selected_style: selectedStyle,
                notebook_id: notebookId ?? null,
                updated_at: nowIso,
              }
              const { data, error } = await supabase.from('notes').insert(payload).select('id').single()
              if (error) throw error
              setNoteId(data.id)
              onNoteCreated?.(data.id, title || '', nowIso)
            } catch {
              const payload = { user_id: userId, title, body: rawContent, updated_at: nowIso }
              const { data, error } = await supabase.from('notes').insert(payload).select('id').single()
              if (error) throw error
              setNoteId(data.id)
              onNoteCreated?.(data.id, title || '', nowIso)
            }
          } else {
            const payload = {
              user_id: userId,
              title,
              raw_content: rawContent,
              formatted_content: formattedContent || null,
              selected_style: selectedStyle,
              notebook_id: notebookId ?? null,
              updated_at: nowIso,
            }
            const { data, error } = await supabase.from('notes').insert(payload).select('id').single()
            if (error) throw error
            setNoteId(data.id)
            onNoteCreated?.(data.id, title || '', nowIso)
          }
        } else {
          if (useLegacyFallback) {
            try {
              const payload = {
                title,
                raw_content: rawContent,
                formatted_content: formattedContent || null,
                selected_style: selectedStyle,
                updated_at: nowIso,
              }
              const { error } = await supabase.from('notes').update(payload).eq('id', noteId).eq('user_id', userId)
              if (error) throw error
              onNoteUpdated?.(noteId, title || '', nowIso)
            } catch {
              const payload = { title, body: rawContent, updated_at: nowIso }
              const { error } = await supabase.from('notes').update(payload).eq('id', noteId).eq('user_id', userId)
              if (error) throw error
              onNoteUpdated?.(noteId, title || '', nowIso)
            }
          } else {
            const payload = {
              title,
              raw_content: rawContent,
              formatted_content: formattedContent || null,
              selected_style: selectedStyle,
              updated_at: nowIso,
            }
            const { error } = await supabase.from('notes').update(payload).eq('id', noteId).eq('user_id', userId)
            if (error) throw error
            onNoteUpdated?.(noteId, title || '', nowIso)
          }
        }

        lastSavedSignatureRef.current = sig
        setAutosaveState('saved')
        return true
      } catch (e: any) {
        setAutosaveState('error')
        return false
      } finally {
        autosaveInFlightRef.current = false
        if (autosavePendingRef.current) {
          autosavePendingRef.current = false
          void saveNoteDraft({ reason: 'debounce' })
        }
      }
    },
    [
      formattedContent,
      makeSignature,
      noteId,
      notebookId,
      onNoteCreated,
      onNoteUpdated,
      rawContent,
      selectedStyle,
      session?.user?.id,
      title,
      useLegacyFallback,
    ],
  )

  // ── Flush (immediate save) ─────────────────────────────────────────────────
  const flushAutosave = useCallback(async () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    return await saveNoteDraft({ reason: 'flush' })
  }, [saveNoteDraft])

  // ── Debounced autosave effect ──────────────────────────────────────────────
  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return

    const sig = makeSignature(title, rawContent)
    if (sig === lastSavedSignatureRef.current) return
    if (!noteId && !(title.trim() || rawContent.trim())) return

    setAutosaveState(prev => (prev === 'dirty' ? prev : 'dirty'))

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      void saveNoteDraft({ reason: 'debounce' })
    }, 2000)

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [makeSignature, noteId, rawContent, saveNoteDraft, session?.user?.id, title])

  // ── Hybrid preview auto-exit ───────────────────────────────────────────────
  useEffect(() => {
    const prevRaw = lastRawContentRef.current
    const didRawChange = rawContent !== prevRaw
    lastRawContentRef.current = rawContent
    if (isPreviewingAI && didRawChange) {
      setIsPreviewingAI(false)
    }
  }, [isPreviewingAI, rawContent])

  // ── AI styling ─────────────────────────────────────────────────────────────
  const runAiStyling = useCallback(
    async (persona: PersonaId) => {
      const userId = session?.user?.id
      if (!userId) {
        setAiError('Login required: please login before using AI styling.')
        return
      }
      if (!rawContent.trim()) {
        setAiError('Nothing to style: type some notes first.')
        return
      }

      setAiError(null)
      setSelectedStyle(persona)
      setStyling(true)

      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession()
        const accessToken = currentSession?.access_token
        if (!accessToken) throw new Error('No access token found. Please login again.')

        const resp = await fetch(`${SUPABASE_URL}/functions/v1/note-style`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title, raw_content: rawContent, persona }),
        })

        const text = await resp.text()
        if (!resp.ok) {
          throw Object.assign(new Error('Edge Function returned a non-2xx status code'), {
            status: resp.status,
            details: text,
          })
        }

        const data = JSON.parse(text)
        const markdown = (data?.formatted_content ?? '') as string
        if (!markdown) throw new Error('Edge function returned empty formatted_content')

        setFormattedContent(markdown)
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
    },
    [rawContent, saveNoteDraft, session?.user?.id, title],
  )

  // ── Skeleton shimmer animation ─────────────────────────────────────────────
  useEffect(() => {
    if (!styling) return
    skeletonAnim.setValue(0)
    const loop = Animated.loop(
      Animated.timing(skeletonAnim, { toValue: 1, duration: 1100, useNativeDriver: true }),
    )
    loop.start()
    return () => loop.stop()
  }, [skeletonAnim, styling])

  const skeletonTranslateX = skeletonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-140, 260],
  })

  // ── Autosave pulse animation ───────────────────────────────────────────────
  useEffect(() => {
    if (autosaveState !== 'saved') {
      autosavePulseAnim.stopAnimation()
      autosavePulseAnim.setValue(0)
      return
    }
    autosavePulseAnim.setValue(0)
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(autosavePulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(autosavePulseAnim, {
          toValue: 0,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [autosavePulseAnim, autosaveState])

  const autosavePulseScale = autosavePulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.5],
  })
  const autosavePulseOpacity = autosavePulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 0.35],
  })

  // ── Copy result ────────────────────────────────────────────────────────────
  const copyResult = useCallback(async () => {
    const textToCopy = previewMarkdown || ''
    if (!textToCopy.trim()) {
      Alert.alert('Nothing to copy', 'Generate some formatted content first.')
      return
    }
    await Clipboard.setStringAsync(textToCopy)
    setCopiedFlash(true)
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopiedFlash(false), 1500)
  }, [previewMarkdown])

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    }
  }, [])

  // ── Clear editor ───────────────────────────────────────────────────────────
  const clearEditor = useCallback(() => {
    setNoteId(null)
    setTitle('')
    setRawContent('')
    setFormattedContent('')
    setSelectedStyle(null)
    setIsPreviewingAI(false)
    setAiError(null)
    setAutosaveState('idle')
    lastSavedSignatureRef.current = ''
    lastRawContentRef.current = ''
  }, [])

  // ── Load existing note into editor ─────────────────────────────────────────
  const loadIntoEditor = useCallback(
    (note: {
      id: string
      title?: string | null
      raw_content?: string | null
      formatted_content?: string | null
      selected_style?: string | null
      notebook_id?: string | null
    }) => {
      setNoteId(note.id)
      setTitle(note.title ?? '')
      setRawContent(note.raw_content ?? '')
      setFormattedContent(note.formatted_content ?? '')
      setSelectedStyle((note.selected_style as PersonaId) ?? null)
      setIsPreviewingAI(false)
      setAiError(null)
      setAutosaveState('idle')
      lastSavedSignatureRef.current = makeSignature(note.title ?? '', note.raw_content ?? '')
      lastRawContentRef.current = note.raw_content ?? ''
    },
    [makeSignature],
  )

  return {
    noteId,
    setNoteId,
    title,
    setTitle,
    rawContent,
    setRawContent,
    formattedContent,
    setFormattedContent,
    selectedStyle,
    setSelectedStyle,
    isPreviewingAI,
    setIsPreviewingAI,
    styling,
    aiError,
    setAiError,
    autosaveState,
    setAutosaveState,
    copiedFlash,

    previewMarkdown,
    wordCount,
    readingTimeMinutes,

    skeletonTranslateX,
    autosavePulseScale,
    autosavePulseOpacity,
    skeletonAnim,
    autosavePulseAnim,

    saveNoteDraft,
    flushAutosave,
    runAiStyling,
    copyResult,
    clearEditor,
    loadIntoEditor,
  }
}
