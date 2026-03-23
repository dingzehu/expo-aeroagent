import { AppDataProvider } from '../context/AppDataContext'
import ProfileEditForm from '../components/ProfileEditForm'
import AppHeader from '../components/AppHeader'
import { AuthModalProvider, useAuthModal } from '../context/AuthModalContext'
import { EntryMenuProvider } from '../context/EntryMenuContext'
import { TabSlideProvider, useTabSlide } from '../context/TabSlideContext'
import { supabase } from '../lib/supabase'
import { tokens } from '../constants/tokens'
import type { Session } from '@supabase/supabase-js'
import { Ionicons } from '@expo/vector-icons'
import { Stack, usePathname, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import ReAnimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function RootLayout() {
  return (
    <AppDataProvider>
      <TabSlideProvider>
        <AuthModalProvider>
          <EntryMenuProvider>
            <RootLayoutInner />
          </EntryMenuProvider>
        </AuthModalProvider>
      </TabSlideProvider>
    </AppDataProvider>
  )
}

type TabItemConfig = {
  route: string
  labelOff: React.ComponentProps<typeof Ionicons>['name']
  labelOn: React.ComponentProps<typeof Ionicons>['name']
  label: string
  size: number
  activeColor: string
}

function TabItem({ tab, active, onPress }: { tab: TabItemConfig; active: boolean; onPress: () => void }) {
  const scaleAnim = useRef(new Animated.Value(active ? 1.28 : 1.0)).current
  const labelOpacity = useRef(new Animated.Value(active ? 1 : 0)).current

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: active ? 1.28 : 1.0,
      friction: 8,
      tension: 80,
      useNativeDriver: true,
    }).start()

    Animated.timing(labelOpacity, {
      toValue: active ? 1 : 0,
      duration: active ? 200 : 150,
      delay: active ? 50 : 0,
      useNativeDriver: true,
    }).start()
  }, [active])

  return (
    <Pressable
      style={tabStyles.tabItem}
      onPress={onPress}
      {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
    >
      <Animated.View style={{ alignItems: 'center', transform: [{ scale: scaleAnim }] }}>
        <Ionicons
          name={active ? tab.labelOn : tab.labelOff}
          size={tab.size}
          color={active ? tab.activeColor : tokens.colors.textMuted}
        />
        <Animated.Text style={[tabStyles.tabLabel, { opacity: labelOpacity, height: 11 }]}>
          {tab.label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  )
}

const tabStyles = StyleSheet.create({
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: tokens.colors.textMuted,
    marginTop: 3,
    textAlign: 'center',
  },
})

function RootLayoutInner() {
  const [session, setSession] = useState<Session | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [profileModalVisible, setProfileModalVisible] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<number | null>(null)
  const { height: screenHeight } = useWindowDimensions()
  const pathname = usePathname()
  const router = useRouter()
  const insets = useSafeAreaInsets()

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
      setSessionLoading(false)
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

  // Single source of truth for auth routing
  useEffect(() => {
    if (sessionLoading) return
    const isAuthRoute = pathname === '/welcome' || pathname.startsWith('/auth/')
    if (!session && !isAuthRoute) {
      router.replace('/welcome')
    } else if (session && isAuthRoute) {
      router.replace('/')
    }
  }, [session, sessionLoading, pathname])

  // Re-fetch displayName when navigating back from any screen (e.g. profile edit)
  useEffect(() => {
    if (session?.user && TAB_ROUTES.includes(pathname)) {
      fetchDisplayName(session.user.id)
    }
  }, [pathname, session?.user?.id, fetchDisplayName])

  const TAB_ROUTES = ['/', '/tasks', '/shopping', '/journal', '/thoughts']
  const showHeader = !!session?.user && (
    pathname === '/' || pathname === '/thoughts' || pathname === '/notes' ||
    pathname === '/tasks' || pathname === '/shopping' ||
    pathname === '/journal' || pathname === '/journalEntry'
  )
  const showTabs = !!session?.user && TAB_ROUTES.includes(pathname)

  const { setTab } = useTabSlide()

  // Tab bar slide-out animation
  const tabAnim = useSharedValue(showTabs ? 1 : 0)
  useEffect(() => {
    tabAnim.value = withTiming(showTabs ? 1 : 0, { duration: 220 })
  }, [showTabs])
  const tabAnimStyle = useAnimatedStyle(() => ({
    opacity: tabAnim.value,
    transform: [{ translateY: (1 - tabAnim.value) * 60 }],
  }))

  const TAB_ITEMS: TabItemConfig[] = [
    { route: '/tasks',    labelOff: 'checkmark-circle-outline', labelOn: 'checkmark-circle', label: 'Tasks',    size: 22, activeColor: tokens.colors.primary },
    { route: '/shopping', labelOff: 'cart-outline',             labelOn: 'cart',             label: 'Shopping', size: 22, activeColor: tokens.colors.warning },
    { route: '/',         labelOff: 'flash-outline',            labelOn: 'flash',            label: 'Capture',  size: 26, activeColor: tokens.colors.primary },
    { route: '/journal',  labelOff: 'book-outline',             labelOn: 'book',             label: 'Journal',  size: 22, activeColor: tokens.colors.success },
    { route: '/thoughts', labelOff: 'bulb-outline',             labelOn: 'bulb',             label: 'Thoughts', size: 22, activeColor: tokens.colors.violet },
  ]

  if (sessionLoading) {
    return <View style={{ flex: 1, backgroundColor: '#fff' }} />
  }

  return (
    <View style={styles.root}>
      {showHeader && (
        <AppHeader
          displayName={displayName}
          email={session!.user.email}
          onMenuPress={(bottomY) => setMenuAnchor(bottomY)}
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
        <Stack.Screen name="index"    options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="tasks"    options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="shopping" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="journal"  options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="journalEntry" options={{ headerShown: false, animation: 'slide_from_bottom', gestureDirection: 'vertical' }} />
        <Stack.Screen name="welcome"      options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="auth/sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="auth/sign-up" options={{ headerShown: false }} />
        <Stack.Screen name="notes" options={{ headerTitle: 'Studio', headerBackVisible: false }} />
        <Stack.Screen name="thoughts" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="taskManager" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="profile" options={{ headerTitle: 'Edit Profile', animation: 'slide_from_bottom' }} />
      </Stack>

      {/* Account popover */}
      <Modal
        transparent
        visible={!!menuAnchor}
        animationType="fade"
        onRequestClose={() => setMenuAnchor(null)}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setMenuAnchor(null)} />
        {!!menuAnchor && (
          <View style={[styles.popover, { top: (menuAnchor ?? 0) + 6, right: 16, width: 180 }]}>
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
        )}
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

      {/* Bottom tab bar */}
      {!!session?.user && (
        <ReAnimated.View
          style={[styles.tabBar, { paddingBottom: insets.bottom || 8 }, tabAnimStyle]}
          pointerEvents={showTabs ? 'auto' : 'none'}
        >
          {TAB_ITEMS.map((tab, index) => {
            const active = pathname === tab.route
            return (
              <TabItem
                key={tab.route}
                tab={tab}
                active={active}
                onPress={() => {
                  setTab(index)
                  router.replace(tab.route as any)
                }}
              />
            )
          })}
        </ReAnimated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: tokens.colors.surface,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
    ...Platform.select({ web: { boxShadow: '0 -1px 0 #E5E7EB' } as object, default: {} }),
  },
})
