import { Ionicons, MaterialIcons } from '@expo/vector-icons'
import type { Session } from '@supabase/supabase-js'
import { BlurView } from 'expo-blur'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { Stack, useRouter } from 'expo-router'
// NOTE:
// Importing from `lucide-react-native` root can force Metro to resolve *thousands* of icons.
// On some setups this can fail with missing-module errors (e.g. `chevron-last.js`).
// Import the single icon we need directly to keep bundling stable and fast.
// @ts-expect-error - lucide doesn't publish per-icon TS path types; runtime file exists.
import Sparkles from 'lucide-react-native/dist/esm/icons/sparkles.js'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import type { AuthMode } from '../components/Auth'
import Auth from '../components/Auth'
import { MarkdownView } from '../components/MarkdownView'
import { supabase } from '../lib/supabase'

/**
 * NOTE-STYLER AI — Studio Screen
 *
 * This file intentionally stays beginner-friendly:
 * - We keep state names close to the Supabase columns (raw_content, formatted_content, selected_style).
 * - We keep the UI layout simple and predictable.
 * - We add comments explaining “what” and “why” around each block.
 *
 * Studio Layout (matching your spec):
 * - TopHalf (Workbench): raw text input (plus title) and a saved-notes list on the right.
 * - Middle (Magic Bar): persona pills (Executive / Social / Summarize / Academic).
 * - BottomHalf (Canvas): grey background + floating white card with Markdown preview + Copy Result button.
 */

type PersonaId = 'Executive' | 'Social' | 'Summarize' | 'Academic'

type NotebookListItem = {
  id: string
  title: string | null
  updated_at: string | null
}

type AutosaveState = 'idle' | 'dirty' | 'syncing' | 'saved' | 'error'

/**
 * Personas (the “Magic Bar”).
 *
 * Important:
 * - For now, these are ONLY UI labels.
 * - The actual system prompts will live in the Supabase Edge Function (server-side).
 */
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

/**
 * Persona pill (Magic Bar) — “Pro Studio” treatment.
 *
 * Glassmorphism approach:
 * - We use `overflow: 'hidden'` so the Blur/Gradient background is clipped to the pill shape.
 * - On web, Blur may be limited depending on the browser; we fall back to a translucent background.
 */
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
      style={[styles.pillBase, active && styles.pillActiveGlass, disabled && styles.disabled]}
    >
      {/* Background layer */}
      {active ? (
        <LinearGradient colors={['#818CF8', '#6366F1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      ) : Platform.OS === 'web' ? (
        <View style={[StyleSheet.absoluteFill, styles.pillGlassFallback]} />
      ) : (
        <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} />
      )}

      {/* Foreground */}
      <View style={styles.pillInner}>
        <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

/**
 * Supabase Functions URL:
 * - Functions are served at: <SUPABASE_URL>/functions/v1/<function-name>
 *
 * We use direct `fetch()` (instead of `supabase.functions.invoke`) because:
 * - It lets us read the raw response body on errors (super helpful for debugging 502/401).
 * - Some Supabase-js error objects hide the response body as `{}`.
 */
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

export default function NotebookScreen() {
  const router = useRouter()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const isNarrow = windowWidth < 768

  const skeletonAnim = useRef(new Animated.Value(0)).current
  const autosavePulseAnim = useRef(new Animated.Value(0)).current

  // ----------------------------
  // Auth session (who is logged in?)
  // ----------------------------
  const [session, setSession] = useState<Session | null>(null)

  // Drawer/auth modal state (same UX as main page)
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [savedDrawerVisible, setSavedDrawerVisible] = useState(false)
  const [authVisible, setAuthVisible] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('signIn')

  const drawerAnim = useRef(new Animated.Value(0)).current
  const drawerWidth = 340

  const savedDrawerAnim = useRef(new Animated.Value(0)).current
  const savedDrawerWidth = Math.min(360, Math.round(windowWidth * 0.92))
  // Web/Desktop sidebar animation:
  // - 1 = expanded, 0 = collapsed
  // - We animate WIDTH (layout) so the editor can grow/shrink smoothly.
  const sidebarAnim = useRef(new Animated.Value(1)).current
  const sidebarTargetWidth = Math.min(360, Math.max(280, Math.round(windowWidth * 0.32)))

  const openDrawer = useCallback(() => {
    setDrawerVisible(true)
    Animated.timing(drawerAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start()
  }, [drawerAnim])

  const closeDrawer = useCallback(() => {
    Animated.timing(drawerAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setDrawerVisible(false)
    })
  }, [drawerAnim])

  const openSavedDrawer = useCallback(() => {
    // Avoid stacking drawers.
    if (drawerVisible) closeDrawer()

    /**
     * Mobile animation fix:
     * The main reason “open” can feel janky is that we were forcing `setValue(0)` before opening.
     * If the user taps quickly (close->open), that causes a visible jump.
     *
     * Instead:
     * - stop the current animation and keep the CURRENT progress value
     * - animate from that value to the new target
     */
    savedDrawerAnim.stopAnimation(() => {
      setSavedDrawerVisible(true)
      Animated.timing(savedDrawerAnim, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start()
    })
  }, [closeDrawer, drawerVisible, savedDrawerAnim])

  const closeSavedDrawer = useCallback(() => {
    // Same “interruptible” logic for smooth close.
    savedDrawerAnim.stopAnimation(() => {
      Animated.timing(savedDrawerAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setSavedDrawerVisible(false)
      })
    })
  }, [savedDrawerAnim])

  useEffect(() => {
    // Load session once on mount.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    // Subscribe to auth changes (login/logout).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // ----------------------------
  // Notebook editor state (these map to Supabase columns)
  // ----------------------------
  const [noteId, setNoteId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [rawContent, setRawContent] = useState('') // raw_content
  const [formattedContent, setFormattedContent] = useState('') // formatted_content
  const [selectedStyle, setSelectedStyle] = useState<PersonaId | null>(null) // selected_style

  /**
   * Hybrid Preview:
   * - Draft mode: live Markdown preview of `rawContent`
   * - AI mode: show `formattedContent` returned by the Edge Function
   */
  const [isPreviewingAI, setIsPreviewingAI] = useState(false)

  // Loading states (for UX)
  const [loadingList, setLoadingList] = useState(false)
  const [notebookList, setNotebookList] = useState<NotebookListItem[]>([])
  const [savedSearch, setSavedSearch] = useState('')
  const [styling, setStyling] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [noteActionsVisible, setNoteActionsVisible] = useState(false)
  const [noteActionsTarget, setNoteActionsTarget] = useState<NotebookListItem | null>(null)
  const [noteActionsAnchor, setNoteActionsAnchor] = useState<{ x: number; y: number } | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  // Optional debug info: which persona was last tapped (helps beginners confirm clicks register).
  const [aiLastRun, setAiLastRun] = useState<{ persona: PersonaId; at: number } | null>(null)

  // Autosave (“Studio” UX): debounced background sync.
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle')
  const [autosaveError, setAutosaveError] = useState<string | null>(null)

  // Web/Desktop: collapsible sidebar for distraction-free editing.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Animate the sidebar open/close on web/desktop.
  useEffect(() => {
    if (isNarrow) return
    Animated.timing(sidebarAnim, {
      toValue: sidebarCollapsed ? 0 : 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      // We animate WIDTH (layout), so native driver must be false.
      useNativeDriver: false,
    }).start()
  }, [isNarrow, sidebarAnim, sidebarCollapsed])

  // Copy UX: brief success flash on the button.
  const [copiedFlash, setCopiedFlash] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosaveInFlightRef = useRef(false)
  const autosavePendingRef = useRef(false)
  const lastSavedSignatureRef = useRef<string>('') // signature of title/raw_content we last persisted

  /**
   * Hybrid Preview source:
   * - Draft preview is always the raw markdown.
   * - AI preview is the formatted markdown returned by the Edge Function.
   */
  const previewMarkdown = useMemo(() => {
    return isPreviewingAI ? formattedContent : rawContent
  }, [formattedContent, isPreviewingAI, rawContent])

  /**
   * Important UX rule:
   * If the user edits the raw draft while previewing AI output, automatically switch back
   * to Draft mode so the preview never lies (AI output may now be stale).
   */
  const lastRawContentRef = useRef(rawContent)
  useEffect(() => {
    /**
     * IMPORTANT:
     * We only want to auto-exit AI mode when the RAW TEXT actually changes.
     *
     * Bug we avoid here:
     * - If we depended on `isPreviewingAI` directly, switching AI mode ON would also trigger the effect,
     *   immediately flipping it back OFF.
     *
     * Fix:
     * - Track the previous rawContent in a ref and compare.
     */
    const prevRaw = lastRawContentRef.current
    const didRawChange = rawContent !== prevRaw
    lastRawContentRef.current = rawContent

    if (isPreviewingAI && didRawChange) {
      setIsPreviewingAI(false)
    }
  }, [isPreviewingAI, rawContent])

  const filteredNotebookList = useMemo(() => {
    const q = savedSearch.trim().toLowerCase()
    if (!q) return notebookList
    return notebookList.filter((n) => ((n.title ?? '').trim() || '').toLowerCase().includes(q))
  }, [notebookList, savedSearch])

  const makeAutosaveSignature = useCallback((t: string, r: string) => {
    // Keep it stable and cheap: we only care about user-facing “draft” content.
    return `${t.trim()}\n---\n${r}`
  }, [])

  const bumpNotebookListItem = useCallback((item: NotebookListItem) => {
    // Move the touched note to the top (and update title/updated_at).
    setNotebookList((prev) => {
      const next = prev.filter((x) => x.id !== item.id)
      return [item, ...next]
    })
  }, [])

  const saveNoteDraft = useCallback(
    async (opts?: { reason?: 'debounce' | 'flush' | 'ai' }) => {
      const userId = session?.user?.id
      if (!userId) {
        setAutosaveError('Login required to sync.')
        setAutosaveState('error')
        return false
      }

      const sig = makeAutosaveSignature(title, rawContent)
      const hasMeaningfulContent = !!(title.trim() || rawContent.trim())

      // Don’t create empty drafts.
      if (!noteId && !hasMeaningfulContent) return true

      // Avoid redundant writes.
      if (sig === lastSavedSignatureRef.current && opts?.reason !== 'flush') return true

      // Prevent overlapping writes; remember we owe a save.
      if (autosaveInFlightRef.current) {
        autosavePendingRef.current = true
        return true
      }

      autosaveInFlightRef.current = true
      setAutosaveError(null)
      setAutosaveState('syncing')

      const nowIso = new Date().toISOString()

      try {
        if (!noteId) {
          // Create-once behavior: first autosave creates the note row.
          try {
            const payload = {
              user_id: userId,
              title,
              raw_content: rawContent,
              // Only store AI output here (drafts don't need formatted_content).
              formatted_content: formattedContent || null,
              selected_style: selectedStyle,
              updated_at: nowIso,
            }
            const { data, error } = await supabase.from('notes').insert(payload).select('id').single()
            if (error) throw error
            setNoteId(data.id)
            bumpNotebookListItem({ id: data.id, title: title || null, updated_at: nowIso })
          } catch {
            // Legacy schema fallback
            const payload = {
              user_id: userId,
              title,
              body: rawContent,
              updated_at: nowIso,
            }
            const { data, error } = await supabase.from('notes').insert(payload).select('id').single()
            if (error) throw error
            setNoteId(data.id)
            bumpNotebookListItem({ id: data.id, title: title || null, updated_at: nowIso })
          }
        } else {
          // Update-in-place behavior.
          try {
            const payload = {
              title,
              raw_content: rawContent,
              // Only store AI output here (drafts don't need formatted_content).
              formatted_content: formattedContent || null,
              selected_style: selectedStyle,
              updated_at: nowIso,
            }
            const { error } = await supabase.from('notes').update(payload).eq('id', noteId).eq('user_id', userId)
            if (error) throw error
            bumpNotebookListItem({ id: noteId, title: title || null, updated_at: nowIso })
          } catch {
            // Legacy schema fallback
            const payload = { title, body: rawContent, updated_at: nowIso }
            const { error } = await supabase.from('notes').update(payload).eq('id', noteId).eq('user_id', userId)
            if (error) throw error
            bumpNotebookListItem({ id: noteId, title: title || null, updated_at: nowIso })
          }
        }

        lastSavedSignatureRef.current = sig
        setAutosaveState('saved')
        return true
      } catch (e: any) {
        setAutosaveError(e?.message ?? 'Sync failed')
        setAutosaveState('error')
        return false
      } finally {
        autosaveInFlightRef.current = false
        if (autosavePendingRef.current) {
          // If changes happened while we were syncing, immediately run one more save.
          autosavePendingRef.current = false
          void saveNoteDraft({ reason: 'debounce' })
        }
      }
    },
    [
      bumpNotebookListItem,
      formattedContent,
      makeAutosaveSignature,
      noteId,
      rawContent,
      selectedStyle,
      session?.user?.id,
      title,
    ]
  )

  const flushAutosave = useCallback(async () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    return await saveNoteDraft({ reason: 'flush' })
  }, [saveNoteDraft])

  // Debounced autosave on title/raw changes (2s).
  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return

    const sig = makeAutosaveSignature(title, rawContent)

    // Don’t mark dirty if we’re just hydrating state from a loaded note.
    if (sig === lastSavedSignatureRef.current) return

    // Don’t create empty drafts.
    if (!noteId && !(title.trim() || rawContent.trim())) return

    setAutosaveState((prev) => (prev === 'dirty' ? prev : 'dirty'))

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
  }, [makeAutosaveSignature, noteId, rawContent, saveNoteDraft, session?.user?.id, title])

  // ----------------------------
  // Load saved notes list (right panel)
  // ----------------------------
  const loadNotebookList = useCallback(async () => {
    const userId = session?.user?.id
    if (!userId) {
      setNotebookList([])
      return
    }

    setLoadingList(true)
    try {
      /**
       * IMPORTANT COMPATIBILITY NOTE:
       * Your Supabase `notes` table might not have the new columns yet
       * (raw_content, formatted_content, selected_style).
       *
       * To make the “Saved notes” list work immediately, we only select columns
       * that we know exist from earlier versions: id, title, updated_at.
       *
       * Later (in the schema todo), we’ll add the new columns and can expand this select.
       */
      const { data, error } = await supabase
        .from('notes')
        .select('id,title,updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (error) throw error
      setNotebookList((data ?? []) as NotebookListItem[])
    } catch (e: any) {
      Alert.alert('Failed to load notes', e?.message ?? 'Unknown error')
    } finally {
      setLoadingList(false)
    }
  }, [session?.user?.id])

  useEffect(() => {
    loadNotebookList()
  }, [loadNotebookList])

  // ----------------------------
  // Load a note into the workbench when user taps the list
  // ----------------------------
  const loadNotebookById = useCallback(
    async (id: string) => {
      const userId = session?.user?.id
      if (!userId) return

      try {
        /**
         * We try the NEW schema first (raw_content/formatted_content/selected_style).
         * If the table doesn’t have those columns yet, we fall back to the OLD schema (body).
         */
        try {
          const { data, error } = await supabase
            .from('notes')
            .select('id,title,raw_content,formatted_content,selected_style,updated_at')
            .eq('user_id', userId)
            .eq('id', id)
            .single()

          if (error) throw error

          setNoteId(data.id)
          setTitle(data.title ?? '')
          setRawContent(data.raw_content ?? '')
          setFormattedContent(data.formatted_content ?? '')
          setSelectedStyle((data.selected_style ?? null) as PersonaId | null)
          // Hybrid Preview default: always open notes in Draft mode.
          setIsPreviewingAI(false)
          lastSavedSignatureRef.current = makeAutosaveSignature(data.title ?? '', data.raw_content ?? '')
          setAutosaveError(null)
          setAutosaveState('saved')
          return
        } catch {
          // Fall back to legacy columns
          const { data, error } = await supabase
            .from('notes')
            .select('id,title,body,updated_at')
            .eq('user_id', userId)
            .eq('id', id)
            .single()

          if (error) throw error

          setNoteId(data.id)
          setTitle(data.title ?? '')
          setRawContent(data.body ?? '')
          setFormattedContent('')
          setSelectedStyle(null)
          // Hybrid Preview default: always open notes in Draft mode.
          setIsPreviewingAI(false)
          lastSavedSignatureRef.current = makeAutosaveSignature(data.title ?? '', data.body ?? '')
          setAutosaveError(null)
          setAutosaveState('saved')
        }
      } catch (e: any) {
        Alert.alert('Failed to load note', e?.message ?? 'Unknown error')
      }
    },
    [makeAutosaveSignature, session?.user?.id]
  )

  /**
   * Delete a note (from the 3-dots menu)
   *
   * Beginner notes:
   * - We ALWAYS filter by both `id` and `user_id` for safety.
   * - After deleting, we refresh the list and clear the editor if the deleted note was loaded.
   */
  const deleteNotebookById = useCallback(
    async (id: string) => {
      const userId = session?.user?.id
      if (!userId) {
        Alert.alert('Login required', 'Please login before deleting notes.')
        return
      }

      setDeletingId(id)
      try {
        const { error } = await supabase.from('notes').delete().eq('id', id).eq('user_id', userId)
        if (error) throw error

        // If user deleted the currently loaded note, clear the editor state.
        if (noteId === id) {
          setNoteId(null)
          setTitle('')
          setRawContent('')
          setFormattedContent('')
          setSelectedStyle(null)
          setIsPreviewingAI(false)
        }

        await loadNotebookList()
      } catch (e: any) {
        Alert.alert('Delete failed', e?.message ?? 'Unknown error')
      } finally {
        setDeletingId(null)
      }
    },
    [loadNotebookList, noteId, session?.user?.id]
  )

  /**
   * Open the “3 dots” actions sheet.
   * We store the selected note in state so the modal knows which note to act on.
   */
  const openNoteActions = useCallback((note: NotebookListItem) => {
    // Fallback anchor (if caller didn't provide tap coordinates):
    // show near the top-right so it still appears on screen.
    setNoteActionsAnchor({ x: windowWidth - 16, y: 120 })
    setNoteActionsTarget(note)
    setNoteActionsVisible(true)
  }, [windowWidth])

  const openNoteActionsAt = useCallback(
    (note: NotebookListItem, e: any) => {
      /**
       * We capture screen coordinates so we can position a small popover
       * right next to the tapped “3 dots” icon.
       *
       * RN provides these on both native + web:
       * - pageX / pageY: absolute position in the window
       */
      const x = e?.nativeEvent?.pageX ?? windowWidth - 16
      const y = e?.nativeEvent?.pageY ?? 120
      setNoteActionsAnchor({ x, y })
      setNoteActionsTarget(note)
      setNoteActionsVisible(true)
    },
    [windowWidth]
  )

  const closeNoteActions = useCallback(() => {
    setNoteActionsVisible(false)
    setNoteActionsTarget(null)
    setNoteActionsAnchor(null)
  }, [])

  // ----------------------------
  // AI Styling (triggered ONLY by persona selection)
  // ----------------------------
  const runAiStyling = useCallback(
    async (persona: PersonaId) => {
      const userId = session?.user?.id
      if (!userId) {
        // On web, Alert dialogs can be inconsistent. Also show error inline.
        setAiError('Login required: please login before using AI styling.')
        return
      }

      if (!rawContent.trim()) {
        setAiError('Nothing to style: type some notes first.')
        return
      }

      // Clear any previous error and immediately mark the persona as selected
      // so the user can see their click registered.
      setAiError(null)
      setAiLastRun({ persona, at: Date.now() })
      setSelectedStyle(persona)
      setStyling(true)
      try {
        /**
         * IMPORTANT (beginner concept):
         * Supabase Edge Functions require an auth token if you want to run them as the current user.
         *
         * supabase.functions.invoke() usually attaches the token automatically,
         * but on web it can be flaky depending on environment/storage.
         *
         * So we explicitly fetch the current session and pass Authorization ourselves.
         */
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession()
        const accessToken = currentSession?.access_token
        if (!accessToken) {
          throw new Error('No access token found. Please login again.')
        }

        /**
         * Calls Supabase Edge Function: `note-style`
         *
         * Server receives: { title, raw_content, persona }
         * Server returns: { formatted_content } (markdown)
         *
         * IMPORTANT SECURITY NOTE:
         * - OpenAI API key stays in Supabase secrets, NOT in this app.
         */
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/note-style`, {
          method: 'POST',
          headers: {
            // Supabase expects BOTH:
            // - apikey (project anon key)
            // - Authorization (the user's JWT)
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title,
            raw_content: rawContent,
            persona,
          }),
        })

        const text = await resp.text()
        if (!resp.ok) {
          // Show the server response body — it usually contains the real reason.
          throw Object.assign(new Error('Edge Function returned a non-2xx status code'), {
            status: resp.status,
            details: text,
          })
        }

        const data = JSON.parse(text)
        const markdown = (data?.formatted_content ?? '') as string
        if (!markdown) throw new Error('Edge function returned empty formatted_content')

        setFormattedContent(markdown)
        // In Hybrid Preview, AI output lives in `formattedContent` and is shown only in AI Mode.
        // Persist the styled result (non-debounced; AI runs are infrequent).
        void saveNoteDraft({ reason: 'ai' })
      } catch (e: any) {
        /**
         * Supabase `functions.invoke()` errors can be generic, e.g.:
         *   "Edge Function returned a non-2xx status code"
         *
         * But the REAL reason is often inside `e.context`, which may include:
         * - status (number)
         * - body / response text (string)
         *
         * We extract as much detail as possible so you can fix the root cause quickly.
         */
        const status = e?.context?.status ?? e?.status
        const details = e?.context?.body ?? e?.context?.response ?? e?.details
        const message = e?.message ?? 'Unknown error'

        const extra = details ? `\nDetails: ${typeof details === 'string' ? details : JSON.stringify(details)}` : ''
        const statusPart = status ? ` (HTTP ${status})` : ''

        // Show error inline so it’s visible on both web + native.
        setAiError(`AI styling failed${statusPart}: ${message}${extra}`)

        // Also log the full object for debugging in the console.
        console.error('[AI styling error]', e)
        // Hybrid Preview fallback: return to Draft mode (raw markdown).
        setIsPreviewingAI(false)
      } finally {
        setStyling(false)
      }
    },
    [rawContent, saveNoteDraft, session?.user?.id, title]
  )

  const clearEditor = useCallback(() => {
    setNoteId(null)
    setTitle('')
    setRawContent('')
    setFormattedContent('')
    setSelectedStyle(null)
    setIsPreviewingAI(false)
    setAiError(null)
    setAiLastRun(null)
    setAutosaveError(null)
    setAutosaveState('idle')
    lastSavedSignatureRef.current = ''
  }, [])

  /**
   * New Note behavior:
   * - Flush any pending autosave
   * - Refresh the screen (route replace)
   * - Clear the editor so user can start a fresh note
   */
  const handleNewNote = useCallback(async () => {
    const ok = await flushAutosave()
    if (!ok) {
      Alert.alert('Could not sync', 'Please check your connection/login, then try again.')
      return
    }

    clearEditor()
    router.replace(`/notebook?new=${Date.now()}`)
  }, [clearEditor, flushAutosave, router])

  const renderAutosaveIndicator = useCallback(() => {
    if (autosaveState === 'syncing') {
      return (
        <View style={styles.headerStatus}>
          <ActivityIndicator size="small" />
          <Text style={styles.headerStatusText}>Syncing…</Text>
        </View>
      )
    }

    if (autosaveState === 'dirty') {
      return (
        <View style={styles.headerStatus}>
          <MaterialIcons name="fiber-manual-record" size={12} color="#6b7280" />
          <Text style={[styles.headerStatusText, { color: '#6b7280' }]}>Unsaved</Text>
        </View>
      )
    }

    if (autosaveState === 'saved') {
      return (
        <View style={styles.headerStatus}>
          <MaterialIcons name="check" size={18} color="#111827" />
          <Text style={styles.headerStatusText}>Saved</Text>
        </View>
      )
    }

    if (autosaveState === 'error') {
      return (
        <View style={styles.headerStatus}>
          <MaterialIcons name="error-outline" size={18} color="#991b1b" />
          <Text style={styles.headerStatusText}>Sync error</Text>
        </View>
      )
    }

    return null
  }, [autosaveState])

  // Shimmer loop for preview skeleton while AI runs.
  useEffect(() => {
    if (!styling) return
    skeletonAnim.setValue(0)
    const loop = Animated.loop(
      Animated.timing(skeletonAnim, {
        toValue: 1,
        duration: 1100,
        useNativeDriver: true,
      })
    )
    loop.start()
    return () => loop.stop()
  }, [skeletonAnim, styling])

  const skeletonTranslateX = skeletonAnim.interpolate({ inputRange: [0, 1], outputRange: [-140, 260] })

  // Autosave badge animation (Raw Notes bottom-right):
  // - When saved: a subtle pulsing green dot
  // - We keep the animation isolated so it doesn't impact typing performance.
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

  // Canvas card padding (Pro Studio):
  // - web/desktop: roomier
  // - mobile: a bit tighter
  const cardPadding = isNarrow ? 20 : 32

  /**
   * Word count + reading time:
   * - Simple heuristic: 200 words/minute.
   * - We count based on what the user is currently previewing (Draft or AI).
   */
  const wordCount = useMemo(() => {
    const text = (previewMarkdown ?? '').trim()
    if (!text) return 0
    return text.split(/\s+/).filter(Boolean).length
  }, [previewMarkdown])

  const readingTimeMinutes = useMemo(() => {
    if (!wordCount) return 0
    return Math.max(1, Math.ceil(wordCount / 200))
  }, [wordCount])

  // ----------------------------
  // Copy Result (to clipboard)
  // ----------------------------
  const copyResult = useCallback(async () => {
    // Copy whatever is currently shown in the preview (Draft or AI).
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

  const toggleSavedListOrSidebar = useCallback(() => {
    if (isNarrow) {
      if (savedDrawerVisible) closeSavedDrawer()
      else openSavedDrawer()
      return
    }
    setSidebarCollapsed((v: boolean) => !v)
  }, [closeSavedDrawer, isNarrow, openSavedDrawer, savedDrawerVisible])

  // Header: Studio toolbar (New Note, autosave status, Saved toggle, Account)
  const headerLeft = useMemo(() => {
    const HeaderLeft = () => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New note"
        onPress={handleNewNote}
        style={{ paddingHorizontal: 12, paddingVertical: 6 }}
      >
        <MaterialIcons name="note-add" size={22} color="#111" />
      </Pressable>
    )
    HeaderLeft.displayName = 'HeaderLeft'
    return HeaderLeft
  }, [handleNewNote])

  const headerRight = useMemo(() => {
    const HeaderRight = () => (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isNarrow ? 'Saved notes' : 'Toggle sidebar'}
          onPress={toggleSavedListOrSidebar}
          style={{ paddingHorizontal: 10, paddingVertical: 6 }}
        >
          <MaterialIcons name="menu" size={24} color="#111" />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Account"
          onPress={() => {
            if (drawerVisible) closeDrawer()
            else openDrawer()
          }}
          style={{ paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Ionicons name="person-circle-outline" size={28} color="#111" />
        </Pressable>
      </View>
    )
    HeaderRight.displayName = 'HeaderRight'
    return HeaderRight
  }, [closeDrawer, drawerVisible, isNarrow, openDrawer, toggleSavedListOrSidebar])

  const headerTitle = useMemo(() => {
    const HeaderTitle = () => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Aero Agent"
        onPress={() => router.replace('/')}
        style={styles.headerTitleButton}
      >
        <Text style={styles.headerTitleText}>Aero Agent</Text>
      </Pressable>
    )
    HeaderTitle.displayName = 'HeaderTitle'
    return HeaderTitle
  }, [router])

  // ----------------------------
  // Render: If not logged in, show Auth component
  // ----------------------------
  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerLeft,
          headerRight,
          headerTitle,
          headerTitleAlign: 'center',
        }}
      />

      {/* ========================= TOP HALF (Workbench) ========================= */}
      <View style={styles.topHalf}>
        <View style={[styles.workbenchRow, isNarrow && { flexDirection: 'column' }]}>
          {/* LEFT: Title + Raw Input */}
          <View style={[styles.workbenchLeft, isNarrow && { flex: 1 }]}>
            <View style={styles.noteTitleRow}>
              <Text style={styles.label}>Note Title</Text>

              {/* Autosave indicator (always visible near the title) */}
              <View pointerEvents="none" style={styles.noteTitleAutosave}>
                {autosaveState === 'syncing' ? (
                  <ActivityIndicator size="small" color="#9CA3AF" />
                ) : autosaveState === 'saved' ? (
                  <Animated.View
                    style={[
                      styles.noteTitleAutosaveDot,
                      { transform: [{ scale: autosavePulseScale }], opacity: autosavePulseOpacity },
                    ]}
                  />
                ) : null}
              </View>
            </View>
            <TextInput
              style={styles.titleInput}
              placeholder="Type a title…"
              value={title}
              onChangeText={setTitle}
              autoCapitalize="sentences"
              returnKeyType="done"
            />
            {/* 
              Debug/clarity line:
              - Helps confirm which saved note is currently loaded (if any).
              - Also prevents the `noteId` state from being “unused”.
            */}
            {noteId ? <Text style={styles.muted}>Loaded note: {noteId.slice(0, 8)}…</Text> : null}

            <Text style={[styles.label, { marginTop: 12 }]}>Raw Notes</Text>
            <View style={styles.rawInputWrap}>
              <TextInput
                style={styles.rawInput}
                placeholder="Type your messy thoughts here…"
                value={rawContent}
                onChangeText={setRawContent}
                multiline
                // Mobile UX: never auto-focus; avoids keyboard popping on page enter.
                autoFocus={false}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* RIGHT: Saved notes list */}
          {!isNarrow ? (
            <Animated.View
              // Web/Desktop UX:
              // - Keep sidebar mounted
              // - Animate width (0 <-> sidebarTargetWidth) for smooth slide
              style={[
                styles.workbenchRight,
                {
                  width: sidebarAnim.interpolate({ inputRange: [0, 1], outputRange: [0, sidebarTargetWidth] }),
                  opacity: sidebarAnim,
                },
              ]}
              pointerEvents={sidebarCollapsed ? 'none' : 'auto'}
            >
              <View style={styles.listHeaderRow}>
                <Text style={styles.listHeader}>Saved</Text>
                <TextInput
                  style={styles.listSearchInput}
                  placeholder="Search notes…"
                  value={savedSearch}
                  onChangeText={setSavedSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                />
              </View>
              {loadingList ? <Text style={styles.muted}>Loading…</Text> : null}

              <ScrollView style={styles.listScroll} keyboardShouldPersistTaps="handled">
                {filteredNotebookList.length === 0 ? (
                  <Text style={styles.muted}>{savedSearch.trim() ? 'No matches' : 'No notes yet'}</Text>
                ) : (
                  filteredNotebookList.map((n) => (
                    <View key={n.id} style={styles.listItem}>
                      <View style={styles.listItemRow}>
                        {/* 
                          IMPORTANT:
                          - Make ONLY the text area load the note.
                          - The 3-dots button is separate, so presses don’t conflict.
                        */}
                        <Pressable style={styles.listItemTextCol} onPress={() => loadNotebookById(n.id)}>
                          <Text style={styles.listItemTitle} numberOfLines={1}>
                            {(n.title ?? '').trim() ? n.title : '(Untitled)'}
                          </Text>
                          <Text style={styles.listItemMeta} numberOfLines={1}>
                            {n.updated_at ? new Date(n.updated_at).toLocaleString() : ''}
                          </Text>
                        </Pressable>

                        {/* 3-dots menu button */}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="More actions"
                          hitSlop={10}
                          style={styles.moreButton}
                          onPress={(e) => openNoteActionsAt(n, e)}
                          disabled={deletingId === n.id}
                        >
                          <Ionicons name="ellipsis-vertical" size={16} color="#444" />
                        </Pressable>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </Animated.View>
          ) : null}
        </View>
      </View>

      {/* ========================= MIDDLE (Magic Bar) ========================= */}
      <View style={styles.magicBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.magicBarContent}>
          {PERSONAS.map((p) => {
            const active = selectedStyle === p.id
            const label = styling && active ? 'Styling…' : p.label
            return (
              <PersonaPill
                key={p.id}
                label={label}
                help={PERSONA_HELP[p.id]}
                active={active}
                disabled={styling}
                onPress={async () => {
                  /**
                   * “Physical” feedback:
                   * - Only on native (web should not vibrate or throw).
                   * - Wrapped in try/catch so unsupported devices never break the tap.
                   */
                  if (Platform.OS !== 'web') {
                    try {
                      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    } catch {
                      // ignore
                    }
                  }
                  // Hybrid Preview trigger:
                  // - If there's content, switch into AI mode immediately (user intent is “show AI output”).
                  // - If there's nothing to style, keep Draft mode so the preview stays meaningful.
                  if (!rawContent.trim()) {
                    setIsPreviewingAI(false)
                  } else {
                    setIsPreviewingAI(true)
                  }
                  runAiStyling(p.id)
                }}
              />
            )
          })}
        </ScrollView>
      </View>

      {/* ========================= BOTTOM HALF (Canvas) ========================= */}
      <View style={styles.bottomHalf}>
        <Text style={styles.canvasLabel}>AI STYLED PREVIEW</Text>
        {/* Inline AI error (visible on web + native) */}
        {aiError ? <Text style={styles.aiErrorText}>{aiError}</Text> : null}
        {aiLastRun ? <Text style={styles.aiDebugText}>Last persona: {aiLastRun.persona}</Text> : null}

        <View style={[styles.card, { padding: cardPadding }, isPreviewingAI && styles.cardAiMode]}>
          {/* AI mode badge + reset (Hybrid Preview) */}
          {isPreviewingAI ? (
            <View style={styles.cardAiTopRow}>
              <View style={styles.aiBadge}>
                <Text style={styles.aiBadgeText}>✨ AI Generated</Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to draft"
                onPress={() => setIsPreviewingAI(false)}
                style={styles.backToDraftButton}
              >
                <MaterialIcons name="undo" size={16} color="#374151" />
                <Text style={styles.backToDraftText}>Back to Draft</Text>
              </Pressable>
            </View>
          ) : null}

          <ScrollView style={styles.cardBody} keyboardShouldPersistTaps="handled">
            {styling ? (
              <View style={styles.skeletonWrap}>
                <View style={styles.skeletonBar} />
                <View style={styles.skeletonBarWide} />
                <View style={styles.skeletonBar} />
                <View style={styles.skeletonBarWide} />
                <Animated.View style={[styles.skeletonShimmer, { transform: [{ translateX: skeletonTranslateX }] }]} />
              </View>
            ) : !previewMarkdown.trim() ? (
              /**
               * Hybrid Preview empty state:
               * - We show this only when there's nothing to render in the current view.
               * - In Draft mode: raw draft is empty.
               * - In AI mode: AI output is empty (should be rare).
               */
              <View style={styles.previewEmpty}>
                <View style={styles.previewEmptyIcon}>
                  <Sparkles size={28} color="#6366F1" />
                </View>
                <Text style={styles.previewEmptyTitle}>Ready to transform</Text>
                <Text style={styles.previewEmptySubtitle}>Select a persona above to transform your thoughts.</Text>
              </View>
            ) : (
              <MarkdownView markdown={previewMarkdown} />
            )}
          </ScrollView>

          <View style={styles.cardFooterRow}>
            <Text style={styles.cardMetaText}>
              {wordCount ? `${wordCount} words • ${readingTimeMinutes} min read` : '—'}
            </Text>

            <View style={styles.cardActionsRow}>
              <Pressable
                style={[
                  styles.copyButton,
                  copiedFlash && styles.copyButtonCopied,
                  (!previewMarkdown.trim() || styling) && styles.disabled,
                ]}
                onPress={copyResult}
                disabled={!previewMarkdown.trim() || styling}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={styles.copyButtonText}>{copiedFlash ? 'Copied! ✅' : 'Copy Result'}</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share (coming soon)"
                disabled
                style={[styles.shareButton, styles.disabled]}
                onPress={() => {}}
              >
                <MaterialIcons name="ios-share" size={18} color="#111827" />
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* Mobile: slide-out Saved Notes drawer (kept mounted for smoother open) */}
      {isNarrow ? (
        <View
          // When closed, we disable interactions so it behaves like it’s “not there”.
          pointerEvents={savedDrawerVisible ? 'auto' : 'none'}
          style={StyleSheet.absoluteFillObject}
        >
          {/* Backdrop fade */}
          <Animated.View style={[styles.drawerBackdrop, { opacity: savedDrawerAnim }]} />

          {/* Tap outside closes */}
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeSavedDrawer} />

          {/* Drawer panel slides in from the right */}
          <Animated.View
            style={[
              styles.savedDrawer,
              {
                width: savedDrawerWidth,
                transform: [
                  {
                    translateX: savedDrawerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [savedDrawerWidth, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.savedDrawerTopRow}>
              <Text style={styles.drawerTitle}>Saved Notes</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close saved notes"
                hitSlop={10}
                style={styles.savedDrawerClose}
                onPress={closeSavedDrawer}
              >
                <Ionicons name="close" size={22} color="#111" />
              </Pressable>
            </View>

            <View style={styles.listHeaderRow}>
              <Text style={styles.listHeader}>Saved</Text>
              <TextInput
                style={styles.listSearchInput}
                placeholder="Search notes…"
                value={savedSearch}
                onChangeText={setSavedSearch}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>
            {loadingList ? <Text style={styles.muted}>Loading…</Text> : null}

            <ScrollView style={styles.listScroll} keyboardShouldPersistTaps="handled">
              {filteredNotebookList.length === 0 ? (
                <Text style={styles.muted}>{savedSearch.trim() ? 'No matches' : 'No notes yet'}</Text>
              ) : (
                filteredNotebookList.map((n) => (
                  <View key={n.id} style={styles.listItem}>
                    <View style={styles.listItemRow}>
                      <Pressable
                        style={styles.listItemTextCol}
                        onPress={() => {
                          loadNotebookById(n.id)
                          closeSavedDrawer()
                        }}
                      >
                        <Text style={styles.listItemTitle} numberOfLines={1}>
                          {(n.title ?? '').trim() ? n.title : '(Untitled)'}
                        </Text>
                        <Text style={styles.listItemMeta} numberOfLines={1}>
                          {n.updated_at ? new Date(n.updated_at).toLocaleString() : ''}
                        </Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="More actions"
                        hitSlop={10}
                        style={styles.moreButton}
                        onPress={(e) => openNoteActionsAt(n, e)}
                        disabled={deletingId === n.id}
                      >
                        <Ionicons name="ellipsis-vertical" size={16} color="#444" />
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </Animated.View>
        </View>
      ) : null}

      {/* Full-height slide-in account drawer (same as main page) */}
      {drawerVisible ? (
        <Pressable style={styles.drawerBackdrop} onPress={closeDrawer}>
          <Animated.View
            style={[
              styles.drawer,
              {
                width: drawerWidth,
                transform: [
                  {
                    translateX: drawerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [drawerWidth, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.drawerTitle}>Account</Text>

            {session?.user?.email ? (
              <>
                <Text style={styles.drawerLabel}>Signed in as</Text>
                <Text style={styles.drawerEmail}>{session.user.email}</Text>

                <Pressable
                  style={[styles.drawerButton, { marginTop: 16 }]}
                  onPress={async () => {
                    await supabase.auth.signOut()
                    closeDrawer()
                  }}
                >
                  <Text style={styles.drawerButtonText}>Logout</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.drawerHint}>You are not logged in.</Text>
                <Pressable
                  style={styles.drawerButton}
                  onPress={() => {
                    closeDrawer()
                    setAuthMode('signIn')
                    setAuthVisible(true)
                  }}
                >
                  <Text style={styles.drawerButtonText}>Login</Text>
                </Pressable>
                <Pressable
                  style={styles.drawerButton}
                  onPress={() => {
                    closeDrawer()
                    setAuthMode('signUp')
                    setAuthVisible(true)
                  }}
                >
                  <Text style={styles.drawerButtonText}>Register</Text>
                </Pressable>
              </>
            )}

            <Pressable style={[styles.drawerButton, { marginTop: 8 }]} onPress={closeDrawer}>
              <Text style={styles.drawerButtonText}>Close</Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      ) : null}

      {/* Auth popup (same as main page) */}
      <Modal transparent visible={authVisible} animationType="slide" onRequestClose={() => setAuthVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAuthVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Auth mode={authMode} onSuccess={() => setAuthVisible(false)} />
            <Pressable style={[styles.drawerButton, { marginTop: 8 }]} onPress={() => setAuthVisible(false)}>
              <Text style={styles.drawerButtonText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Note actions sheet (replaces Alert.alert so it works on web + native) */}
      <Modal transparent visible={noteActionsVisible} animationType="fade" onRequestClose={closeNoteActions}>
        {/**
         * Small anchored popover (instead of centered sheet):
         * - Positioned near the tapped 3-dots icon (using pageX/pageY).
         * - Right-aligned (popover grows left from the tap).
         * - Includes a small “tip” triangle pointing to the tap target.
         */}
        <View style={StyleSheet.absoluteFillObject}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeNoteActions} />

          {(() => {
            const MENU_W = 220
            const anchorX = noteActionsAnchor?.x ?? windowWidth - 16
            const anchorY = noteActionsAnchor?.y ?? 120

            // Position: align the popover’s right edge near the tap.
            const left = Math.min(Math.max(anchorX - MENU_W + 10, 8), windowWidth - MENU_W - 8)
            const top = Math.min(Math.max(anchorY + 10, 8), windowHeight - 160)

            // Tip: place it near the tap X, clamped inside the menu width.
            const tipLeft = Math.min(Math.max(anchorX - left - 10, 14), MENU_W - 26)

            return (
              <View style={[styles.actionsPopover, { width: MENU_W, left, top }]}>
                {/* Tip border (slightly darker) */}
                <View style={[styles.actionsTipBorder, { left: tipLeft }]} />
                {/* Tip fill */}
                <View style={[styles.actionsTip, { left: tipLeft }]} />

                <Text style={styles.actionsCompactTitle} numberOfLines={1}>
                  {(noteActionsTarget?.title ?? '').trim() ? noteActionsTarget?.title : '(Untitled)'}
                </Text>

                <Pressable
                  style={[styles.actionsMenuItemDanger, deletingId && styles.disabled]}
                  disabled={!noteActionsTarget || !!deletingId}
                  onPress={async () => {
                    if (!noteActionsTarget) return
                    const id = noteActionsTarget.id
                    closeNoteActions()
                    await deleteNotebookById(id)
                  }}
                >
                  <MaterialIcons name="delete-outline" size={18} color="#991b1b" />
                  <Text style={styles.actionsMenuItemDangerText}>{deletingId ? 'Deleting…' : 'Delete note'}</Text>
                </Pressable>

                <Pressable style={styles.actionsMenuItem} onPress={closeNoteActions}>
                  <MaterialIcons name="close" size={18} color="#374151" />
                  <Text style={styles.actionsMenuItemText}>Cancel</Text>
                </Pressable>
              </View>
            )
          })()}
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
  },
  headerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  headerStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  headerTitleButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  headerTitleText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
  },

  // Studio split: top/middle/bottom
  topHalf: {
    flex: 1,
  },
  magicBar: {
    paddingVertical: 10,
  },
  bottomHalf: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 14,
  },

  // Workbench
  workbenchRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  workbenchLeft: {
    flex: 2,
  },
  workbenchRight: {
    // IMPORTANT:
    // Sidebar width is animated on web/desktop, so we do NOT use flex here.
    // (If we used flex, the editor would "snap" instead of resizing smoothly.)
    overflow: 'hidden',
    borderLeftWidth: 1,
    borderLeftColor: '#eee',
    paddingLeft: 12,
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
  },
  noteTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteTitleAutosave: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6, // match label baseline spacing
  },
  noteTitleAutosaveDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#10B981',
  },
  rawInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e4e4e7',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  rawInputWrap: {
    flex: 1,
    position: 'relative',
  },
  ghostButton: {
    marginTop: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ghostButtonText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  editorButtonRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  editorButtonRowItem: {
    flex: 1,
    marginTop: 0,
  },
  // (Save/New Note use ghostButton styles)

  // Saved list
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  listHeader: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111',
    flexShrink: 0,
  },
  listSearchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e4e4e7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
  },
  listScroll: {
    flex: 1,
  },
  listItem: {
    backgroundColor: '#f6f6f7',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 10,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  listItemTextCol: {
    flex: 1,
  },
  moreButton: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#eeeeef',
  },
  listItemTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111',
    marginBottom: 2,
  },
  listItemMeta: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555',
  },
  muted: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    marginBottom: 6,
  },

  // Magic bar
  magicBarContent: {
    gap: 8,
    paddingRight: 8,
  },
  // Magic Bar — glassmorphism pills
  pillBase: {
    borderRadius: 50,
    overflow: 'hidden', // important for Blur/Gradient clipping
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
  pillActiveGlass: {
    shadowColor: '#818CF8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 8,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
  },
  pillTextActive: {
    color: '#fff',
  },

  // Canvas + card
  canvasLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#666',
    marginBottom: 10,
    letterSpacing: 0.6,
  },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    // Padding is set dynamically in render (desktop vs mobile).
    // Shadow (iOS)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    // Shadow (Android)
    elevation: 5,
  },
  // Hybrid Preview: subtle AI mode border so the user knows they're not viewing the raw draft.
  cardAiMode: {
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.35)',
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
    backgroundColor: 'rgba(99, 102, 241, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
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
    backgroundColor: 'rgba(99, 102, 241, 0.10)',
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
    fontSize: 16,
    fontWeight: '900',
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
  aiDebugText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#444',
    marginBottom: 10,
  },

  disabled: {
    opacity: 0.6,
  },

  // Drawer styles (copied from the main page for consistent UX)
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-start',
  },
  savedDrawer: {
    alignSelf: 'flex-end',
    height: '100%',
    backgroundColor: '#fff',
    paddingTop: 18,
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  savedDrawerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  savedDrawerClose: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  drawer: {
    alignSelf: 'flex-end',
    height: '100%',
    backgroundColor: '#fff',
    paddingTop: 18,
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111',
    marginBottom: 10,
  },
  drawerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#444',
    marginTop: 6,
  },
  drawerEmail: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111',
    marginTop: 4,
    marginBottom: 8,
  },
  drawerHint: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  drawerButton: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#f4f4f5',
    marginBottom: 8,
  },
  drawerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },

  // Actions sheet (3-dots menu)
  actionsSheet: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
  },
  // Anchored “3-dots” popover (smaller, right-aligned, with a tip).
  actionsPopover: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    // Android shadow
    elevation: 5,
  },
  actionsTipBorder: {
    position: 'absolute',
    top: -9,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#e5e7eb',
  },
  actionsTip: {
    position: 'absolute',
    top: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#fff',
  },
  actionsCompactTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  actionsMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    marginTop: 8,
  },
  actionsMenuItemText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  actionsMenuItemDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
  },
  actionsMenuItemDangerText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#991b1b',
  },
  actionsTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111',
    marginBottom: 8,
  },
  actionsSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
    marginBottom: 12,
  },
  actionsDangerButton: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#fee2e2',
    marginBottom: 10,
  },
  actionsDangerText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#991b1b',
    textAlign: 'center',
  },
})

