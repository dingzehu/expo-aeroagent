import { Stack, useRouter } from 'expo-router'
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { GradientHeaderBg } from '../components/GradientHeaderBg'
import ProfileEditForm from '../components/ProfileEditForm'

export default function ProfileScreen() {
  const router = useRouter()

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: 'transparent' },
          headerBackground: () => <GradientHeaderBg />,
          headerTintColor: '#fff',
          headerTitleStyle: { color: '#fff' },
        }}
      />
      <ProfileEditForm onDone={() => router.back()} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
})
