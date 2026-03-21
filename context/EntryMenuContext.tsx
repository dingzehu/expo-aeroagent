import React, { createContext, useCallback, useContext, useRef } from 'react'

type EntryMenuContextValue = {
  registerOpenMenu: (cb: () => void) => void
  openEntryMenu: () => void
}

const EntryMenuContext = createContext<EntryMenuContextValue>({
  registerOpenMenu: () => {},
  openEntryMenu: () => {},
})

export function EntryMenuProvider({ children }: { children: React.ReactNode }) {
  const callbackRef = useRef<(() => void) | null>(null)
  const registerOpenMenu = useCallback((cb: () => void) => {
    callbackRef.current = cb
  }, [])
  const openEntryMenu = useCallback(() => {
    callbackRef.current?.()
  }, [])
  return (
    <EntryMenuContext.Provider value={{ registerOpenMenu, openEntryMenu }}>
      {children}
    </EntryMenuContext.Provider>
  )
}

export function useEntryMenu() {
  return useContext(EntryMenuContext)
}
