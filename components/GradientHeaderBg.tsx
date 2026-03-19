import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet } from 'react-native'
import { tokens } from '../constants/tokens'

/**
 * Shared gradient background for Stack navigation headers.
 * Matches the ProfileHeader gradient so the header and profile block
 * appear as one continuous visual element.
 *
 * Usage: headerBackground: () => <GradientHeaderBg />
 */
export function GradientHeaderBg() {
  return (
    <LinearGradient
      colors={[tokens.colors.primaryDark, tokens.colors.primaryLight]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
  )
}
