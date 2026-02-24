import type { Session } from '@supabase/supabase-js'
import { Stack, useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { GradientHeaderBg } from '../components/GradientHeaderBg'
import { supabase } from '../lib/supabase'

export default function ProfileScreen() {
  const router = useRouter()
  const { height: screenHeight } = useWindowDimensions()
  const [session, setSession] = useState<Session | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user) {
        fetchProfile(data.session.user.id)
      } else {
        setLoading(false)
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single()

    if (data?.display_name) setDisplayName(data.display_name)
    setLoading(false)
  }

  async function saveProfile() {
    if (!session?.user) return
    const trimmed = displayName.trim()
    if (!trimmed) {
      Alert.alert('Display name cannot be empty.')
      return
    }

    setSaving(true)
    const { error } = await supabase.from('profiles').upsert({
      id: session.user.id,
      display_name: trimmed,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)

    if (error) {
      Alert.alert('Error saving profile', error.message)
    } else {
      // Navigate back immediately — the Realtime subscription on the
      // Thoughts screen will pick up the DB change and update the header live.
      router.back()
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: 'transparent' },
          headerBackground: () => <GradientHeaderBg />,
          headerTintColor: '#fff',
          headerTitleStyle: { color: '#fff' },
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      ) : !session?.user ? (
        <View style={styles.center}>
          <Text style={styles.hint}>Sign in to edit your profile.</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={[
              styles.form,
              // Ensure content is vertically centered on tall mobile screens
              { minHeight: screenHeight * 0.75 }
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.formInner}>
              <Text style={styles.sectionTitle}>Your Profile</Text>
              <Text style={styles.label}>Display Name</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="How should we call you?"
                autoCapitalize="words"
                maxLength={60}
              />
              <Text style={styles.hint}>
                This name appears in your profile header. It can be changed at any time.
              </Text>

              <Pressable
                style={[styles.button, saving && styles.buttonDisabled]}
                onPress={saveProfile}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.buttonText}>Save Changes</Text>
                }
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  form: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  formInner: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
    marginBottom: 28,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 10,
    backgroundColor: '#fafafa',
    fontSize: 17,
    minHeight: 54,
  },
  hint: {
    fontSize: 13,
    color: '#888',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
})
