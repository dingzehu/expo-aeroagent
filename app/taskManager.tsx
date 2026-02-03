import React, { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { supabase } from '../lib/supabase'

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
      <Text style={styles.title}>Task Manager</Text>

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
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    backgroundColor: '#fff',
  },
  multiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#4630EB',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
})