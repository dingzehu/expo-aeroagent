import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import React from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

interface PersonaPillProps {
  label: string
  help: string
  active: boolean
  disabled?: boolean
  onPress: () => void
}

export function PersonaPill({ label, help, active, disabled, onPress }: PersonaPillProps) {
  return (
    <Pressable
      {...(Platform.OS === 'web' ? ({ title: `${label}: ${help}` } as any) : null)}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={[pillStyles.base, active && pillStyles.activeGlass, disabled && pillStyles.disabled]}
    >
      {active ? (
        <LinearGradient
          colors={['#818CF8', '#6366F1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : Platform.OS === 'web' ? (
        <View style={[StyleSheet.absoluteFill, pillStyles.glassFallback]} />
      ) : (
        <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} />
      )}

      <View style={pillStyles.inner}>
        <Text style={[pillStyles.text, active && pillStyles.textActive]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

export const pillStyles = StyleSheet.create({
  base: {
    borderRadius: 50,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  glassFallback: {
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  inner: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeGlass: Platform.select({
    web: {
      boxShadow: '0 6px 14px rgba(129, 140, 248, 0.28)',
    },
    default: {
      shadowColor: '#818CF8',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 14,
      elevation: 8,
    },
  }) as any,
  text: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
  },
  textActive: {
    color: '#fff',
  },
  disabled: {
    opacity: 0.6,
  },
})
