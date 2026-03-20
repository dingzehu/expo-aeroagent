import { Ionicons } from '@expo/vector-icons'
import { Stack, useRouter } from 'expo-router'
import React, { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { tokens } from '../constants/tokens'
import { TabSlideWrapper } from '../components/TabSlideWrapper'
import { useAppData, type ShoppingItem } from '../context/AppDataContext'

function SwipeableShoppingRow({
  item,
  onToggle,
  onDelete,
  onQuantitySave,
}: {
  item: ShoppingItem
  onToggle: () => void
  onDelete: () => void
  onQuantitySave: (qty: string) => void
}) {
  const translateX = useRef(new Animated.Value(0)).current
  const [editingQty, setEditingQty] = useState(false)
  const [qtyValue, setQtyValue] = useState(item.quantity ?? '')

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, gs) => Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderMove: (_e, gs) => {
        if (gs.dx < 0) translateX.setValue(Math.max(gs.dx, -100))
      },
      onPanResponderRelease: (_e, gs) => {
        if (gs.dx < -60) {
          Animated.spring(translateX, { toValue: -80, useNativeDriver: true }).start()
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start()
        }
      },
    })
  ).current

  const handleQtyBlur = () => {
    setEditingQty(false)
    const trimmed = qtyValue.trim()
    if (trimmed !== (item.quantity ?? '')) {
      onQuantitySave(trimmed)
    }
  }

  return (
    <View style={rowStyles.wrapper}>
      <View style={rowStyles.deleteZone}>
        <Pressable style={rowStyles.deleteButton} onPress={onDelete}>
          <Ionicons name="trash-outline" size={18} color="#fff" />
        </Pressable>
      </View>

      <Animated.View
        style={[rowStyles.row, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Pressable
          style={[rowStyles.checkbox, item.completed && rowStyles.checkboxDone]}
          onPress={onToggle}
        >
          {item.completed && <Ionicons name="checkmark" size={14} color="#fff" />}
        </Pressable>

        <Text
          style={[rowStyles.itemName, item.completed && rowStyles.itemNameDone]}
          numberOfLines={2}
        >
          {item.item_name}
        </Text>

        {!item.completed && (
          editingQty ? (
            <TextInput
              style={rowStyles.qtyInput}
              value={qtyValue}
              onChangeText={setQtyValue}
              onBlur={handleQtyBlur}
              onSubmitEditing={handleQtyBlur}
              autoFocus
              returnKeyType="done"
              selectTextOnFocus
              placeholder="qty"
              placeholderTextColor={tokens.colors.textMuted}
            />
          ) : (
            <Pressable
              style={rowStyles.qtyBadge}
              onPress={() => { setEditingQty(true); setQtyValue(item.quantity ?? '') }}
            >
              <Text style={rowStyles.qtyText}>{item.quantity || '—'}</Text>
            </Pressable>
          )
        )}
      </Animated.View>
    </View>
  )
}

export default function ShoppingScreen() {
  const router = useRouter()
  const {
    isSignedIn,
    shoppingItems: items,
    shoppingLoading: loading,
    toggleShoppingItem: toggleItem,
    deleteShoppingItem: deleteItem,
    updateQuantity,
  } = useAppData()
  const [showBought, setShowBought] = useState(false)

  const activeItems = items.filter(i => !i.completed)
  const boughtItems = items.filter(i => i.completed)

  if (!isSignedIn) {
    return (
      <TabSlideWrapper tabIndex={1}>
        <View style={s.container}>
          <Stack.Screen options={{ headerShown: false }} />
          <View style={s.emptyWrap}>
            <Text style={s.emptyTitle}>Sign in to see your shopping list</Text>
          </View>
        </View>
      </TabSlideWrapper>
    )
  }

  return (
    <TabSlideWrapper tabIndex={1}>
    <View style={s.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Shopping</Text>
          {activeItems.length > 0 && (
            <View style={s.countPill}>
              <Text style={s.countPillText}>{activeItems.length} items</Text>
            </View>
          )}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={tokens.colors.warning} style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <View style={s.emptyWrap}>
            <Ionicons name="cart-outline" size={48} color={tokens.colors.border} />
            <Text style={s.emptyTitle}>Shopping list empty</Text>
            <Text style={s.emptySubtitle}>Capture items to add them here</Text>
            <Pressable style={s.emptyButton} onPress={() => router.replace('/')}>
              <Ionicons name="flash" size={16} color="#fff" />
              <Text style={s.emptyButtonText}>Go to Capture</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {activeItems.map(item => (
              <SwipeableShoppingRow
                key={item.id}
                item={item}
                onToggle={() => toggleItem(item)}
                onDelete={() => deleteItem(item)}
                onQuantitySave={(q) => updateQuantity(item.id, q)}
              />
            ))}

            {boughtItems.length > 0 && (
              <>
                <Pressable
                  style={s.boughtHeader}
                  onPress={() => setShowBought(p => !p)}
                >
                  <Ionicons
                    name={showBought ? 'chevron-down' : 'chevron-forward'}
                    size={16}
                    color={tokens.colors.textMuted}
                  />
                  <Text style={s.boughtHeaderText}>
                    Bought ({boughtItems.length})
                  </Text>
                </Pressable>

                {showBought && boughtItems.map(item => (
                  <SwipeableShoppingRow
                    key={item.id}
                    item={item}
                    onToggle={() => toggleItem(item)}
                    onDelete={() => deleteItem(item)}
                    onQuantitySave={(q) => updateQuantity(item.id, q)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
    </TabSlideWrapper>
  )
}

const rowStyles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    overflow: 'hidden',
  },
  deleteZone: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.colors.error,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 24,
  },
  deleteButton: {
    padding: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.colors.surface,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    ...tokens.shadow.card,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: {
    backgroundColor: tokens.colors.warning,
    borderColor: tokens.colors.warning,
  },
  itemName: {
    flex: 1,
    fontSize: tokens.fontSize.base,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.textPrimary,
    lineHeight: 20,
  },
  itemNameDone: {
    textDecorationLine: 'line-through',
    color: tokens.colors.textMuted,
  },
  qtyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FEF3C7',
    minWidth: 36,
    alignItems: 'center',
  },
  qtyText: {
    fontSize: tokens.fontSize.xs,
    fontWeight: tokens.fontWeight.bold,
    color: '#92400E',
  },
  qtyInput: {
    fontSize: tokens.fontSize.xs,
    fontWeight: tokens.fontWeight.bold,
    color: tokens.colors.textPrimary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: tokens.colors.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.warning,
    minWidth: 44,
    textAlign: 'center',
  },
})

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.bgShopping,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: tokens.fontSize.h1,
    fontWeight: tokens.fontWeight.extrabold,
    color: tokens.colors.textPrimary,
  },
  headerCount: {
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.textMuted,
  },
  countPill: {
    backgroundColor: '#FEF3C7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countPillText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#92400E',
  },
  boughtHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
    ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
  },
  boughtHeaderText: {
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.textMuted,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.bold,
    color: tokens.colors.textTertiary,
  },
  emptySubtitle: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.textMuted,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tokens.colors.warning,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: tokens.radius.lg,
    marginTop: 12,
    ...Platform.select({ web: { cursor: 'pointer' } as object, default: {} }),
  },
  emptyButtonText: {
    color: '#fff',
    fontWeight: tokens.fontWeight.bold,
    fontSize: tokens.fontSize.base,
  },
})
