import { memo, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { palette } from '../../../constants/colors';

type ReminderSelectionBarProps = {
  selectedCount: number;
  allSelected: boolean;
  busy: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  onToggleAll: () => void;
  onDelete: () => void;
};

const SELECTION_BAR_SPRING = {
  damping: 32,
  stiffness: 280,
  mass: 0.9,
  overshootClamping: true,
} as const;

export const ReminderSelectionBar = memo(function ReminderSelectionBar({
  selectedCount,
  allSelected,
  busy,
  compact,
  style,
  onToggleAll,
  onDelete,
}: ReminderSelectionBarProps) {
  const reduceMotion = useReducedMotion();
  const revealProgress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    revealProgress.value = reduceMotion ? 1 : withSpring(1, SELECTION_BAR_SPRING);
  }, [reduceMotion, revealProgress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: revealProgress.value,
    transform: [
      { translateY: (1 - revealProgress.value) * 10 },
      { scale: 0.98 + revealProgress.value * 0.02 },
    ],
  }));

  return (
    <Animated.View
      style={[styles.container, compact ? styles.containerCompact : null, style, animatedStyle]}
    >
      <View style={[styles.selectionCount, compact ? styles.selectionCountCompact : null]}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          style={styles.selectionCountText}
        >
          {selectedCount}件選択中
        </Text>
      </View>

      <View style={[styles.actionGroup, compact ? styles.actionGroupCompact : null]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={allSelected ? '選択解除' : 'すべて選択'}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          android_ripple={{ color: 'rgba(122,92,255,0.14)' }}
          hitSlop={4}
          onPress={onToggleAll}
          pressRetentionOffset={12}
          style={({ pressed }) => [
            styles.action,
            styles.toggleAction,
            compact ? styles.toggleActionCompact : null,
            pressed ? styles.actionPressed : null,
            busy ? styles.actionDisabled : null,
          ]}
        >
          <Text numberOfLines={1} style={styles.toggleLabel}>
            {allSelected ? '選択解除' : 'すべて選択'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy ? `${selectedCount}件を削除中` : `${selectedCount}件を削除`}
          accessibilityHint="削除確認を開きます"
          accessibilityState={{ disabled: selectedCount === 0 || busy }}
          disabled={selectedCount === 0 || busy}
          android_ripple={{ color: 'rgba(248,113,113,0.22)' }}
          hitSlop={4}
          onPress={onDelete}
          pressRetentionOffset={12}
          style={({ pressed }) => [
            styles.action,
            styles.deleteAction,
            pressed ? styles.actionPressed : null,
            selectedCount === 0 || busy ? styles.actionDisabled : null,
          ]}
        >
          <View style={styles.deleteIconSlot}>
            {busy ? (
              <ActivityIndicator size="small" color={palette.dangerText} />
            ) : (
              <Ionicons name="trash-outline" size={22} color={palette.dangerText} />
            )}
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  containerCompact: {
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  selectionCount: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 6,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  selectionCountCompact: {
    paddingHorizontal: 4,
  },
  selectionCountText: {
    color: palette.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'left',
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 8,
  },
  actionGroupCompact: {
    gap: 8,
  },
  action: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  toggleAction: {
    minWidth: 92,
    borderWidth: 1,
    borderColor: 'rgba(121,87,213,0.22)',
    backgroundColor: palette.lavender,
  },
  toggleActionCompact: {
    minWidth: 84,
    paddingHorizontal: 10,
  },
  deleteAction: {
    width: 48,
    height: 48,
    paddingHorizontal: 0,
    borderWidth: 1,
    borderColor: 'rgba(180,52,68,0.45)',
    backgroundColor: palette.dangerSoft,
  },
  deleteIconSlot: {
    width: 28,
    height: 28,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.96 }],
  },
  actionDisabled: {
    opacity: 0.42,
  },
  toggleLabel: {
    color: palette.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
});
