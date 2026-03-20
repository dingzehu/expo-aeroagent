import React, { createContext, useCallback, useContext, useState } from 'react'

type TabSlideState = {
  active: number
  prev: number
}

type TabSlideContextValue = TabSlideState & {
  setTab: (index: number) => void
}

const TabSlideContext = createContext<TabSlideContextValue>({
  active: 2,   // Capture is the default tab (index 2)
  prev: 2,
  setTab: () => {},
})

export function TabSlideProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TabSlideState>({ active: 2, prev: 2 })

  const setTab = useCallback((newIndex: number) => {
    setState(cur => ({ active: newIndex, prev: cur.active }))
  }, [])

  return (
    <TabSlideContext.Provider value={{ ...state, setTab }}>
      {children}
    </TabSlideContext.Provider>
  )
}

export function useTabSlide() {
  return useContext(TabSlideContext)
}
