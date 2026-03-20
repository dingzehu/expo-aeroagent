import { Ionicons } from '@expo/vector-icons'
import * as Linking from 'expo-linking'
import { Stack, useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { tokens } from '../../constants/tokens'

export default function SignUpScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifyNotice, setVerifyNotice] = useState(false)

  // Guard: authenticated users should not be here
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/')
    })
  }, [])

  async function handleSignUp() {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setError(null)
    setLoading(true)

    const emailRedirectTo = Linking.createURL('/auth/confirm')
    const { data: { session, user }, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (user) {
      await supabase.from('profiles').upsert({
        id: user.id,
        display_name: displayName.trim() || 'Aero User',
      })
    }

    setLoading(false)

    if (!session) {
      setVerifyNotice(true)
    } else {
      router.replace('/')
    }
  }

  if (verifyNotice) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.flex, styles.noticeContainer, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.noticeIconWrap}>
            <Ionicons name="mail-outline" size={52} color={tokens.colors.primary} />
          </View>
          <Text style={styles.noticeTitle}>Check your inbox</Text>
          <Text style={styles.noticeBody}>
            We sent a verification link to{'\n'}
            <Text style={styles.noticeEmail}>{email}</Text>
            {'\n\n'}Click the link to activate your account, then sign in.
          </Text>
          <Pressable
            style={[styles.primaryBtn, { width: '100%' }]}
            onPress={() => router.replace('/auth/sign-in')}
            {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
          >
            <Text style={styles.primaryBtnText}>Go to Sign In</Text>
          </Pressable>
        </View>
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.container,
            { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            style={styles.backBtn}
            onPress={() => router.replace('/welcome')}
            {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
          >
            <Ionicons name="chevron-back" size={22} color={tokens.colors.textPrimary} />
            <Text style={styles.backLabel}>Back</Text>
          </Pressable>

          <View style={styles.formWrap}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Your personal Life OS starts here</Text>

            <Text style={styles.label}>Display Name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="How should we call you?"
              autoCapitalize="words"
              autoComplete="name"
              placeholderTextColor={tokens.colors.textMuted}
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="email@address.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholderTextColor={tokens.colors.textMuted}
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="At least 6 characters"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="new-password"
                placeholderTextColor={tokens.colors.textMuted}
              />
              {password.length > 0 && (
                <Pressable
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword(p => !p)}
                  {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color={tokens.colors.textMuted}
                  />
                </Pressable>
              )}
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable
              style={[styles.primaryBtn, loading && styles.btnDisabled]}
              onPress={handleSignUp}
              disabled={loading}
              {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>Create Account</Text>
              }
            </Pressable>

            <View style={styles.switchRow}>
              <Text style={styles.switchText}>Already have an account? </Text>
              <Pressable
                onPress={() => router.replace('/auth/sign-in')}
                {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
              >
                <Text style={styles.switchLink}>Sign in</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: tokens.colors.surface },
  container: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  noticeContainer: {
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  noticeIconWrap: {
    width: 96,
    height: 96,
    borderRadius: tokens.radius.xxl,
    backgroundColor: tokens.colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  noticeTitle: {
    fontSize: tokens.fontSize.h1,
    fontWeight: tokens.fontWeight.extrabold,
    color: tokens.colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  noticeBody: {
    fontSize: tokens.fontSize.base,
    color: tokens.colors.textTertiary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
  },
  noticeEmail: {
    fontWeight: tokens.fontWeight.bold,
    color: tokens.colors.textSecondary,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 8,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  backLabel: {
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.textPrimary,
  },
  formWrap: {
    flex: 1,
    paddingTop: 24,
  },
  title: {
    fontSize: tokens.fontSize.h1,
    fontWeight: tokens.fontWeight.extrabold,
    color: tokens.colors.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: tokens.fontSize.base,
    color: tokens.colors.textTertiary,
    marginBottom: 32,
  },
  label: {
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.xl,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: tokens.fontSize.xl,
    color: tokens.colors.textPrimary,
    backgroundColor: tokens.colors.surfaceAlt,
    marginBottom: 20,
  },
  passwordRow: {
    position: 'relative',
    marginBottom: 20,
  },
  passwordInput: {
    paddingRight: 48,
    marginBottom: 0,
  },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 34,
  },
  errorBox: {
    backgroundColor: tokens.colors.errorBg,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    color: tokens.colors.error,
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.semibold,
  },
  primaryBtn: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.xl,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: {
    color: '#fff',
    fontSize: tokens.fontSize.xl,
    fontWeight: tokens.fontWeight.bold,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  switchText: {
    fontSize: tokens.fontSize.base,
    color: tokens.colors.textTertiary,
  },
  switchLink: {
    fontSize: tokens.fontSize.base,
    fontWeight: tokens.fontWeight.bold,
    color: tokens.colors.primary,
  },
})
