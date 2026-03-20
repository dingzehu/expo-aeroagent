import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { useEffect } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { tokens } from '../constants/tokens'

export default function WelcomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  // Guard: authenticated users must not land here
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/')
    })
  }, [])

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 32 }]}>
      <View style={styles.hero}>
        <View style={styles.iconWrap}>
          <Ionicons name="flash" size={52} color={tokens.colors.primary} />
        </View>
        <Text style={styles.appName}>AeroAgent</Text>
        <Text style={styles.tagline}>Capture thoughts, tasks & ideas — instantly.</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => router.push('/auth/sign-in')}
          {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
        >
          <Text style={styles.primaryBtnText}>Sign In</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => router.push('/auth/sign-up')}
          {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
        >
          <Text style={styles.secondaryBtnText}>Create Account</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.surface,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: tokens.radius.xxl,
    backgroundColor: tokens.colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  appName: {
    fontSize: 36,
    fontWeight: tokens.fontWeight.black,
    color: tokens.colors.textPrimary,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: tokens.fontSize.lg,
    color: tokens.colors.textTertiary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  actions: {
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.xl,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: tokens.fontSize.xl,
    fontWeight: tokens.fontWeight.bold,
  },
  secondaryBtn: {
    borderWidth: 1.5,
    borderColor: tokens.colors.primary,
    borderRadius: tokens.radius.xl,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: tokens.colors.surface,
  },
  secondaryBtnText: {
    color: tokens.colors.primary,
    fontSize: tokens.fontSize.xl,
    fontWeight: tokens.fontWeight.bold,
  },
})
