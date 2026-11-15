import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '../../../constants/colors';
import type {
  UpdateReminderScheduleInput,
  UpdateReminderScheduleResult,
} from '../application/reminderUseCases';
import type { Reminder } from '../domain/reminder';
import { reminderTitleSchema } from '../schemas/reminderSchema';
import {
  ImeSafeReminderTitleInput,
  type ImeSafeReminderTitleInputHandle,
} from './ImeSafeReminderTitleInput';
import { ReminderScheduleEditorModal } from './ReminderScheduleEditorModal';
import {
  formatReminderDetailAccessibilityDateTime,
  formatReminderDetailDate,
  formatReminderDetailTime,
  shouldShowPreviousNotification,
} from '../utils/reminderDateFormat';

type ReminderDetailSheetProps = {
  reminder: Reminder | null;
  allDayNotifyTime?: string;
  onClose: (closedReminderId: string | null) => void;
  onDelete: (reminder: Reminder) => Promise<void>;
  onUpdateTitle: (reminder: Reminder, title: string) => Promise<Reminder>;
  onUpdateSchedule: (
    reminder: Reminder,
    input: UpdateReminderScheduleInput,
  ) => Promise<UpdateReminderScheduleResult>;
};

const DETAIL_SHEET_BOTTOM_CLEARANCE = 24;
const DETAIL_SHEET_MIN_DYNAMIC_CONTENT_SIZE = 320;
const DETAIL_SHEET_BASE_BOTTOM_PADDING = 28;

type NotificationTimelineProps = {
  reminder: Reminder;
  isScheduleEditingDisabled: boolean;
  onEditSchedule: () => void;
};

function NotificationTimeline({
  reminder,
  isScheduleEditingDisabled,
  onEditSchedule,
}: NotificationTimelineProps) {
  const shouldDisplayPreviousNotification = shouldShowPreviousNotification(
    reminder.previousNotifyAt,
  );
  const previousAccessibilityDateTime = formatReminderDetailAccessibilityDateTime(
    reminder.previousNotifyAt,
  );
  const targetAccessibilityDateTime = formatReminderDetailAccessibilityDateTime(
    reminder.targetNotifyAt,
    new Date(),
    reminder.allDay,
  );

  return (
    <View style={styles.scheduleSection}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="予定日時を編集"
        accessibilityHint={targetAccessibilityDateTime}
        accessibilityState={{ disabled: isScheduleEditingDisabled }}
        disabled={isScheduleEditingDisabled}
        onPress={onEditSchedule}
        style={({ pressed }) => [
          styles.targetScheduleCard,
          pressed && !isScheduleEditingDisabled ? styles.targetScheduleCardPressed : null,
          isScheduleEditingDisabled ? styles.targetScheduleCardDisabled : null,
        ]}
      >
        <View style={styles.targetScheduleBody}>
          <View style={styles.targetScheduleHeader}>
            <View style={styles.targetScheduleIcon}>
              <Ionicons name="notifications-outline" size={24} color={palette.lavenderDeep} />
            </View>
            <Text style={styles.targetScheduleLabel}>予定日時</Text>
          </View>
          <Text style={styles.targetScheduleDate}>
            {formatReminderDetailDate(reminder.targetNotifyAt)}
          </Text>
          <Text style={styles.targetScheduleTime}>
            {formatReminderDetailTime(reminder.targetNotifyAt, reminder.allDay)}
          </Text>
          <View style={styles.targetTimeHint}>
            <Text style={styles.targetTimeHintText}>タップして日時を変更</Text>
          </View>
        </View>
      </Pressable>

      {shouldDisplayPreviousNotification ? (
        <>
          <View style={styles.scheduleDivider} />
          <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={`前日のお知らせ、${previousAccessibilityDateTime}`}
            style={styles.previousScheduleRow}
          >
            <View style={styles.previousScheduleIcon}>
              <Ionicons name="notifications-outline" size={19} color={palette.inkSecondary} />
            </View>
            <View style={styles.previousScheduleContent}>
              <View style={styles.previousScheduleLabelRow}>
                <Text style={styles.previousScheduleLabel}>前日のお知らせ</Text>
              </View>
              <Text style={styles.previousScheduleDate}>
                {formatReminderDetailDate(reminder.previousNotifyAt)}
              </Text>
              <Text style={styles.previousScheduleTime}>
                {formatReminderDetailTime(reminder.previousNotifyAt)}
              </Text>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

export function ReminderDetailSheet({
  reminder,
  allDayNotifyTime = '09:00',
  onClose,
  onDelete,
  onUpdateTitle,
  onUpdateSchedule,
}: ReminderDetailSheetProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetRef = useRef<BottomSheetModal>(null);
  const titleInputRef = useRef<ImeSafeReminderTitleInputHandle>(null);
  const draftTitleRef = useRef(reminder?.title ?? '');
  const isPresentedRef = useRef(false);
  const isClosingRef = useRef(false);
  const isDeleteRequestedRef = useRef(false);
  const displayedReminderIdRef = useRef<string | null>(null);
  const closingReminderIdRef = useRef<string | null>(null);
  const latestReminderIdRef = useRef<string | null>(null);
  const pendingDeleteReminderRef = useRef<Reminder | null>(null);
  const titleEditSessionRef = useRef(0);
  const shouldDiscardTitleEditRef = useRef(false);
  const isTitleSaveRequestedRef = useRef(false);
  const scheduleEditSessionRef = useRef(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [isTitleSaving, setIsTitleSaving] = useState(false);
  const [titleNotice, setTitleNotice] = useState<string | null>(null);
  const [isScheduleEditorOpen, setIsScheduleEditorOpen] = useState(false);
  const [isScheduleSaving, setIsScheduleSaving] = useState(false);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);
  const sheetTopInset = safeAreaInsets.top + 8;
  const detailMaxDynamicContentSize = useMemo(
    () =>
      Math.max(
        DETAIL_SHEET_MIN_DYNAMIC_CONTENT_SIZE,
        windowHeight - sheetTopInset - safeAreaInsets.bottom - DETAIL_SHEET_BOTTOM_CLEARANCE,
      ),
    [safeAreaInsets.bottom, sheetTopInset, windowHeight],
  );
  const detailContentBottomPadding = useMemo(
    () => DETAIL_SHEET_BASE_BOTTOM_PADDING + safeAreaInsets.bottom,
    [safeAreaInsets.bottom],
  );
  latestReminderIdRef.current = reminder?.id ?? null;

  const discardTitleEdit = useCallback(() => {
    titleEditSessionRef.current += 1;
    shouldDiscardTitleEditRef.current = true;
    isTitleSaveRequestedRef.current = false;
    setIsTitleEditing(false);
    setIsTitleSaving(false);
    draftTitleRef.current = reminder?.title ?? '';
    setTitleNotice(null);
  }, [reminder?.title]);

  const discardScheduleEdit = useCallback(() => {
    scheduleEditSessionRef.current += 1;
    setIsScheduleEditorOpen(false);
    setIsScheduleSaving(false);
    setScheduleNotice(null);
  }, []);

  const renderBackdrop = useCallback(
    (props: ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.16} />
    ),
    [],
  );

  useEffect(() => {
    if (!reminder) {
      if (isPresentedRef.current) {
        closingReminderIdRef.current = displayedReminderIdRef.current;
        isClosingRef.current = true;
        sheetRef.current?.dismiss();
        return;
      }

      isClosingRef.current = false;
      displayedReminderIdRef.current = null;
      return;
    }

    displayedReminderIdRef.current = reminder.id;

    if (!isPresentedRef.current) {
      isClosingRef.current = false;
      closingReminderIdRef.current = null;
      isPresentedRef.current = true;
      sheetRef.current?.present();
    }
  }, [reminder]);

  const handleDismiss = useCallback(() => {
    const closedReminderId = closingReminderIdRef.current ?? displayedReminderIdRef.current;
    const pendingReminderId = latestReminderIdRef.current;
    const pendingDeleteReminder = pendingDeleteReminderRef.current;
    pendingDeleteReminderRef.current = null;

    discardTitleEdit();
    discardScheduleEdit();

    isPresentedRef.current = false;
    if (!pendingDeleteReminder) {
      isDeleteRequestedRef.current = false;
      setIsDeleting(false);
    }

    onClose(closedReminderId);
    isClosingRef.current = false;
    closingReminderIdRef.current = null;

    if (pendingDeleteReminder) {
      displayedReminderIdRef.current = null;
      void onDelete(pendingDeleteReminder)
        .catch((error) => {
          console.warn('Failed to delete reminder', error);
          Alert.alert('削除できませんでした', '時間をおいてもう一度お試しください。');
        })
        .finally(() => {
          isDeleteRequestedRef.current = false;
          setIsDeleting(false);
        });
      return;
    }

    if (pendingReminderId && pendingReminderId !== closedReminderId) {
      displayedReminderIdRef.current = pendingReminderId;
      isPresentedRef.current = true;
      sheetRef.current?.present();
      return;
    }

    if (!pendingReminderId) {
      displayedReminderIdRef.current = null;
    }
  }, [discardScheduleEdit, discardTitleEdit, onClose, onDelete]);

  const handleClosePress = useCallback(() => {
    discardTitleEdit();
    discardScheduleEdit();
    closingReminderIdRef.current = displayedReminderIdRef.current;
    isClosingRef.current = true;
    sheetRef.current?.dismiss();
  }, [discardScheduleEdit, discardTitleEdit]);

  const handleSheetAnimate = useCallback(
    (_fromIndex: number, toIndex: number) => {
      if (toIndex === -1) {
        discardTitleEdit();
        discardScheduleEdit();
      }
    },
    [discardScheduleEdit, discardTitleEdit],
  );

  const handleTitlePress = useCallback(() => {
    if (!reminder || isTitleSaving || isScheduleSaving || isScheduleEditorOpen) {
      return;
    }

    titleEditSessionRef.current += 1;
    shouldDiscardTitleEditRef.current = false;
    isTitleSaveRequestedRef.current = false;
    draftTitleRef.current = reminder.title;
    setTitleNotice(null);
    setIsTitleEditing(true);

    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
  }, [isScheduleEditorOpen, isScheduleSaving, isTitleSaving, reminder]);

  const handleTitleTextChange = useCallback((text: string) => {
    draftTitleRef.current = text;
  }, []);

  const handleTitleEndEditing = useCallback(
    (text: string) => {
      const editSession = titleEditSessionRef.current;

      draftTitleRef.current = text;
      setIsTitleEditing(false);

      if (
        !reminder ||
        shouldDiscardTitleEditRef.current ||
        editSession !== titleEditSessionRef.current ||
        isTitleSaveRequestedRef.current
      ) {
        return;
      }

      const normalizedTitle = text.trim();
      const parsedTitle = reminderTitleSchema.safeParse(normalizedTitle);

      if (!parsedTitle.success) {
        draftTitleRef.current = reminder.title;
        setTitleNotice('タイトルは1〜40文字で入力してください');
        return;
      }

      if (parsedTitle.data === reminder.title) {
        draftTitleRef.current = reminder.title;
        setTitleNotice(null);
        return;
      }

      isTitleSaveRequestedRef.current = true;
      setIsTitleSaving(true);
      void onUpdateTitle(reminder, parsedTitle.data)
        .then((updatedReminder) => {
          draftTitleRef.current = updatedReminder.title;
          setTitleNotice(null);
        })
        .catch((error) => {
          console.warn('Failed to update reminder title', error);
          draftTitleRef.current = reminder.title;
          setTitleNotice('タイトルを保存できませんでした');
        })
        .finally(() => {
          isTitleSaveRequestedRef.current = false;
          setIsTitleSaving(false);
        });
    },
    [onUpdateTitle, reminder],
  );

  const handleSchedulePress = useCallback(() => {
    if (!reminder || isTitleEditing || isTitleSaving || isScheduleSaving) {
      return;
    }

    setScheduleNotice(null);
    setIsScheduleEditorOpen(true);
  }, [isScheduleSaving, isTitleEditing, isTitleSaving, reminder]);

  const handleScheduleConfirm = useCallback(
    async (input: UpdateReminderScheduleInput) => {
      if (!reminder || isScheduleSaving) {
        return;
      }

      const editSession = scheduleEditSessionRef.current + 1;
      scheduleEditSessionRef.current = editSession;
      setScheduleNotice(null);
      setIsScheduleSaving(true);

      try {
        const result = await onUpdateSchedule(reminder, input);
        if (editSession !== scheduleEditSessionRef.current) {
          return;
        }

        setIsScheduleEditorOpen(false);
        if (
          result.notification.status === 'not-scheduled' &&
          !(input.allDay && result.notification.reason === 'target-time-passed')
        ) {
          setScheduleNotice('日時は変更しましたが、通知を予約できませんでした');
        } else if (result.notification.status === 'partial') {
          setScheduleNotice('日時は変更しましたが、前日通知を予約できませんでした');
        } else {
          setScheduleNotice(null);
        }
      } catch (error) {
        if (editSession !== scheduleEditSessionRef.current) {
          return;
        }

        console.warn('Failed to update reminder schedule', error);
        setScheduleNotice(
          error instanceof Error && error.name === 'ActiveReminderLimitReachedError'
            ? '無料版で保持できる予定の上限に達しています'
            : '日時を保存できませんでした',
        );
      } finally {
        if (editSession === scheduleEditSessionRef.current) {
          setIsScheduleSaving(false);
        }
      }
    },
    [isScheduleSaving, onUpdateSchedule, reminder],
  );

  const handleDeletePress = useCallback(() => {
    if (!reminder || isDeleting || isScheduleSaving || isDeleteRequestedRef.current) {
      return;
    }

    discardTitleEdit();
    discardScheduleEdit();
    isDeleteRequestedRef.current = true;
    setIsDeleting(true);
    pendingDeleteReminderRef.current = reminder;
    closingReminderIdRef.current = displayedReminderIdRef.current;
    isClosingRef.current = true;
    sheetRef.current?.dismiss();
  }, [discardScheduleEdit, discardTitleEdit, isDeleting, isScheduleSaving, reminder]);

  return (
    <>
      <BottomSheetModal
        name="reminder-detail"
        ref={sheetRef}
        stackBehavior="replace"
        enableDismissOnClose
        enableDynamicSizing
        enablePanDownToClose
        maxDynamicContentSize={detailMaxDynamicContentSize}
        onAnimate={handleSheetAnimate}
        onDismiss={handleDismiss}
        topInset={sheetTopInset}
        bottomInset={safeAreaInsets.bottom}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={styles.handle}
        backgroundStyle={styles.sheetBackground}
      >
        <BottomSheetScrollView
          contentContainerStyle={[styles.content, { paddingBottom: detailContentBottomPadding }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.kicker}>ふわっと思い出す予定</Text>
              {isTitleEditing ? (
                <ImeSafeReminderTitleInput
                  ref={titleInputRef}
                  accessibilityLabel="リマインダーのタイトル"
                  label="タイトル"
                  initialValue={draftTitleRef.current}
                  onTextChange={handleTitleTextChange}
                  onEndEditing={handleTitleEndEditing}
                />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="タイトルを編集"
                  accessibilityState={{
                    disabled: !reminder || isTitleSaving || isScheduleSaving,
                  }}
                  disabled={!reminder || isTitleSaving || isScheduleSaving}
                  onPress={handleTitlePress}
                  style={({ pressed }) => [
                    styles.titlePressable,
                    pressed && !isTitleSaving ? styles.titlePressablePressed : null,
                  ]}
                >
                  <Text style={styles.title}>{reminder?.title ?? ''}</Text>
                </Pressable>
              )}
              {titleNotice ? <Text style={styles.titleNotice}>{titleNotice}</Text> : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="詳細を閉じる"
              onPress={handleClosePress}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color={palette.ink} />
            </Pressable>
          </View>

          {reminder ? (
            <NotificationTimeline
              reminder={reminder}
              isScheduleEditingDisabled={
                isTitleEditing || isTitleSaving || isScheduleSaving || isDeleting
              }
              onEditSchedule={handleSchedulePress}
            />
          ) : null}

          {scheduleNotice ? <Text style={styles.timeNotice}>{scheduleNotice}</Text> : null}

          <View style={styles.deleteActionSpacer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="このシャボン玉を削除する"
              accessibilityState={{ disabled: !reminder || isDeleting || isScheduleSaving }}
              onPress={handleDeletePress}
              disabled={!reminder || isDeleting || isScheduleSaving}
              style={({ pressed }) => [
                styles.deleteAction,
                pressed && !isDeleting ? styles.deleteActionPressed : null,
                !reminder || isDeleting || isScheduleSaving ? styles.deleteActionDisabled : null,
              ]}
            >
              <View style={styles.deleteActionContent}>
                <Ionicons name="trash-outline" size={19} color={palette.dangerText} />
                <Text style={styles.deleteActionText}>削除する</Text>
              </View>
            </Pressable>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>

      {reminder ? (
        <ReminderScheduleEditorModal
          visible={isScheduleEditorOpen}
          reminder={reminder}
          allDayNotifyTime={allDayNotifyTime}
          isSaving={isScheduleSaving}
          onConfirm={handleScheduleConfirm}
          onClose={() => setIsScheduleEditorOpen(false)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: palette.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handle: {
    width: 48,
    backgroundColor: '#C6D0E4',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 16,
  },
  headerCopy: {
    minWidth: 0,
    flex: 1,
  },
  kicker: {
    color: palette.inkSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  title: {
    color: palette.ink,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
  },
  titlePressable: {
    minHeight: 48,
    justifyContent: 'center',
  },
  titlePressablePressed: {
    opacity: 0.68,
  },
  titleNotice: {
    marginTop: 4,
    color: palette.dangerText,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.line,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.cloud,
  },
  scheduleSection: {
    width: '100%',
  },
  targetScheduleCard: {
    minHeight: 180,
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.cloud,
  },
  targetScheduleCardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  targetScheduleCardDisabled: {
    opacity: 0.5,
  },
  targetScheduleBody: {
    minHeight: 180,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  targetScheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  targetScheduleIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: '#F3EEFF',
  },
  targetScheduleLabel: {
    minWidth: 0,
    flex: 1,
    color: palette.lavenderDeep,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  targetScheduleDate: {
    marginTop: 10,
    marginLeft: 56,
    color: palette.inkSecondary,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  targetScheduleTime: {
    marginTop: 2,
    marginLeft: 56,
    color: palette.ink,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  targetTimeHint: {
    alignSelf: 'flex-start',
    marginTop: 10,
    marginLeft: 56,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
  },
  targetTimeHintText: {
    color: palette.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  scheduleDivider: {
    height: 1,
    marginHorizontal: 6,
    marginVertical: 20,
    backgroundColor: palette.line,
  },
  previousScheduleRow: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingHorizontal: 10,
  },
  previousScheduleIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.sky,
  },
  previousScheduleContent: {
    minWidth: 0,
    flex: 1,
  },
  previousScheduleLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  previousScheduleLabel: {
    color: palette.inkSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  previousScheduleDate: {
    marginTop: 8,
    color: palette.inkSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  previousScheduleTime: {
    marginTop: 2,
    color: palette.ink,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timeNotice: {
    marginTop: 8,
    paddingHorizontal: 6,
    color: palette.dangerText,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  deleteActionSpacer: {
    marginTop: 34,
    paddingTop: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  deleteAction: {
    minWidth: 132,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteActionText: {
    color: palette.dangerText,
    fontSize: 16,
    fontWeight: '700',
  },
  deleteActionPressed: {
    transform: [{ scale: 0.98 }],
    backgroundColor: palette.dangerSoft,
  },
  deleteActionDisabled: {
    opacity: 0.42,
  },
});
