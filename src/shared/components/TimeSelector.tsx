import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { palette } from '../../constants/colors';
import { DEFAULT_TIME_PRESETS, type TimePreset } from '../utils/timePresets';

export type TimeSelectorProps = {
  value: string;
  onChange: (value: string) => void;
  onSelectCustomTime: () => void;
  presets?: TimePreset[];
  variant?: 'regular' | 'compact';
  disabled?: boolean;
  disabledTimes?: string[];
  style?: StyleProp<ViewStyle>;
};

export function TimeSelector({
  value,
  onChange,
  onSelectCustomTime,
  presets = DEFAULT_TIME_PRESETS,
  variant = 'regular',
  disabled = false,
  disabledTimes = [],
  style,
}: TimeSelectorProps) {
  const isPresetTime = presets.some((preset) => preset.time === value);
  const isCompact = variant === 'compact';
  const customTimeLabel = isCompact && !isPresetTime ? value : '時刻';

  const renderPresetChip = (preset: TimePreset) => {
    const active = value === preset.time;
    const isDisabled = disabled || disabledTimes.includes(preset.time);
    const presetChipClassName = `min-w-0 flex-1 items-center justify-center gap-[2px] border px-[8px] py-[6px] ${
      isCompact ? 'min-h-[48px] rounded-[14px] px-[4px] py-[6px]' : 'min-h-[48px] rounded-[16px]'
    } ${active ? 'border-app-lavender-deep bg-app-lavender-deep' : 'border-app-line bg-app-white'}`;

    return (
      <Pressable
        key={preset.time}
        accessibilityRole="button"
        accessibilityState={{ selected: active, disabled: isDisabled }}
        disabled={isDisabled}
        onPress={() => onChange(preset.time)}
        className={presetChipClassName}
        style={({ pressed }) => [
          pressed && !isDisabled ? styles.pressedChip : null,
          isDisabled ? styles.disabledChip : null,
        ]}
      >
        <Text
          className={`font-bold ${isCompact ? 'text-[13px] leading-[18px]' : 'text-[14px] leading-[19px]'} ${
            active ? 'text-app-white' : 'text-app-ink'
          }`}
          style={isDisabled ? styles.disabledText : null}
        >
          {preset.label}
        </Text>
        <Text
          className={`text-[12px] font-medium leading-[16px] ${
            active ? 'text-app-white' : 'text-app-ink-secondary'
          }`}
          style={[styles.tabularTime, isDisabled ? styles.disabledText : null]}
        >
          {preset.time}
        </Text>
      </Pressable>
    );
  };

  return (
    <View className={isCompact ? 'gap-0' : 'gap-[8px]'} style={style}>
      {isCompact ? (
        <View className="flex-row gap-[6px]">
          {presets.map(renderPresetChip)}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: !isPresetTime, disabled }}
            disabled={disabled}
            onPress={onSelectCustomTime}
            className={`min-h-[48px] min-w-0 flex-1 flex-row items-center justify-center gap-[4px] rounded-[14px] border px-[4px] py-[6px] ${
              !isPresetTime
                ? 'border-app-lavender-deep bg-app-lavender-deep'
                : 'border-app-line bg-app-white'
            }`}
            style={({ pressed }) => [pressed ? styles.pressedChip : null]}
          >
            <Ionicons
              name="time-outline"
              size={15}
              color={!isPresetTime ? palette.white : palette.ink}
            />
            <Text
              adjustsFontSizeToFit
              numberOfLines={1}
              className={`text-[13px] font-bold leading-[18px] ${
                !isPresetTime ? 'text-app-white' : 'text-app-ink'
              }`}
              style={styles.tabularTime}
            >
              {isCompact ? customTimeLabel : '時刻を選ぶ'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View className="flex-row gap-[8px]">{presets.map(renderPresetChip)}</View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: !isPresetTime, disabled }}
            disabled={disabled}
            onPress={onSelectCustomTime}
            className={`min-h-[48px] w-full min-w-0 flex-row items-center justify-center gap-[6px] rounded-[16px] border px-[14px] py-[8px] ${
              !isPresetTime
                ? 'border-app-lavender-deep bg-app-lavender-deep'
                : 'border-app-line bg-app-white'
            }`}
            style={({ pressed }) => [pressed ? styles.pressedChip : null]}
          >
            <Ionicons
              name="time-outline"
              size={16}
              color={!isPresetTime ? palette.white : palette.ink}
            />
            <Text
              className={`text-[14px] font-bold leading-[20px] ${
                !isPresetTime ? 'text-app-white' : 'text-app-ink'
              }`}
              style={styles.tabularTime}
            >
              {!isPresetTime ? `カスタム: ${value}` : '時刻を選ぶ'}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  disabledChip: {
    backgroundColor: palette.disabledBackground,
    borderColor: palette.disabledBackground,
  },
  disabledText: {
    color: palette.disabledText,
  },
  pressedChip: {
    opacity: 0.78,
    transform: [{ scale: 0.97 }],
  },
  tabularTime: {
    fontVariant: ['tabular-nums'],
  },
});
