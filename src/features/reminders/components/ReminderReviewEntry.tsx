import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { palette } from '../../../constants/colors';
import { REMINDER_BUBBLE_PRESS_SPRING } from './reminderBubblePressMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  kind: 'past' | 'departed';
  count: number;
  preview?: string;
  disabled?: boolean;
  onPress: () => void;
};

export function ReminderReviewEntry({ kind, count, preview, disabled = false, onPress }: Props) {
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - pressed.value * 0.12,
    transform: [{ scale: 1 - pressed.value * 0.015 }],
  }));
  const departed = kind === 'departed';
  const title = departed ? '空へかえった泡' : '過ぎた予定';
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${title}、${count}件を開く`}
      accessibilityHint={
        departed ? '自動整理された予定の内容を確認します' : '残している泡を別の一覧で開きます'
      }
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        if (!disabled)
          pressed.value = reduceMotion ? 1 : withSpring(1, REMINDER_BUBBLE_PRESS_SPRING);
      }}
      onPressOut={() => {
        pressed.value = reduceMotion ? 0 : withSpring(0, REMINDER_BUBBLE_PRESS_SPRING);
      }}
      style={[
        styles.entry,
        departed ? styles.departed : styles.past,
        animatedStyle,
        disabled ? styles.disabled : null,
      ]}
    >
      <View style={styles.symbol}>
        <Ionicons
          name={departed ? 'cloud-outline' : 'time-outline'}
          size={22}
          color={palette.inkSecondary}
        />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text numberOfLines={departed ? 2 : 1} style={styles.description}>
          {departed ? preview : '時刻を過ぎた泡を見返す'}
        </Text>
      </View>
      <Text style={styles.count}>{count}件</Text>
      <Ionicons name="chevron-forward" size={17} color={palette.inkSecondary} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 68,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.line,
  },
  departed: { backgroundColor: palette.white, marginTop: 14 },
  past: { backgroundColor: 'rgba(255,255,255,0.72)', marginTop: 10, marginBottom: 4 },
  symbol: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.cloud,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1, minWidth: 0 },
  title: { color: palette.ink, fontSize: 15, lineHeight: 22, fontWeight: '700' },
  description: { color: palette.inkSecondary, fontSize: 12, lineHeight: 18, marginTop: 2 },
  count: {
    color: palette.inkSecondary,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  disabled: { opacity: 0.6 },
});
