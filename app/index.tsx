import { Ionicons } from '@expo/vector-icons'
import type { Session } from '@supabase/supabase-js'
import { Stack, router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Auth from '../components/Auth'
import { supabase } from '../lib/supabase'

export default function Index() {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {!session?.user && (
        <View style={{ height: '33.33%', justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="airplane-outline" size={64} color="#4F46E5" />
        </View>
      )}

      <View style={styles.mainContent}>
        {!session?.user ? (
          <View style={{ width: '100%', maxWidth: 420, marginBottom: 24 }}>
            <Auth mode="signIn" />
          </View>
        ) : (
          <View style={styles.actionsWrapper}>
            <View style={styles.buttonsContainer}>
              <Pressable
                style={styles.button}
                onPress={() => router.push('/thoughts')}
              >
                <Text style={styles.text}>Thoughts</Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.button}
              onPress={() => router.push('/taskManager')}
            >
              <Text style={styles.text}>Open Task Manager</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 0,
  },
  mainContent: {
    flex: 2,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  actionsWrapper: {
    width: '100%',
    alignItems: 'center',
    maxWidth: 420,
  },
  button: {
    backgroundColor: '#4630EB',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    marginBottom: 12,
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 800,
    marginBottom: 12,
  },
  text: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
})
