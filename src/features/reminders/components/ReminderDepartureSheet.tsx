import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '../../../constants/colors';
import type { ReminderDepartureNotice } from '../domain/reminder';
import { formatReminderDateTime } from '../utils/reminderDateFormat';

type Props = {
  visible: boolean;
  notices: ReminderDepartureNotice[];
  acknowledging: boolean;
  onConfirm: (ids: string[]) => Promise<void>;
  onClose: () => void;
};

export function ReminderDepartureSheet({
  visible,
  notices,
  acknowledging,
  onConfirm,
  onClose,
}: Props) {
  const sheet = useRef<BottomSheetModal>(null);
  const presented = useRef(false);
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setError(null);
      presented.current = true;
      sheet.current?.present();
    } else if (presented.current) {
      presented.current = false;
      sheet.current?.dismiss();
    }
  }, [visible]);
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      sheet.current?.dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [visible]);
  const backdrop = useCallback(
    (props: ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.2} />
    ),
    [],
  );
  const confirm = async () => {
    if (acknowledging) return;
    setError(null);
    try {
      await onConfirm(notices.map((notice) => notice.id));
      onClose();
    } catch {
      setError('確認を保存できませんでした。もう一度お試しください。');
    }
  };
  return (
    <BottomSheetModal
      ref={sheet}
      name="reminder-departures"
      snapPoints={['65%', '90%']}
      enableDynamicSizing={false}
      enablePanDownToClose
      topInset={insets.top + 8}
      backdropComponent={backdrop}
      onDismiss={() => {
        presented.current = false;
        onClose();
      }}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetFlatList<ReminderDepartureNotice>
        data={notices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headingRow}>
              <View style={styles.headingContent}>
                <Text accessibilityRole="header" style={styles.heading}>
                  空へかえった泡
                </Text>
                <Text style={styles.introduction}>
                  時刻を過ぎた{notices.length}件を、自動で整理しました。
                </Text>
              </View>
              <Pressable
                cssInterop={false}
                accessibilityRole="button"
                accessibilityLabel="泡の案内を閉じる"
                onPress={() => sheet.current?.dismiss()}
                hitSlop={4}
                style={({ pressed }) => [styles.close, pressed ? styles.pressed : null]}
              >
                <Ionicons name="close" size={22} color={palette.inkSecondary} />
              </Pressable>
            </View>
            <Text style={styles.explanation}>ホームとWidgetから送り出した泡の一覧です。</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.itemSymbol}>
              <Ionicons name="cloud-outline" size={22} color={palette.inkSecondary} />
            </View>
            <View style={styles.itemContent}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemDate}>
                {formatReminderDateTime(item.targetAt, item.allDay)}
              </Text>
            </View>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Text style={styles.footnote}>確認すると、この案内の内容も端末から消去されます。</Text>
            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}
            <Pressable
              cssInterop={false}
              accessibilityRole="button"
              accessibilityLabel="空へかえった泡を確認しました"
              accessibilityState={{ disabled: acknowledging, busy: acknowledging }}
              disabled={acknowledging}
              onPress={() => void confirm()}
              style={({ pressed }) => [
                styles.confirm,
                pressed ? styles.pressed : null,
                acknowledging ? styles.disabled : null,
              ]}
            >
              <Text style={styles.confirmText}>
                {acknowledging ? '確認しています…' : '確認しました'}
              </Text>
            </Pressable>
          </View>
        }
      />
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  background: { backgroundColor: palette.cloud, borderRadius: 30 },
  handle: { backgroundColor: '#AAB7CC', width: 42 },
  header: { paddingTop: 12, paddingBottom: 22 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headingContent: { flex: 1 },
  heading: {
    fontSize: 24,
    lineHeight: 34,
    letterSpacing: -0.4,
    fontWeight: '700',
    color: palette.ink,
  },
  introduction: { marginTop: 8, fontSize: 14, lineHeight: 22, color: palette.inkSecondary },
  explanation: { marginTop: 14, fontSize: 13, lineHeight: 21, color: palette.inkSecondary },
  close: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 17,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  itemSymbol: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: { flex: 1 },
  itemTitle: { fontSize: 16, lineHeight: 24, color: palette.ink, fontWeight: '600' },
  itemDate: { fontSize: 13, lineHeight: 20, color: palette.inkSecondary, marginTop: 4 },
  footer: { paddingTop: 20 },
  footnote: { fontSize: 12, lineHeight: 20, color: palette.inkSecondary },
  confirm: {
    minHeight: 52,
    padding: 14,
    marginTop: 20,
    borderRadius: 18,
    backgroundColor: palette.lavenderDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { color: palette.white, fontWeight: '700', fontSize: 16, lineHeight: 24 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.6 },
  error: { fontSize: 14, lineHeight: 22, color: palette.dangerText, marginTop: 14 },
});
