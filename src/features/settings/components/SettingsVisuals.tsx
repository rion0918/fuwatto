import type { ComponentProps, PropsWithChildren } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { appThemes, palette, themeOptions, type AppTheme } from '../../../constants/colors';

const themeLabels: Record<AppTheme, string> = {
  sky: 'ドーン',
  lavender: 'ドリーム',
  mint: 'ブリーズ',
};

export function SettingsSection({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function PreviewBubble({ color, size = 40 }: { color: string; size?: number }) {
  return (
    <LinearGradient
      colors={[palette.white, color, 'rgba(255,255,255,0.45)']}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: palette.white,
      }}
    >
      <View style={styles.shine} />
    </LinearGradient>
  );
}

export function SettingsThemePicker({
  value,
  onChange,
}: {
  value: AppTheme;
  onChange: (theme: AppTheme) => void;
}) {
  return (
    <View style={styles.themeGrid}>
      {themeOptions.map((theme) => {
        const colors = appThemes[theme];
        const active = value === theme;
        return (
          <Pressable
            key={theme}
            accessibilityRole="button"
            accessibilityLabel={`${themeLabels[theme]}テーマを選択`}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(theme)}
            className="active:opacity-75"
            style={[styles.themeChoice, { borderColor: active ? colors.accent : palette.line }]}
          >
            <View
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              style={[styles.scene, { backgroundColor: colors.background }]}
            >
              <View style={styles.largeBubble}>
                <PreviewBubble color={colors.accentSoft} size={48} />
              </View>
              <View style={styles.smallBubble}>
                <PreviewBubble color={colors.secondary} size={30} />
              </View>
              <View
                style={[
                  styles.selection,
                  {
                    backgroundColor: active ? colors.accent : palette.white,
                    borderColor: active ? colors.accent : palette.line,
                  },
                ]}
              >
                {active ? <Ionicons name="checkmark" size={13} color={palette.white} /> : null}
              </View>
            </View>
            <Text style={[styles.themeLabel, { color: colors.accent }]}>{themeLabels[theme]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SettingsTimeTile({
  label,
  icon,
  value,
  color,
  background,
  onPress,
}: {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  value: string;
  color: string;
  background: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}の時刻を変更`}
      accessibilityValue={{ text: value }}
      onPress={onPress}
      className="active:opacity-75"
      style={[styles.timeTile, { backgroundColor: background }]}
    >
      <View style={styles.tileHeader}>
        <View style={styles.tileLabelGroup}>
          <Ionicons name={icon} size={20} color={color} />
          <Text style={styles.label}>{label}</Text>
        </View>
        <Ionicons name="create-outline" size={16} color={palette.inkSecondary} />
      </View>
      <Text style={styles.time}>{value}</Text>
    </Pressable>
  );
}

export function SettingsNotificationTimeline({
  value,
  pending,
  onPress,
}: {
  value: string;
  pending: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.timeline}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="前日のお知らせの時刻を変更"
        accessibilityValue={{ text: value }}
        accessibilityState={{ disabled: pending }}
        disabled={pending}
        onPress={onPress}
        className="active:opacity-75"
        style={styles.previousDay}
      >
        <View style={styles.tileLabelGroup}>
          <Ionicons name="notifications-outline" size={18} color={palette.lavenderDeep} />
          <Text style={styles.label}>前日</Text>
        </View>
        {pending ? (
          <ActivityIndicator color={palette.lavenderDeep} />
        ) : (
          <Text style={styles.time}>{value}</Text>
        )}
        <Text style={styles.hint}>
          お知らせ <Ionicons name="create-outline" size={12} color={palette.inkSecondary} />
        </Text>
      </Pressable>
      <Ionicons name="arrow-forward" size={18} color={palette.inkSecondary} />
      <View style={styles.currentDay}>
        <Ionicons name="calendar-outline" size={24} color={palette.inkSecondary} />
        <Text style={styles.label}>当日</Text>
        <Text style={styles.hint}>予定の日時</Text>
      </View>
    </View>
  );
}

export function SettingsAutoDeletePreview({ enabled }: { enabled: boolean }) {
  return (
    <View>
      <View
        style={styles.illustration}
        accessibilityLabel={
          enabled
            ? '時刻を過ぎた泡を空へ送り出し、次の起動で内容を案内'
            : '時刻を過ぎた泡は過ぎた予定に保持'
        }
      >
        <View style={styles.step}>
          <PreviewBubble color={appThemes.lavender.accentSoft} size={34} />
          <Text style={styles.hint}>予定</Text>
        </View>
        <View style={styles.step}>
          <Ionicons name="arrow-forward" size={18} color={palette.inkSecondary} />
          <Text style={styles.hint}>時刻を過ぎる</Text>
        </View>
        <View style={styles.step}>
          {enabled ? (
            <View style={styles.emptyBubble}>
              <Ionicons name="sparkles-outline" size={18} color={palette.inkSecondary} />
            </View>
          ) : (
            <PreviewBubble color={appThemes.lavender.accentSoft} size={34} />
          )}
          <Text style={styles.hint}>{enabled ? '空へかえる' : '別の場所へ'}</Text>
        </View>
      </View>
      <Text style={styles.caption}>
        {enabled
          ? '時刻を過ぎた泡を自動整理し、次にホームを開いたときに案内します。内容は確認するまで端末に残ります。'
          : '時刻を過ぎた泡は「過ぎた予定」に残ります。ホームやWidgetの入口から見返せます。'}
      </Text>
    </View>
  );
}

export function SettingsVoicePreview({ enabled }: { enabled: boolean }) {
  return (
    <View style={styles.voicePreview}>
      <View
        style={styles.phones}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <View style={{ transform: [{ rotate: '-20deg' }] }}>
          <Ionicons name="phone-portrait-outline" size={22} color={palette.lavenderDeep} />
        </View>
        <Ionicons name="swap-horizontal" size={16} color={palette.inkSecondary} />
        <View style={{ transform: [{ rotate: '20deg' }] }}>
          <Ionicons name="phone-portrait-outline" size={22} color={palette.lavenderDeep} />
        </View>
      </View>
      <View style={styles.voiceLabel}>
        <Ionicons
          name={enabled ? 'mic' : 'mic-outline'}
          size={18}
          color={enabled ? palette.mintDeep : palette.inkSecondary}
        />
        <Text style={styles.voiceText}>{enabled ? '傾けて話す' : '傾けて音声入力'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 18,
    marginBottom: 4,
    padding: 16,
    borderRadius: 24,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
  },
  heading: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    color: palette.ink,
    marginBottom: 14,
  },
  themeGrid: { flexDirection: 'row', gap: 8 },
  themeChoice: {
    flex: 1,
    minWidth: 0,
    borderWidth: 2,
    borderRadius: 18,
    padding: 4,
    backgroundColor: palette.white,
  },
  scene: { height: 88, borderRadius: 13, overflow: 'hidden' },
  largeBubble: { position: 'absolute', top: 24, left: 5 },
  smallBubble: { position: 'absolute', top: 12, right: 3 },
  selection: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shine: {
    width: '28%',
    height: '12%',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 8,
    marginTop: '18%',
    marginLeft: '18%',
    transform: [{ rotate: '-35deg' }],
  },
  themeLabel: { fontSize: 13, fontWeight: '700', textAlign: 'center', paddingVertical: 8 },
  timeTile: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 0,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    minHeight: 88,
    justifyContent: 'space-between',
    gap: 8,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tileLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  label: { fontSize: 14, fontWeight: '700', color: palette.ink, flexShrink: 1 },
  time: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    color: palette.ink,
    fontVariant: ['tabular-nums'],
  },
  hint: { fontSize: 12, fontWeight: '600', color: palette.inkSecondary, textAlign: 'center' },
  timeline: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  previousDay: {
    flex: 1,
    minHeight: 98,
    borderRadius: 18,
    backgroundColor: palette.cloud,
    borderColor: palette.line,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  currentDay: { flex: 1, alignItems: 'center', gap: 6 },
  illustration: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: palette.cloud,
    borderWidth: 1,
    borderColor: palette.line,
    gap: 6,
  },
  step: { flex: 1, alignItems: 'center', gap: 8 },
  emptyBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.controlLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    color: palette.inkSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    marginBottom: 10,
  },
  voicePreview: {
    backgroundColor: palette.cloud,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 6,
  },
  phones: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voiceLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  voiceText: { fontSize: 13, fontWeight: '600', color: palette.inkSecondary },
});
