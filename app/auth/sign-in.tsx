import { Ionicons } from '@expo/vector-icons'
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

export default function SignInScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Guard: authenticated users should not be here
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/')
    })
  }, [])

  async function handleSignIn() {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.')
      return
    }
    setError(null)
    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setLoading(false)
    if (authError) {
      setError(authError.message)
    } else {
      router.replace('/')
    }
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
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to your AeroAgent account</Text>

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
                placeholder="Password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
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
              onPress={handleSignIn}
              disabled={loading}
              {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>Sign In</Text>
              }
            </Pressable>

            <View style={styles.switchRow}>
              <Text style={styles.switchText}>Don't have an account? </Text>
              <Pressable
                onPress={() => router.replace('/auth/sign-up')}
                {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
              >
                <Text style={styles.switchLink}>Create one</Text>
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
