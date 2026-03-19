import React, { useState } from 'react'
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { supabase } from '../lib/supabase'
import { tokens } from '../constants/tokens'

type NewTask = {
  title: string
  description: string
}

export default function TaskManager() {
  const [newTask, setNewTask] = useState<NewTask>({ title: '', description: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    const title = newTask.title.trim()
    const description = newTask.description.trim()

    if (!title) {
      Alert.alert('Missing title', 'Please enter a task title.')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.from('tasks').insert({ title, description })
      if (error) {
        Alert.alert('Error adding task', error.message)
        return
      }

      setNewTask({ title: '', description: '' })
      Alert.alert('Saved', 'Task added.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Task Manager</Text>
        <Text style={styles.subtitle}>Saved tasks appear in your Captures.</Text>

        <Text style={styles.label}>Task Title</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Buy groceries"
          value={newTask.title}
          onChangeText={(text: string) => setNewTask((prev) => ({ ...prev, title: text }))}
          autoCapitalize="sentences"
        />

        <Text style={styles.label}>Task Description</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Optional details…"
          value={newTask.description}
          onChangeText={(text: string) => setNewTask((prev) => ({ ...prev, description: text }))}
          multiline
        />

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Add Task</Text>}
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.surfaceAlt,
    padding: tokens.space[4],
  },
  card: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.xxl,
    padding: tokens.space[4],
    ...tokens.shadow.card,
  },
  title: {
    fontSize: tokens.fontSize.h1,
    fontWeight: tokens.fontWeight.bold,
    color: tokens.colors.textPrimary,
    marginBottom: tokens.space[1],
  },
  subtitle: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.textTertiary,
    marginBottom: tokens.space[4],
  },
  label: {
    fontSize: tokens.fontSize.base,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: tokens.colors.borderStrong,
    borderRadius: tokens.radius.xl,
    paddingHorizontal: tokens.space[3],
    paddingVertical: 10,
    marginBottom: 14,
    backgroundColor: tokens.colors.surface,
    fontSize: tokens.fontSize.xl,
    color: tokens.colors.textPrimary,
  },
  multiline: {
    minHeight: 90,
    maxHeight: 160,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.xl,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: tokens.space[2],
    ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: tokens.colors.surface,
    fontSize: tokens.fontSize.xl,
    fontWeight: tokens.fontWeight.bold,
  },
})
