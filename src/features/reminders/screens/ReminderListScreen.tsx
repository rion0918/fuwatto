import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAppServices } from '../../../bootstrap/appServicesContext';
import { AppScreen } from '../../../shared/components/AppScreen';
import { DEFAULT_TIME_PRESETS } from '../../../shared/utils/timePresets';
import { palette } from '../../../constants/colors';
import { useAppSettingsQuery as useAppSettings } from '../../settings/presentation/useAppSettingsQuery';
import { ReminderDetailSheet } from '../components/ReminderDetailSheet';
import { ReminderSelectionBar } from '../components/ReminderSelectionBar';
import { useRemindersQuery as useReminders } from '../presentation/useRemindersQuery';
import { isReminderExpired, type Reminder } from '../domain/reminder';
import { filterReminders, type SearchFilter } from '../domain/reminderFilter';
import { formatReminderDateTime } from '../utils/reminderDateFormat';
import { getMsUntilNextDay, getReminderDueColor } from '../utils/reminderDueColor';
import { triggerReminderSelectionHaptic } from '../utils/reminderSelectionFeedback';
import {
  executeReminderBulkDelete,
  retainVisibleReminderSelection,
  startReminderSelection,
  toggleAllReminderSelection,
  toggleReminderSelection as toggleReminderSelectionIds,
} from './reminderListSelection';

function handleBack(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace('/');
}

export function ReminderListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ query?: string; filter?: string }>();
  const analytics = useAppServices().analytics;
  const purchases = useAppServices().purchases;
  const { settings, refresh: refreshSettings } = useAppSettings();
  const {
    reminders,
    loading,
    error,
    refresh,
    deleteReminder,
    deleteReminders,
    isDeletingReminders,
    updateReminderTitle,
    updateReminderSchedule,
  } = useReminders();
  const [selectedReminderId, setSelectedReminderId] = useState<string | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedReminderIds, setSelectedReminderIds] = useState<Set<string>>(() => new Set());
  const [colorReferenceDate, setColorReferenceDate] = useState(() => new Date());
  const longPressTriggeredIdRef = useRef<string | null>(null);
  const selectedReminder = reminders.find((reminder) => reminder.id === selectedReminderId) ?? null;
  const listQuery = typeof params.query === 'string' ? params.query : '';
  const listFilter: SearchFilter =
    params.filter === 'today' ||
    params.filter === 'tomorrow' ||
    params.filter === 'week' ||
    params.filter === 'past'
      ? params.filter
      : 'all';
  const displayedReminders = useMemo(
    () => filterReminders(reminders, listQuery, listFilter),
    [listFilter, listQuery, reminders],
  );
  const selectedCount = selectedReminderIds.size;
  const isPastView = listFilter === 'past';
  const hasPastReminders = displayedReminders.some((reminder) => isReminderExpired(reminder));
  const allRemindersSelected =
    displayedReminders.length > 0 && selectedCount === displayedReminders.length;
  const timePresets = useMemo(
    () =>
      settings
        ? [
            { label: '朝', time: settings.defaultTargetTime },
            { label: '昼', time: settings.noonTargetTime },
            { label: '夕', time: settings.eveningTargetTime },
            { label: '夜', time: settings.nightTargetTime },
          ]
        : DEFAULT_TIME_PRESETS,
    [settings],
  );

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useFocusEffect(
    useCallback(() => {
      void refreshSettings();
    }, [refreshSettings]),
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setColorReferenceDate(new Date());
    }, getMsUntilNextDay());

    return () => clearTimeout(timer);
  }, [colorReferenceDate]);

  const cancelSelection = useCallback(() => {
    longPressTriggeredIdRef.current = null;
    setIsSelectionMode(false);
    setSelectedReminderIds(new Set());
  }, []);

  const enterSelectionMode = useCallback((id: string) => {
    setIsSelectionMode(true);
    setSelectedReminderIds(startReminderSelection(id));
    void triggerReminderSelectionHaptic();
  }, []);

  const toggleReminderSelection = useCallback((id: string) => {
    void triggerReminderSelectionHaptic();
    setSelectedReminderIds((current) => toggleReminderSelectionIds(current, id));
  }, []);

  const toggleSelectAll = useCallback(() => {
    void triggerReminderSelectionHaptic();
    setSelectedReminderIds((current) =>
      toggleAllReminderSelection(
        current,
        displayedReminders.map((reminder) => reminder.id),
      ),
    );
  }, [displayedReminders]);

  useEffect(() => {
    setSelectedReminderIds((current) =>
      retainVisibleReminderSelection(
        current,
        displayedReminders.map((reminder) => reminder.id),
      ),
    );
  }, [displayedReminders]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (isDeletingReminders) return true;
        if (isSelectionMode) {
          cancelSelection();
          return true;
        }
        return false;
      });

      return () => subscription.remove();
    }, [cancelSelection, isDeletingReminders, isSelectionMode]),
  );

  const handleDeleteReminder = useCallback(
    async (reminder: Reminder) => {
      try {
        const deleted = await deleteReminder(reminder.id);

        if (!deleted) {
          throw new Error('Reminder was not found');
        }

        analytics.captureReminderDeleted({ surface: 'reminders_list', count: 1 });
        setSelectedReminderId(null);
      } catch (deleteError) {
        console.warn('Failed to delete reminder from list', deleteError);
        Alert.alert('削除できませんでした', '時間をおいてもう一度お試しください。');
      }
    },
    [analytics, deleteReminder],
  );

  const handleBulkDelete = useCallback(
    async (ids: string[]) => {
      const result = await executeReminderBulkDelete(ids, deleteReminders);

      if (result.ok) {
        analytics.captureReminderDeleted({
          surface: 'reminders_list',
          count: result.deletedIds.length,
        });
        cancelSelection();
        return;
      }

      console.warn('Failed to delete reminders from list', result.error);
      Alert.alert('削除できませんでした', '時間をおいてもう一度お試しください。');
    },
    [analytics, cancelSelection, deleteReminders],
  );

  const handleBulkDeletePress = useCallback(() => {
    if (selectedCount === 0 || isDeletingReminders) return;
    const ids = [...selectedReminderIds];

    Alert.alert(
      '選択したリマインドを削除しますか？',
      `${selectedCount}件のリマインドを削除します。この操作は取り消せません。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: `${selectedCount}件を削除`,
          style: 'destructive',
          onPress: () => void handleBulkDelete(ids),
        },
      ],
    );
  }, [handleBulkDelete, isDeletingReminders, selectedCount, selectedReminderIds]);

  const handleHeaderBack = useCallback(() => {
    if (isSelectionMode) {
      cancelSelection();
      return;
    }

    handleBack(router);
  }, [cancelSelection, isSelectionMode, router]);

  const handleUpdateReminderTitle = useCallback(
    async (reminder: Reminder, title: string) => {
      const updatedReminder = await updateReminderTitle(reminder.id, title);

      if (!updatedReminder) {
        throw new Error('Reminder was not found');
      }

      analytics.captureReminderEdited({
        surface: 'reminders_list',
        field: 'title',
      });
      return updatedReminder;
    },
    [analytics, updateReminderTitle],
  );

  const handleUpdateReminderSchedule = useCallback(
    async (
      reminder: Reminder,
      input: { targetDate: string; targetTime: string; allDay?: boolean },
    ) => {
      const result = await updateReminderSchedule(reminder.id, input);

      if (!result) {
        throw new Error('Reminder was not found');
      }

      if (result.notification.status !== 'unchanged') {
        analytics.captureReminderEdited({
          surface: 'reminders_list',
          field: 'schedule',
          notificationStatus: result.notification.status,
          notificationReason:
            'reason' in result.notification ? result.notification.reason : undefined,
        });
      }
      return result;
    },
    [analytics, updateReminderSchedule],
  );

  const handleOpenScheduleProPaywall = useCallback(async () => {
    analytics.captureProPaywallRequested({ placement: 'active_limit' });
    const result = await purchases.presentProPaywallIfNeeded();
    analytics.captureProPaywallResult({ placement: 'active_limit', outcome: result });

    if (result === 'cancelled') return false;
    if (result === 'error') {
      Alert.alert(
        'Proを確認できませんでした',
        '通信状況を確認して、時間をおいてもう一度お試しください。',
      );
      return false;
    }

    const accessState = await purchases.getProAccessState();
    return result === 'purchased' || result === 'restored' || accessState !== 'free';
  }, [analytics, purchases]);

  return (
    <AppScreen theme={settings?.theme ?? 'lavender'}>
      <View pointerEvents="none" className="absolute inset-0">
        <View
          className="absolute rounded-full border border-[rgba(255,255,255,0.46)] bg-[rgba(255,255,255,0.22)]"
          style={styles.ambientOne}
        />
        <View
          className="absolute rounded-full border border-[rgba(255,255,255,0.46)] bg-[rgba(237,230,255,0.22)]"
          style={styles.ambientTwo}
        />
      </View>

      <View className="h-[52px] flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isSelectionMode ? '選択モードを閉じる' : 'ホームに戻る'}
          hitSlop={6}
          onPress={handleHeaderBack}
          disabled={isDeletingReminders}
          className="h-[48px] w-[48px] items-center justify-center rounded-[24px] border border-app-line bg-app-white"
          style={({ pressed }) => (pressed ? styles.headerButtonPressed : null)}
        >
          <Ionicons
            name={isSelectionMode ? 'close' : 'chevron-back'}
            size={24}
            color={palette.ink}
          />
        </Pressable>
        <Text className="text-[18px] font-bold leading-[26px] text-app-ink">
          {isSelectionMode ? `${selectedCount}件選択中` : isPastView ? '過ぎた予定' : 'すべての泡'}
        </Text>
        <View className="w-[48px]" />
      </View>

      <View
        className="mb-[14px] mt-[16px] min-h-[88px] flex-row items-center justify-between gap-[14px] rounded-[24px] border border-app-line bg-app-white px-[18px] py-[16px]"
        style={styles.softShadow}
      >
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-[13px] font-semibold text-app-ink-secondary">
            {isPastView
              ? '時刻を過ぎた予定'
              : listQuery || listFilter !== 'all'
                ? '検索条件に一致する泡'
                : '表示中の泡'}
          </Text>
          <Text
            className="mt-[4px] text-[22px] font-bold leading-[29px] text-app-ink"
            numberOfLines={2}
          >
            {isPastView ? '残してある泡' : 'リマインドを一覧で見る'}
          </Text>
        </View>
        <View className="min-h-[42px] min-w-[58px] max-w-[34%] shrink-0 items-center justify-center rounded-[16px] border border-app-line bg-app-lavender px-[12px]">
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            className="text-[14px] font-bold text-app-ink"
            style={[styles.noFontPadding, styles.tabularTime]}
          >
            {displayedReminders.length}件
          </Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center px-[28px]">
          <ActivityIndicator color={palette.ink} />
          <Text className="mt-[10px] text-center text-[15px] font-medium leading-[23px] text-app-ink-secondary">
            泡を並べています
          </Text>
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[28px]">
          <Text className="text-center text-[18px] font-bold leading-[26px] text-app-ink">
            うまく読めませんでした
          </Text>
          <Text className="mt-[8px] text-center text-[15px] font-medium leading-[23px] text-app-ink-secondary">
            {error}
          </Text>
        </View>
      ) : displayedReminders.length === 0 ? (
        <View className="flex-1 items-center justify-center px-[28px]">
          <View className="mb-[18px] h-[72px] w-[72px] items-center justify-center rounded-[36px] border border-app-line bg-app-white">
            <Ionicons name="ellipse-outline" size={30} color={palette.lavenderDeep} />
          </View>
          <Text className="text-center text-[18px] font-bold leading-[26px] text-app-ink">
            {isPastView ? '過ぎた予定はありません' : '浮いている泡はありません'}
          </Text>
          <Text className="mt-[8px] text-center text-[15px] font-medium leading-[23px] text-app-ink-secondary">
            {isPastView
              ? 'これからの予定はホームで確認できます'
              : 'ホームからふわっと追加しましょう'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {displayedReminders.map((reminder, index) => {
            const dueColor = getReminderDueColor(reminder.targetAt, colorReferenceDate);
            const isSelected = selectedReminderIds.has(reminder.id);
            const isPast = isReminderExpired(reminder);
            const showSectionHeading =
              !isPastView &&
              hasPastReminders &&
              (index === 0 || isPast !== isReminderExpired(displayedReminders[index - 1]));

            return (
              <Fragment key={reminder.id}>
                {showSectionHeading ? (
                  <Text accessibilityRole="header" style={styles.sectionHeading}>
                    {isPast ? '過ぎた予定' : 'これからの予定'}
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole={isSelectionMode ? 'checkbox' : 'button'}
                  accessibilityLabel={
                    isSelectionMode
                      ? `${reminder.title}を${isSelected ? '選択解除' : '選択'}`
                      : `${isPast ? '過ぎた予定、' : ''}${reminder.title}の詳細を開く`
                  }
                  accessibilityHint={
                    isSelectionMode
                      ? 'タップして選択状態を切り替えます'
                      : '長押しで複数選択できます'
                  }
                  accessibilityState={
                    isSelectionMode
                      ? { checked: isSelected, disabled: isDeletingReminders }
                      : { disabled: isDeletingReminders }
                  }
                  onLongPress={() => {
                    if (!isDeletingReminders && !isSelectionMode) {
                      longPressTriggeredIdRef.current = reminder.id;
                      enterSelectionMode(reminder.id);
                    }
                  }}
                  onPress={() => {
                    if (isDeletingReminders) return;
                    if (longPressTriggeredIdRef.current === reminder.id) {
                      longPressTriggeredIdRef.current = null;
                      return;
                    }
                    if (isSelectionMode) {
                      toggleReminderSelection(reminder.id);
                    } else {
                      setSelectedReminderId(reminder.id);
                    }
                  }}
                  disabled={isDeletingReminders}
                  className="mb-[10px] min-h-[72px] flex-row items-center gap-[12px] rounded-[20px] border border-app-line bg-app-white px-[14px] py-[10px]"
                  style={({ pressed }) => [
                    isSelected ? styles.listItemSelected : null,
                    pressed ? styles.listItemPressed : null,
                  ]}
                >
                  <View
                    className="h-[44px] w-[44px] items-center justify-center overflow-hidden rounded-[22px] border"
                    style={[
                      styles.indexBubbleFallback,
                      {
                        backgroundColor: isPast ? palette.cloud : dueColor.background,
                        borderColor: isPast ? palette.line : dueColor.border,
                      },
                    ]}
                  >
                    {isPast ? (
                      <Ionicons name="time-outline" size={22} color={palette.inkSecondary} />
                    ) : (
                      <View className="absolute left-[10px] top-[8px] h-[8px] w-[14px] rotate-[-28deg] rounded-[7px] bg-[rgba(255,255,255,0.64)]" />
                    )}
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text
                      numberOfLines={isPast ? undefined : 1}
                      className="text-[15px] font-bold leading-[22px] text-app-ink"
                    >
                      {reminder.title}
                    </Text>
                    <Text
                      numberOfLines={isPast ? undefined : 1}
                      className="mt-[3px] text-[13px] font-medium leading-[18px] text-app-ink-secondary"
                      style={styles.tabularTime}
                    >
                      {formatReminderDateTime(reminder.targetAt, reminder.allDay)}
                    </Text>
                  </View>
                  {isSelectionMode ? (
                    <View
                      className="h-[28px] w-[28px] items-center justify-center rounded-[14px] border"
                      style={[
                        styles.selectionIndicator,
                        isSelected ? styles.selectionIndicatorSelected : null,
                      ]}
                    >
                      {isSelected ? (
                        <Ionicons name="checkmark" size={18} color={palette.white} />
                      ) : null}
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={palette.inkSecondary} />
                  )}
                </Pressable>
              </Fragment>
            );
          })}
        </ScrollView>
      )}

      {isSelectionMode && !loading && !error && displayedReminders.length > 0 ? (
        <ReminderSelectionBar
          selectedCount={selectedCount}
          allSelected={allRemindersSelected}
          busy={isDeletingReminders}
          onToggleAll={toggleSelectAll}
          onDelete={handleBulkDeletePress}
          style={styles.selectionActions}
        />
      ) : null}

      <ReminderDetailSheet
        reminder={selectedReminder}
        previousNotifyTime={settings?.previousNotifyTime}
        allDayNotifyTime={settings?.allDayNotifyTime}
        timePresets={timePresets}
        onClose={(closedReminderId) =>
          setSelectedReminderId((current) => (current === closedReminderId ? null : current))
        }
        onDelete={handleDeleteReminder}
        onUpdateTitle={handleUpdateReminderTitle}
        onUpdateSchedule={handleUpdateReminderSchedule}
        onOpenProPaywall={handleOpenScheduleProPaywall}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  sectionHeading: {
    marginTop: 14,
    marginBottom: 10,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '700',
    color: palette.inkSecondary,
  },
  ambientOne: {
    top: 96,
    right: -28,
    width: 112,
    height: 112,
  },
  ambientTwo: {
    left: -24,
    bottom: 118,
    width: 76,
    height: 76,
  },
  softShadow: {
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  noFontPadding: {
    includeFontPadding: false,
  },
  tabularTime: {
    fontVariant: ['tabular-nums'],
  },
  headerButtonPressed: {
    opacity: 0.78,
    transform: [{ translateY: 1 }, { scale: 0.94 }],
  },
  listContent: {
    paddingBottom: 34,
  },
  selectionActions: {
    marginTop: 10,
    marginBottom: 8,
  },
  listItemSelected: {
    borderColor: palette.lavenderDeep,
    backgroundColor: palette.lavender,
  },
  selectionIndicator: {
    borderColor: palette.controlLine,
    backgroundColor: palette.white,
  },
  selectionIndicatorSelected: {
    borderColor: palette.lavenderDeep,
    backgroundColor: palette.lavenderDeep,
  },
  listItemPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  indexBubbleFallback: {
    backgroundColor: 'rgba(237,230,255,0.74)',
    borderColor: 'rgba(255,255,255,0.82)',
  },
});
