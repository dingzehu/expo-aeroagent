import React from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { tokens } from '../constants/tokens'

/**
 * MarkdownView
 *
 * Goal: Render markdown on both web and native.
 *
 * Your requirement:
 * - Web: use `react-markdown` (+ `remark-gfm`)
 * - Native: use `react-native-markdown-display`
 *
 * Why this wrapper exists:
 * - If we import both libraries at the top, bundlers sometimes pull the “wrong” one
 *   into the wrong platform build.
 * - So we `require()` inside the platform branch.
 */

export function MarkdownView({ markdown }: { markdown: string }) {
  // Show a gentle empty state instead of rendering nothing.
  if (!markdown.trim()) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Your styled note will appear here…</Text>
      </View>
    )
  }

  /**
   * IMPORTANT:
   * This file is now the *native* implementation.
   * Web uses `MarkdownView.web.tsx`, so we never bundle `react-native-markdown-display` on web.
   */
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Markdown = require('react-native-markdown-display').default as React.ComponentType<any>

  return <Markdown style={nativeMarkdownStyles}>{markdown}</Markdown>
}

const styles = StyleSheet.create({
  empty: {
    paddingVertical: 12,
  },
  emptyText: {
    color: '#777',
    fontSize: 14,
    fontWeight: '600',
  },
  webContainer: {
    // Web markdown will inherit browser fonts; we just add spacing.
    paddingBottom: 12,
  },
})

/**
 * Native markdown styles (react-native-markdown-display expects a style object keyed by markdown token)
 */
const nativeMarkdownStyles = StyleSheet.create({
  body: {
    color: '#111',
    fontSize: 14,
    lineHeight: 20,
  },
  heading1: {
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
  },
  heading2: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 8,
  },
  bullet_list: {
    marginBottom: 8,
  },
  ordered_list: {
    marginBottom: 8,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: tokens.colors.primary,
    paddingLeft: 10,
    color: '#333',
    marginBottom: 8,
  },
  code_block: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    backgroundColor: '#f6f6f7',
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
})

