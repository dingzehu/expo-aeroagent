import { router } from 'expo-router'
import React, { useEffect, useMemo, useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { supabase } from '../../lib/supabase'

function parseHashParams(hash: string): Record<string, string> {
  const clean = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(clean)
  const out: Record<string, string> = {}
  params.forEach((value, key) => {
    out[key] = value
  })
  return out
}

async function upsertProfileIfPossible(userId: string, email: string | null | undefined) {
  if (!email) return
  // This requires you to have a `profiles` table in Supabase.
  // If it doesn't exist (or RLS blocks it), we simply ignore the error.
  const { error } = await supabase.from('profiles').upsert({ id: userId, email })
  if (error) {
    // Keep app usable even if the table isn't configured yet.
    console.warn('[profiles upsert skipped]', error.message)
  }
}

export default function Confirm() {
  const [secondsLeft, setSecondsLeft] = useState(10)
  const [email, setEmail] = useState<string | null>(null)

  const hashParams = useMemo(() => {
    if (typeof window === 'undefined') return {}
    return parseHashParams(window.location.hash ?? '')
  }, [])

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        // Supabase may redirect back with either:
        // - `?code=...` (PKCE flow), OR
        // - `#access_token=...&refresh_token=...` (implicit flow)
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          const code = url.searchParams.get('code')
          const accessToken = url.searchParams.get('access_token') ?? hashParams['access_token']
          const refreshToken = url.searchParams.get('refresh_token') ?? hashParams['refresh_token']

          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code)
            if (error) throw error
          } else if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })
            if (error) throw error
          }
        }

        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!cancelled) {
          setEmail(user?.email ?? null)
        }

        if (user) {
          await upsertProfileIfPossible(user.id, user.email)
        }
      } catch (e: any) {
        Alert.alert('Confirmation error', e?.message ?? 'Unknown error')
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [hashParams])

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) return 0
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (secondsLeft === 0) {
      router.replace('/')
    }
  }, [secondsLeft])

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Register successfull!</Text>
      <Text style={styles.subtitle}>You will be automatically redirected to Aero Agent in {secondsLeft} seconds</Text>
      {email ? <Text style={styles.email}>Signed in as: {email}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#333',
  },
  email: {
    marginTop: 12,
    fontSize: 14,
    color: '#111',
    fontWeight: '600',
  },
})

