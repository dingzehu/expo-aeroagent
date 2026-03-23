import { Ionicons } from '@expo/vector-icons'
import { Stack, useRouter } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
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

function ShoppingSkeleton() {
  const pulseAnim = useRef(new Animated.Value(0.5)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])
  return (
    <Animated.View style={{ opacity: pulseAnim, paddingTop: 8 }}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={[sk.row]}>
          <View style={sk.checkbox} />
          <View style={{ flex: 1 }}>
            <View style={[sk.box, { height: 14, width: i % 2 === 0 ? '70%' : '55%' }]} />
          </View>
          <View style={[sk.box, { width: 36, height: 22, borderRadius: 6 }]} />
        </View>
      ))}
    </Animated.View>
  )
}

function AddItemSheet({
  onAdd,
  onClose,
}: {
  onAdd: (itemName: string, quantity: string | null) => void
  onClose: () => void
}) {
  const [itemName, setItemName] = useState('')
  const [quantity, setQuantity] = useState('')
  const slideY = useRef(new Animated.Value(400)).current
  const backdropOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, damping: 28, stiffness: 280, useNativeDriver: true }),
    ]).start()
  }, [])

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideY, { toValue: 400, duration: 220, useNativeDriver: true }),
    ]).start(() => onClose())
  }

  const handleAdd = () => {
    const trimmed = itemName.trim()
    if (!trimmed) return
    onAdd(trimmed, quantity.trim() || null)
    handleClose()
  }

  return (
    <Modal transparent animationType="none" onRequestClose={handleClose}>
      <View style={{ flex: 1 }}>
        {/* Visual scrim — no pointer events */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.15)', opacity: backdropOpacity }]}
        />

        {/* Layout + dismiss */}
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'flex-end' }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
        >
          <Pressable style={{ flex: 1 }} onPress={handleClose} />

          <Animated.View style={[ai.sheet, { transform: [{ translateY: slideY }] }]}>
            <View style={ai.handle} />
            <Text style={ai.title}>Add Item</Text>

            <TextInput
              style={ai.input}
              value={itemName}
              onChangeText={setItemName}
              placeholder="What do you need?"
              placeholderTextColor={tokens.colors.textMuted}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={handleAdd}
            />

            <TextInput
              style={[ai.input, ai.inputQty]}
              value={quantity}
              onChangeText={setQuantity}
              placeholder="Quantity (optional) — e.g. 2 boxes"
              placeholderTextColor={tokens.colors.textMuted}
              returnKeyType="done"
              onSubmitEditing={handleAdd}
            />

            <Pressable
              style={[ai.addBtn, !itemName.trim() && ai.addBtnDisabled]}
              onPress={handleAdd}
              disabled={!itemName.trim()}
              {...Platform.select({ web: { cursor: itemName.trim() ? 'pointer' : 'default' } as object, default: {} })}
            >
              <Text style={ai.addBtnText}>Add to List</Text>
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

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
    addShoppingItem,
    toggleShoppingItem: toggleItem,
    deleteShoppingItem: deleteItem,
    updateQuantity,
  } = useAppData()
  const [showBought, setShowBought] = useState(false)
  const [addItemVisible, setAddItemVisible] = useState(false)

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
          <ShoppingSkeleton />
        ) : items.length === 0 ? (
          <View style={s.emptyWrap}>
            <Ionicons name="cart-outline" size={48} color={tokens.colors.border} />
            <Text style={s.emptyTitle}>Shopping list empty</Text>
            <Text style={s.emptySubtitle}>Tap + to add one, or capture by voice</Text>
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

      <Pressable
        style={s.fab}
        onPress={() => setAddItemVisible(true)}
        {...Platform.select({ web: { cursor: 'pointer' } as object, default: {} })}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      {addItemVisible && (
        <AddItemSheet
          onAdd={(name, qty) => addShoppingItem(name, qty)}
          onClose={() => setAddItemVisible(false)}
        />
      )}
    </View>
    </TabSlideWrapper>
  )
}

const rowStyles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    marginHorizontal: 16,
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
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: tokens.colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    ...tokens.shadow.popover,
  },
})

// AddItemSheet styles
const ai = StyleSheet.create({
  sheet: {
    backgroundColor: tokens.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.bold,
    color: tokens.colors.textPrimary,
    marginBottom: 16,
  },
  input: {
    backgroundColor: tokens.colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: tokens.fontSize.base,
    color: tokens.colors.textPrimary,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: tokens.colors.border,
  },
  inputQty: {
    marginBottom: 20,
  },
  addBtn: {
    backgroundColor: tokens.colors.warning,
    borderRadius: tokens.radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addBtnDisabled: {
    opacity: 0.4,
  },
  addBtnText: {
    color: '#fff',
    fontWeight: tokens.fontWeight.bold,
    fontSize: tokens.fontSize.base,
  },
})

// Skeleton styles
const sk = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.colors.surface,
    marginHorizontal: 16,
    marginBottom: 6,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    ...tokens.shadow.card,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: tokens.colors.border,
  },
  box: {
    backgroundColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
  },
})
