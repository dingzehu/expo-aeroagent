import React from 'react'
import { SafeAreaView, StyleSheet } from 'react-native'
import Auth from '../components/Auth'

export default function Login() {
  return (
    <SafeAreaView style={styles.container}>
      <Auth />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})

