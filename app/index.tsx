import { Ionicons } from '@expo/vector-icons'
import type { Session } from '@supabase/supabase-js'
import { Stack, router, useFocusEffect } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Auth, { type AuthMode } from '../components/Auth'
import { GradientHeaderBg } from '../components/GradientHeaderBg'
import ProfileHeader from '../components/ProfileHeader'
import { supabase } from '../lib/supabase'

export default function Index() {
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [authVisible, setAuthVisible] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('signIn')
  const [session, setSession] = useState<Session | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)

  const drawerAnim = useRef(new Animated.Value(0)).current
  const drawerWidth = 340

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user) {
        supabase
          .from('profiles')
          .select('display_name')
          .eq('id', data.session.user.id)
          .single()
          .then(({ data: p }) => { if (p?.display_name) setDisplayName(p.display_name) })
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user) {
        supabase
          .from('profiles')
          .select('display_name')
          .eq('id', nextSession.user.id)
          .single()
          .then(({ data: p }) => { if (p?.display_name) setDisplayName(p.display_name) })
      } else {
        setDisplayName('')
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Re-fetch display name every time this screen comes back into focus
  // (e.g. after navigating back from the Profile screen)
  useFocusEffect(useCallback(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        supabase
          .from('profiles')
          .select('display_name')
          .eq('id', data.session.user.id)
          .single()
          .then(({ data: p }) => { if (p?.display_name) setDisplayName(p.display_name) })
      }
    })
  }, []))

  // Beginner note:
  // - We DO NOT auto-redirect logged-in users anymore.
  // - The user can stay on the main page and choose where to go.

  const headerRight = useMemo(() => {
    const HeaderRight = () => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Account"
        onPress={openDrawer}
        style={{ paddingHorizontal: 12, paddingVertical: 6 }}
      >
        <Ionicons name="person-circle-outline" size={28} color="#fff" />
      </Pressable>
    )
    HeaderRight.displayName = 'HeaderRight'
    return HeaderRight
  }, [openDrawer])

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        headerRight,
        headerTitle: '',
        headerStyle: { backgroundColor: 'transparent' },
        headerBackground: () => <GradientHeaderBg />,
        headerTintColor: '#fff',
      }} />

      {session?.user ? (
        <ProfileHeader
          displayName={displayName}
          onAvatarPress={() => router.push('/profile')}
        />
      ) : (
        <View style={{ height: '33.33%', justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="airplane-outline" size={64} color="#4F46E5" />
        </View>
      )}

      <View style={styles.mainContent}>
        {/* If logged out, show Auth inline as the "entry gate" */}
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

      {/* Full-height slide-in account drawer */}
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
                  style={[styles.menuItem, { marginTop: 16 }]}
                  onPress={async () => {
                    await supabase.auth.signOut()
                    closeDrawer()
                  }}
                >
                  <Text style={styles.menuItemText}>Logout</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.drawerHint}>You are not logged in.</Text>
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    closeDrawer()
                    setAuthMode('signIn')
                    setAuthVisible(true)
                  }}
                >
                  <Text style={styles.menuItemText}>Login</Text>
                </Pressable>
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    closeDrawer()
                    setAuthMode('signUp')
                    setAuthVisible(true)
                  }}
                >
                  <Text style={styles.menuItemText}>Register</Text>
                </Pressable>
              </>
            )}

            <Pressable style={[styles.menuItem, { marginTop: 8 }]} onPress={closeDrawer}>
              <Text style={styles.menuItemText}>Close</Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      ) : null}

      {/* Auth popup */}
      <Modal transparent visible={authVisible} animationType="slide" onRequestClose={() => setAuthVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAuthVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => { }}>
            <Auth mode={authMode} onSuccess={() => setAuthVisible(false)} />
            <Pressable style={[styles.menuItem, { marginTop: 8 }]} onPress={() => setAuthVisible(false)}>
              <Text style={styles.menuItemText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
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
  backdrop: Platform.OS === 'web' ? ({
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 16,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
  } as any) : {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 16,
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-start',
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
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#f4f4f5',
    marginBottom: 8,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
  },
});
