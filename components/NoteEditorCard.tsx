import { Ionicons, MaterialIcons } from '@expo/vector-icons'
import { Sparkles } from 'lucide-react-native'
import React from 'react'
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { MarkdownView } from './MarkdownView'

interface NoteEditorCardProps {
  previewMarkdown: string
  isPreviewingAI: boolean
  styling: boolean
  aiError: string | null
  copiedFlash: boolean
  skeletonTranslateX: Animated.AnimatedInterpolation<number>
  wordCount: number
  readingTimeMinutes: number
  onBackToDraft: () => void
  onCopyResult: () => void
  cardPadding?: number
  /** Optional debug info shown below AI error (notes.tsx uses this) */
  debugLine?: string | null
}

export function NoteEditorCard({
  previewMarkdown,
  isPreviewingAI,
  styling,
  aiError,
  copiedFlash,
  skeletonTranslateX,
  wordCount,
  readingTimeMinutes,
  onBackToDraft,
  onCopyResult,
  cardPadding,
  debugLine,
}: NoteEditorCardProps) {
  return (
    <>
      <Text style={cardStyles.canvasLabel}>AI STYLED PREVIEW</Text>
      {aiError ? <Text style={cardStyles.aiErrorText}>{aiError}</Text> : null}
      {debugLine ? <Text style={cardStyles.aiDebugText}>{debugLine}</Text> : null}

      <View
        style={[
          cardStyles.card,
          cardPadding != null && { padding: cardPadding },
          isPreviewingAI && cardStyles.cardAiMode,
        ]}
      >
        {isPreviewingAI ? (
          <View style={cardStyles.cardAiTopRow}>
            <View style={cardStyles.aiBadge}>
              <Text style={cardStyles.aiBadgeText}>✨ AI Generated</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to draft"
              onPress={onBackToDraft}
              style={cardStyles.backToDraftButton}
            >
              <MaterialIcons name="undo" size={16} color="#374151" />
              <Text style={cardStyles.backToDraftText}>Back to Draft</Text>
            </Pressable>
          </View>
        ) : null}

        <ScrollView style={cardStyles.cardBody} keyboardShouldPersistTaps="handled">
          {styling ? (
            <View style={cardStyles.skeletonWrap}>
              <View style={cardStyles.skeletonBar} />
              <View style={cardStyles.skeletonBarWide} />
              <View style={cardStyles.skeletonBar} />
              <View style={cardStyles.skeletonBarWide} />
              <Animated.View
                style={[cardStyles.skeletonShimmer, { transform: [{ translateX: skeletonTranslateX }] }]}
              />
            </View>
          ) : !previewMarkdown.trim() ? (
            <View style={cardStyles.previewEmpty}>
              <View style={cardStyles.previewEmptyIcon}>
                <Sparkles size={28} color="#6366F1" />
              </View>
              <Text style={cardStyles.previewEmptyTitle}>Ready to transform</Text>
              <Text style={cardStyles.previewEmptySubtitle}>
                Select a persona above to transform your thoughts.
              </Text>
            </View>
          ) : (
            <MarkdownView markdown={previewMarkdown} />
          )}
        </ScrollView>

        <View style={cardStyles.cardFooterRow}>
          <Text style={cardStyles.cardMetaText}>
            {wordCount ? `${wordCount} words • ${readingTimeMinutes} min read` : '—'}
          </Text>
          <View style={cardStyles.cardActionsRow}>
            <Pressable
              style={[
                cardStyles.copyButton,
                copiedFlash && cardStyles.copyButtonCopied,
                (!previewMarkdown.trim() || styling) && cardStyles.disabled,
              ]}
              onPress={onCopyResult}
              disabled={!previewMarkdown.trim() || styling}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={cardStyles.copyButtonText}>
                {copiedFlash ? 'Copied! ✅' : 'Copy Result'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share (coming soon)"
              disabled
              style={[cardStyles.shareButton, cardStyles.disabled]}
              onPress={() => {}}
            >
              <MaterialIcons name="ios-share" size={18} color="#111827" />
            </Pressable>
          </View>
        </View>
      </View>
    </>
  )
}

export const cardStyles = StyleSheet.create({
  canvasLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#666',
    marginBottom: 10,
    letterSpacing: 0.6,
  },
  card: Platform.select({
    web: {
      flex: 1,
      backgroundColor: '#fff',
      borderRadius: 16,
      padding: 20,
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    },
    default: {
      flex: 1,
      backgroundColor: '#fff',
      borderRadius: 16,
      padding: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 5,
    },
  }) as any,
  cardAiMode: {
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.35)',
  },
  cardAiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  aiBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(99,102,241,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.25)',
  },
  aiBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#4f46e5',
  },
  backToDraftButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  backToDraftText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#374151',
  },
  cardBody: {
    flex: 1,
    marginBottom: 12,
  },
  previewEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  previewEmptyIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(99,102,241,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  previewEmptyTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 6,
  },
  previewEmptySubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textAlign: 'center',
    maxWidth: 320,
  },
  skeletonWrap: {
    position: 'relative',
    overflow: 'hidden',
    paddingVertical: 6,
  },
  skeletonBar: {
    height: 12,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
    marginBottom: 10,
    width: '72%',
  },
  skeletonBarWide: {
    height: 12,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
    marginBottom: 10,
    width: '94%',
  },
  skeletonShimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 120,
    backgroundColor: 'rgba(255,255,255,0.55)',
    opacity: 0.9,
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardMetaText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6b7280',
    flexShrink: 1,
  },
  cardActionsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  copyButton: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 12,
  },
  copyButtonCopied: {
    backgroundColor: '#059669',
  },
  copyButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  shareButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiErrorText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#b91c1c',
    marginBottom: 10,
  },
  aiDebugText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#444',
    marginBottom: 10,
  },
  disabled: {
    opacity: 0.6,
  },
})
