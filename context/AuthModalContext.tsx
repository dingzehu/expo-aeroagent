import React, { createContext, useCallback, useContext, useState } from 'react'

type AuthModalContextValue = {
  openAuthModal: () => void
  closeAuthModal: () => void
  authVisible: boolean
}

const AuthModalContext = createContext<AuthModalContextValue>({
  openAuthModal: () => {},
  closeAuthModal: () => {},
  authVisible: false,
})

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [authVisible, setAuthVisible] = useState(false)

  const openAuthModal = useCallback(() => setAuthVisible(true), [])
  const closeAuthModal = useCallback(() => setAuthVisible(false), [])

  return (
    <AuthModalContext.Provider value={{ openAuthModal, closeAuthModal, authVisible }}>
      {children}
    </AuthModalContext.Provider>
  )
}

export function useAuthModal() {
  return useContext(AuthModalContext)
}
