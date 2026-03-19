import { Ionicons } from '@expo/vector-icons'
import * as Linking from 'expo-linking'
import React, { useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    AppState,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { tokens } from '../constants/tokens'

export type AuthMode = 'signIn' | 'signUp'

type AuthProps = {
  mode?: AuthMode
  onSuccess?: () => void
}

export default function Auth({ mode = 'signIn', onSuccess }: AuthProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Tells Supabase Auth to continuously refresh the session automatically if
  // the app is in the foreground. This should only be registered once per mounted component.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh()
      } else {
        supabase.auth.stopAutoRefresh()
      }
    })
    return () => sub.remove()
  }, [])

  async function signInWithEmail() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    })

    if (error) Alert.alert(error.message)
    else onSuccess?.()
    setLoading(false)
  }

  async function signUpWithEmail() {
    setLoading(true)
    const emailRedirectTo = Linking.createURL('/auth/confirm')
    const {
      data: { session, user },
      error,
    } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: { emailRedirectTo },
    })

    if (error) {
      Alert.alert(error.message)
      setLoading(false)
      return
    }

    // Create the user's profile with their chosen display name
    if (user) {
      await supabase.from('profiles').upsert({
        id: user.id,
        display_name: displayName.trim() || 'Aero User',
      })
    }

    onSuccess?.()
    if (!session) Alert.alert('Please check your inbox for email verification!')
    setLoading(false)
  }

  const submit = mode === 'signIn' ? signInWithEmail : signUpWithEmail
  const title = mode === 'signIn' ? 'Login' : 'Register'
  const submitLabel = mode === 'signIn' ? 'Sign in' : 'Sign up'

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      {/* Display Name — only shown during registration */}
      {mode === 'signUp' && (
        <>
          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            onChangeText={(text: string) => setDisplayName(text)}
            value={displayName}
            placeholder="How should we call you?"
            autoCapitalize="words"
          />
        </>
      )}

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        onChangeText={(text: string) => setEmail(text)}
        value={email}
        placeholder="email@address.com"
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <Text style={styles.label}>Password</Text>
      {/*
        Password input with "eye" icon:
        - `secureTextEntry` hides the password when showPassword is false
        - Tapping the eye toggles show/hide
        - We add right padding so the text doesn't go under the icon
      */}
      <View style={styles.passwordRow}>
        <TextInput
          style={[styles.input, styles.passwordInput]}
          onChangeText={(text: string) => setPassword(text)}
          value={password}
          secureTextEntry={!showPassword}
          placeholder="Password"
          autoCapitalize="none"
        />
        {/* Only show the eye icon once the user typed something */}
        {password.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            style={styles.eyeButton}
            onPress={() => setShowPassword((prev) => !prev)}
          >
            <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#444" />
          </Pressable>
        ) : null}
      </View>

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled, styles.mt20]}
        disabled={loading}
        onPress={submit}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{submitLabel}</Text>}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginTop: 40,
    padding: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    backgroundColor: '#fff',
  },
  // Wraps the password input + the eye icon.
  passwordRow: {
    position: 'relative',
    marginBottom: 14,
  },
  // Extra right padding so text never sits under the icon.
  passwordInput: {
    paddingRight: 44,
    marginBottom: 0,
  },
  eyeButton: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 34,
    ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
  },
  button: {
    backgroundColor: tokens.colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
    ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  verticallySpaced: {
    paddingTop: 4,
    paddingBottom: 4,
    alignSelf: 'stretch',
  },
  mt20: {
    marginTop: 20,
  },
})
