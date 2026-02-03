import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

/**
 * MarkdownView (WEB)
 *
 * Web renderer requirement:
 * - react-markdown + remark-gfm
 *
 * Why this file exists:
 * - Expo/Metro chooses `*.web.tsx` automatically for web builds.
 * - This prevents web from importing/bundling `react-native-markdown-display`,
 *   which can cause bundler resolution issues on web.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReactMarkdown = require('react-markdown').default as React.ComponentType<any>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const remarkGfm = require('remark-gfm').default as any

export function MarkdownView({ markdown }: { markdown: string }) {
  if (!markdown.trim()) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Your styled note will appear here…</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 12,
  },
  empty: {
    paddingVertical: 12,
  },
  emptyText: {
    color: '#777',
    fontSize: 14,
    fontWeight: '600',
  },
})

