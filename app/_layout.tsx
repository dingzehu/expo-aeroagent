import Auth, { type AuthMode } from '../components/Auth'
import ProfileEditForm from '../components/ProfileEditForm'
import ProfileHeader from '../components/ProfileHeader'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { Stack, usePathname, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  /* drawer state — kept but disabled in favour of popover
  const [drawerVisible, setDrawerVisible] = useState(false)
  const drawerAnim = useRef(new Animated.Value(0)).current
  const drawerWidth = 340
  */
  const [authVisible, setAuthVisible] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('signIn')
  const [profileModalVisible, setProfileModalVisible] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null)
  const { height: screenHeight } = useWindowDimensions()
  const pathname = usePathname()
  const router = useRouter()

  const fetchDisplayName = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single()
    if (data?.display_name !== undefined) setDisplayName(data.display_name)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user) fetchDisplayName(data.session.user.id)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user) {
        fetchDisplayName(nextSession.user.id)
      } else {
        setDisplayName(null)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [fetchDisplayName])

  // Re-fetch displayName when navigating back from any screen (e.g. profile edit)
  useEffect(() => {
    if (session?.user && (pathname === '/' || pathname === '/thoughts')) {
      fetchDisplayName(session.user.id)
    }
  }, [pathname, session?.user?.id, fetchDisplayName])

  /* drawer callbacks — kept but disabled in favour of popover
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
  */

  const showHeader = !!session?.user && (pathname === '/' || pathname === '/thoughts' || pathname === '/notes')

  return (
    <View style={styles.root}>
      {showHeader && (
        <ProfileHeader
          displayName={displayName}
          email={session!.user.email}
          showMenu={pathname === '/' || pathname === '/thoughts' || pathname === '/notes'}
          onMenuPress={(anchor) => setMenuAnchor(anchor)}
          showBack={pathname === '/thoughts' || pathname === '/notes'}
          onBackPress={() => router.back()}
          onAvatarPress={() => router.push('/profile')}
        />
      )}

      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#fff' },
          headerShadowVisible: false,
          headerTitleStyle: { fontSize: 18, fontWeight: 'bold' },
          headerTitleAlign: 'center',
          contentStyle: { backgroundColor: '#fff' },
          animation: 'slide_from_right',
          headerBackVisible: true,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerTitle: 'Login' }} />
        <Stack.Screen name="notes" options={{ headerTitle: 'Studio', headerBackVisible: false }} />
        <Stack.Screen name="thoughts" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerTitle: 'Edit Profile' }} />
      </Stack>

      {/* Account drawer — kept but disabled in favour of popover
      {drawerVisible && (
        <Pressable style={styles.drawerBackdrop} onPress={closeDrawer}>
          <Animated.View
            style={[
              styles.drawer,
              {
                width: drawerWidth,
                transform: [{
                  translateX: drawerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [drawerWidth, 0],
                  }),
                }],
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
                  onPress={() => { closeDrawer(); setProfileModalVisible(true) }}
                >
                  <Text style={styles.menuItemText}>Edit profile</Text>
                </Pressable>
                <Pressable
                  style={styles.menuItem}
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
      )}
      */}

      {/* Account popover */}
      <Modal
        transparent
        visible={!!menuAnchor}
        animationType="fade"
        onRequestClose={() => setMenuAnchor(null)}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setMenuAnchor(null)} />
        {!!menuAnchor && (() => {
          const POPOVER_W = 180
          const left = Math.max(menuAnchor.x - POPOVER_W + 14, 8)
          const top = menuAnchor.y + 16
          return (
            <View style={[styles.popover, { left, top, width: POPOVER_W }]}>
              <Pressable
                style={styles.popoverItem}
                onPress={() => { setMenuAnchor(null); setProfileModalVisible(true) }}
              >
                <Text style={styles.popoverItemText}>Edit profile</Text>
              </Pressable>
              <View style={styles.popoverDivider} />
              <Pressable
                style={styles.popoverItem}
                onPress={async () => { setMenuAnchor(null); await supabase.auth.signOut() }}
              >
                <Text style={[styles.popoverItemText, { color: '#dc2626' }]}>Log Out</Text>
              </Pressable>
            </View>
          )
        })()}
      </Modal>

      {/* Auth popup triggered from drawer */}
      <Modal
        transparent
        visible={authVisible}
        animationType="slide"
        onRequestClose={() => setAuthVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setAuthVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Auth mode={authMode} onSuccess={() => setAuthVisible(false)} />
            <Pressable
              style={[styles.menuItem, { marginTop: 8 }]}
              onPress={() => setAuthVisible(false)}
            >
              <Text style={styles.menuItemText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit profile bottom sheet */}
      <Modal
        transparent
        visible={profileModalVisible}
        animationType="slide"
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <Pressable style={styles.bottomSheetBackdrop} onPress={() => setProfileModalVisible(false)}>
          <Pressable style={[styles.bottomSheet, { height: screenHeight * 0.6 }]} onPress={() => {}}>
            <View style={styles.bottomSheetHandle} />
            <ProfileEditForm
              onDone={() => {
                setProfileModalVisible(false)
                if (session?.user) fetchDisplayName(session.user.id)
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
  bottomSheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginBottom: 4,
  },
  popover: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#eee',
    overflow: 'hidden',
  },
  popoverItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  popoverItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  popoverDivider: {
    height: 1,
    backgroundColor: '#eee',
    marginHorizontal: 8,
  },
})
