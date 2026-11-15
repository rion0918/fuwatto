import { createContext, useContext } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { palette } from '../../../constants/colors';

const ZERO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const FALLBACK_SAFE_AREA_INSETS_CONTEXT = createContext(ZERO_INSETS);

type NotificationPermissionIntroModalProps = {
  visible: boolean;
  busy: boolean;
  canAskAgain: boolean;
  onAllow: () => void;
  onDismiss: () => void;
};

export function NotificationPermissionIntroModal({
  visible,
  busy,
  canAskAgain,
  onAllow,
  onDismiss,
}: NotificationPermissionIntroModalProps) {
  const safeAreaInsets =
    useContext(SafeAreaInsetsContext ?? FALLBACK_SAFE_AREA_INSETS_CONTEXT) ?? ZERO_INSETS;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={busy ? undefined : onDismiss}
    >
      <View
        style={[
          styles.overlay,
          {
            paddingTop: Math.max(20, safeAreaInsets.top + 12),
            paddingBottom: Math.max(20, safeAreaInsets.bottom + 12),
            paddingLeft: Math.max(22, safeAreaInsets.left + 14),
            paddingRight: Math.max(22, safeAreaInsets.right + 14),
          },
        ]}
      >
        <View accessibilityViewIsModal style={styles.card}>
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            style={styles.cardScroll}
            contentContainerStyle={styles.cardContent}
          >
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel="通知ベル"
              style={styles.iconCircle}
            >
              <Ionicons name="notifications-outline" size={26} color={palette.lavenderDeep} />
            </View>
            <Text style={styles.title}>通知でお知らせします</Text>
            <Text style={styles.body}>設定した時刻にリマインダーをお知らせします</Text>
            <Text style={styles.body}>アプリを閉じていても、忘れたくないことを確認できます。</Text>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="今は通知を許可しない"
                disabled={busy}
                onPress={onDismiss}
                style={[styles.actionButton, styles.secondaryButton]}
              >
                <Text style={styles.secondaryLabel}>今はしない</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={canAskAgain ? '通知を許可' : '端末の通知設定を開く'}
                accessibilityState={{ disabled: busy, busy }}
                disabled={busy}
                onPress={onAllow}
                style={[styles.actionButton, styles.primaryButton]}
              >
                {busy ? <ActivityIndicator size="small" color={palette.white} /> : null}
                <Text style={styles.primaryLabel}>
                  {canAskAgain ? '通知を許可' : '端末設定を開く'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.note}>
              <Ionicons name="shield-checkmark-outline" size={15} color={palette.mintDeep} />
              <Text style={styles.noteText}>通知は端末の設定からいつでも変更できます</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(38,49,81,0.28)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '100%',
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
  cardScroll: {
    width: '100%',
  },
  cardContent: {
    alignItems: 'center',
    padding: 22,
  },
  iconCircle: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    backgroundColor: '#F0EBFF',
  },
  title: {
    marginTop: 14,
    color: palette.ink,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    marginTop: 8,
    color: palette.inkSecondary,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '500',
    textAlign: 'center',
  },
  note: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#EFFAF5',
  },
  noteText: {
    flexShrink: 1,
    color: palette.mintDeep,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  actions: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  actionButton: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
  },
  primaryButton: {
    gap: 6,
    backgroundColor: palette.skyDeep,
  },
  primaryLabel: {
    color: palette.white,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.cloud,
  },
  secondaryLabel: {
    color: palette.ink,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    textAlign: 'center',
  },
});
