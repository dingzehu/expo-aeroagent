import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'
import 'react-native-url-polyfill/auto'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}

function createMemoryStorage(): StorageAdapter {
  const store = new Map<string, string>()
  return {
    getItem: async (key) => (store.has(key) ? store.get(key)! : null),
    setItem: async (key, value) => {
      store.set(key, value)
    },
    removeItem: async (key) => {
      store.delete(key)
    },
  }
}

function createWebStorage(): StorageAdapter {
  // Expo Router can render routes in Node for web (no `window`), so fall back to memory storage.
  if (typeof window === 'undefined' || !window.localStorage) {
    return createMemoryStorage()
  }

  return {
    getItem: async (key) => window.localStorage.getItem(key),
    setItem: async (key, value) => {
      window.localStorage.setItem(key, value)
    },
    removeItem: async (key) => {
      window.localStorage.removeItem(key)
    },
  }
}

function getAuthStorage(): StorageAdapter {
  if (Platform.OS === 'web') return createWebStorage()

  // Avoid importing AsyncStorage in web/Node (it references `window`).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-async-storage/async-storage').default as StorageAdapter
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getAuthStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})