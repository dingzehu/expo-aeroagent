import { tokens } from '@/constants/tokens'
import { useTabSlide } from '@/context/TabSlideContext'
import React, { useEffect, useRef } from 'react'
import { Animated, Easing, useWindowDimensions } from 'react-native'

type Props = {
  tabIndex: number
  children: React.ReactNode
}

export function TabSlideWrapper({ tabIndex, children }: Props) {
  const { active, prev } = useTabSlide()
  const { width } = useWindowDimensions()
  const slideAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // Skip animation when first mounting with no prior tab (prev === active)
    // or when this is not the incoming screen
    if (prev === active || tabIndex !== active) return

    // Direction: positive = screen is to the right of prev, slide in from right
    const direction = active > prev ? 1 : -1
    slideAnim.setValue(direction * width)

    Animated.timing(slideAnim, {
      toValue: 0,
      duration: tokens.animation.tabSlideDuration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, []) // Run only on mount — context values are captured at mount time

  return (
    <Animated.View style={{ flex: 1, transform: [{ translateX: slideAnim }] }}>
      {children}
    </Animated.View>
  )
}
