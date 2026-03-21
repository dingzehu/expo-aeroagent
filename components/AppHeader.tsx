import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useGlobalSearchParams, usePathname } from 'expo-router'
import React, { useEffect, useRef } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { tokens } from '../constants/tokens'
import { useAppData } from '../context/AppDataContext'
import { useEntryMenu } from '../context/EntryMenuContext'

const MOOD_COLORS: Record<string, string> = {
  happy: tokens.colors.success, good: tokens.colors.success, great: tokens.colors.success,
  excited: tokens.colors.success, grateful: tokens.colors.success,
  calm: '#6366F1', relaxed: '#6366F1', peaceful: '#6366F1', content: '#6366F1',
  sad: '#3B82F6', tired: '#3B82F6', exhausted: '#3B82F6', lonely: '#3B82F6',
  anxious: '#F59E0B', stressed: '#F59E0B', worried: '#F59E0B', nervous: '#F59E0B',
  angry: tokens.colors.error, frustrated: tokens.colors.error,
  annoyed: tokens.colors.error, irritated: tokens.colors.error,
}
function moodColor(mood: string | null) {
  if (!mood) return tokens.colors.neutral
  return MOOD_COLORS[mood.toLowerCase()] ?? tokens.colors.neutral
}
function formatEntryDate(iso: string) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  )
}

type Props = {
  displayName?: string | null
  email?: string | null
  onMenuPress?: (anchor: { x: number; y: number }) => void
  onAvatarPress?: () => void
  onBack?: () => void
}

export default function AppHeader({
  displayName,
  email,
  onMenuPress,
  onAvatarPress,
  onBack,
}: Props) {
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()
  const pathname = usePathname()
  const params = useGlobalSearchParams<{ id?: string }>()
  const { journalEntries } = useAppData()
  const { openEntryMenu } = useEntryMenu()
  const menuBtnRef = useRef<View>(null)

  const isJournalEntry = pathname === '/journalEntry'

  const currentEntry = isJournalEntry && params.id
    ? journalEntries.find(e => e.id === params.id)
    : undefined

  const profileOpacity = useSharedValue(isJournalEntry ? 0 : 1)
  const entryOpacity = useSharedValue(isJournalEntry ? 1 : 0)

  useEffect(() => {
    profileOpacity.value = withTiming(isJournalEntry ? 0 : 1, { duration: 200 })
    entryOpacity.value = withTiming(isJournalEntry ? 1 : 0, { duration: 200 })
  }, [isJournalEntry])

  const profileAnimStyle = useAnimatedStyle(() => ({ opacity: profileOpacity.value }))
  const entryAnimStyle = useAnimatedStyle(() => ({ opacity: entryOpacity.value }))

  const name = displayName || 'Aero User'
  const initials = name.substring(0, 2).toUpperCase()

  const handleMenuPress = () => {
    menuBtnRef.current?.measureInWindow((x, y, width, height) => {
      onMenuPress?.({ x: x + width / 2, y: y + height / 2 })
    })
  }

  return (
    <View style={[styles.container, { height: screenHeight * 0.15, paddingTop: insets.top }]}>
      <LinearGradient
        colors={[tokens.colors.primaryDark, tokens.colors.primaryLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.circle1} pointerEvents="none" />
      <View style={styles.circle2} pointerEvents="none" />

      {/* ── Profile layer ── */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, styles.profileLayer, { paddingTop: insets.top }, profileAnimStyle]}
      >
        <View style={styles.profileContent} pointerEvents={isJournalEntry ? 'none' : 'auto'}>
          <Pressable
            ref={menuBtnRef}
            onPress={handleMenuPress}
            style={[styles.menuButton, { top: insets.top + 10 }]}
            {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
          >
            <Ionicons name="ellipsis-horizontal" size={28} color="#fff" />
          </Pressable>
          <View style={styles.profileRow}>
            <Pressable
              onPress={onAvatarPress}
              style={styles.avatarWrap}
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
              {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
            >
              <Text style={styles.avatarText}>{initials}</Text>
            </Pressable>
            <View style={styles.profileInfo} pointerEvents="none">
              <Text style={styles.brandText}>Aero Agent</Text>
              <Text style={styles.nameText} numberOfLines={1}>{name}</Text>
              {!!email && <Text style={styles.emailText} numberOfLines={1}>{email}</Text>}
            </View>
          </View>
        </View>
      </Animated.View>

      {/* ── Entry layer ── */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, styles.entryLayer, { paddingTop: insets.top }, entryAnimStyle]}
      >
        <View style={styles.entryContent} pointerEvents={isJournalEntry ? 'auto' : 'none'}>
          <Pressable
            style={[styles.backBtn, { top: insets.top + 8 }]}
            onPress={onBack}
            {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
          >
            <Ionicons name="chevron-back" size={20} color="#fff" />
            <Text style={styles.backLabel}>Journal</Text>
          </Pressable>
          <Pressable
            style={[styles.entryMenuBtn, { top: insets.top + 10 }]}
            onPress={openEntryMenu}
            {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color="rgba(255,255,255,0.8)" />
          </Pressable>
          <View style={styles.entryRow}>
            <View style={styles.entryIconWrap}>
              <Ionicons name="book" size={26} color="#fff" />
            </View>
            <View style={styles.entryInfo}>
              <Text style={styles.entryBrandLabel}>Journal</Text>
              {currentEntry && (
                <>
                  <Text style={styles.entryDateText} numberOfLines={1}>
                    {formatEntryDate(currentEntry.created_at)}
                  </Text>
                  {currentEntry.mood && (
                    <View style={[styles.entryMoodBadge, { backgroundColor: moodColor(currentEntry.mood) }]}>
                      <Text style={styles.entryMoodText}>{currentEntry.mood}</Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: tokens.colors.primaryDark,
    overflow: 'hidden',
    position: 'relative',
  },
  circle1: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.05)', top: -50, right: -50,
  },
  circle2: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.1)', bottom: -30, left: '20%',
  },

  // Profile layer
  profileLayer: { paddingHorizontal: 24, paddingBottom: 20, justifyContent: 'flex-end' },
  profileContent: { flex: 1, justifyContent: 'flex-end' },
  menuButton: { position: 'absolute', right: 0, zIndex: 20, padding: 4 },
  profileRow: { flexDirection: 'row', alignItems: 'flex-end' },
  avatarWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: '#fff' },
  profileInfo: { marginLeft: 20, flex: 1 },
  brandText: {
    fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600',
    letterSpacing: 0.5, marginBottom: 2,
  },
  nameText: { fontSize: 22, color: '#fff', fontWeight: '800', letterSpacing: -0.5, marginBottom: 2 },
  emailText: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '500' },

  // Entry layer
  entryLayer: { paddingHorizontal: 20, paddingBottom: 16, justifyContent: 'flex-end' },
  entryContent: { flex: 1, justifyContent: 'flex-end' },
  backBtn: {
    position: 'absolute', left: 0, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 2,
  },
  backLabel: { color: '#fff', fontSize: tokens.fontSize.lg, fontWeight: tokens.fontWeight.semibold },
  entryMenuBtn: { position: 'absolute', right: 4, zIndex: 20, padding: 4 },
  entryRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 14 },
  entryIconWrap: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center',
  },
  entryInfo: { flex: 1, gap: 3 },
  entryBrandLabel: {
    fontSize: tokens.fontSize.xs, color: 'rgba(255,255,255,0.6)',
    fontWeight: tokens.fontWeight.semibold, letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: 1,
  },
  entryDateText: {
    fontSize: tokens.fontSize.base, color: '#fff',
    fontWeight: tokens.fontWeight.bold, letterSpacing: -0.2,
  },
  entryMoodBadge: {
    alignSelf: 'flex-start', borderRadius: tokens.radius.pill,
    paddingHorizontal: 10, paddingVertical: 3, marginTop: 2,
  },
  entryMoodText: {
    fontSize: tokens.fontSize.xs, fontWeight: tokens.fontWeight.bold,
    color: '#fff', textTransform: 'capitalize',
  },
})
