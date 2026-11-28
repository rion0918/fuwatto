import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { format, startOfDay } from 'date-fns';
import { useReducedMotion } from 'react-native-reanimated';
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '../../../constants/colors';
import { DEFAULT_TIME_PRESETS, type TimePreset } from '../../../shared/utils/timePresets';
import type { Reminder } from '../domain/reminder';
import {
  applyReminderScheduleAllDayChange,
  createReminderScheduleDraft,
  evaluateReminderScheduleDraft,
  resolveDefaultTimeForScheduleDate,
  type ReminderScheduleDraft,
} from '../utils/reminderScheduleEditor';
import { formatReminderDetailDate, formatReminderDetailTime } from '../utils/reminderDateFormat';
import { ReminderAllDaySlider } from './ReminderAllDaySlider';

export type ReminderScheduleSaveError = {
  message: string;
  isActiveLimitReached?: boolean;
};

type ReminderScheduleEditorModalProps = {
  visible: boolean;
  reminder: Pick<Reminder, 'targetAt' | 'previousNotifyAt' | 'allDay'>;
  previousNotifyTime?: string;
  allDayNotifyTime?: string;
  timePresets?: TimePreset[];
  isSaving: boolean;
  saveError?: ReminderScheduleSaveError | null;
  isOpeningProPaywall?: boolean;
  onConfirm: (draft: ReminderScheduleDraft) => void;
  onClose: () => void;
  onClearSaveError?: () => void;
  onOpenProPaywall?: () => void;
};

type ActivePicker = 'date' | 'time' | null;

const pickerDisplay = Platform.select({
  ios: 'spinner',
  android: 'default',
  default: 'default',
} as const);

export function ReminderScheduleEditorModal({
  visible,
  reminder,
  previousNotifyTime,
  allDayNotifyTime = '09:00',
  timePresets = DEFAULT_TIME_PRESETS,
  isSaving,
  saveError = null,
  isOpeningProPaywall = false,
  onConfirm,
  onClose,
  onClearSaveError,
  onOpenProPaywall,
}: ReminderScheduleEditorModalProps) {
  const [draft, setDraft] = useState<ReminderScheduleDraft>(() =>
    createReminderScheduleDraft(reminder, { presets: timePresets }),
  );
  const [initialDraft, setInitialDraft] = useState<ReminderScheduleDraft>(() =>
    createReminderScheduleDraft(reminder, { presets: timePresets }),
  );
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const wasVisibleRef = useRef(false);
  const hasExplicitTimeRef = useRef(!reminder.allDay);
  const safeAreaInsets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const fallbackPreviousDate = new Date(reminder.previousNotifyAt);
  const resolvedPreviousNotifyTime =
    previousNotifyTime ??
    (Number.isNaN(fallbackPreviousDate.getTime())
      ? '20:00'
      : format(fallbackPreviousDate, 'HH:mm'));
  const evaluated = evaluateReminderScheduleDraft(
    draft,
    resolvedPreviousNotifyTime,
    new Date(),
    allDayNotifyTime,
  );
  const minimumDate = startOfDay(new Date());
  const datePickerValue = useMemo(
    () => new Date(`${draft.targetDate}T12:00:00`),
    [draft.targetDate],
  );
  const timePickerValue = useMemo(() => {
    const [hours, minutes] = draft.targetTime.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  }, [draft.targetTime]);
  const previousDate = evaluated.schedule?.previousNotifyAt ?? fallbackPreviousDate;
  const isBusy = isSaving || isOpeningProPaywall;
  const hasChanges =
    draft.targetDate !== initialDraft.targetDate ||
    Boolean(draft.allDay) !== Boolean(initialDraft.allDay) ||
    (!draft.allDay && draft.targetTime !== initialDraft.targetTime);
  const previousNoticeText = !evaluated.isPreviousFuture
    ? '前日のお知らせ時刻は過ぎているため、当日だけお知らせします'
    : hasChanges
      ? `前日のお知らせも ${formatReminderDetailDate(previousDate)} ${formatReminderDetailTime(previousDate)} に変わります`
      : `前日のお知らせは ${formatReminderDetailDate(previousDate)} ${formatReminderDetailTime(previousDate)}`;
  const isSaveDisabled = isBusy || !evaluated.isValid || !evaluated.isTargetFuture;

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      const nextDraft = createReminderScheduleDraft(reminder, { presets: timePresets });
      setDraft(nextDraft);
      setInitialDraft(nextDraft);
      hasExplicitTimeRef.current = !reminder.allDay;
      setActivePicker(null);
    }

    wasVisibleRef.current = visible;
  }, [reminder, timePresets, visible]);

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      setActivePicker(null);
      return;
    }

    if (!selectedDate) return;

    const nextDate = selectedDate < minimumDate ? minimumDate : selectedDate;
    const nextTargetDate = format(nextDate, 'yyyy-MM-dd');
    onClearSaveError?.();
    setDraft((current) => ({
      ...current,
      targetDate: nextTargetDate,
      ...(!hasExplicitTimeRef.current
        ? { targetTime: resolveDefaultTimeForScheduleDate(nextTargetDate, timePresets) }
        : {}),
    }));
    if (Platform.OS === 'android') setActivePicker(null);
  };

  const handleTimeChange = (event: DateTimePickerEvent, selectedTime?: Date) => {
    if (event.type === 'dismissed') {
      setActivePicker(null);
      return;
    }

    if (!selectedTime) return;

    hasExplicitTimeRef.current = true;
    onClearSaveError?.();
    setDraft((current) => ({ ...current, targetTime: format(selectedTime, 'HH:mm') }));
    if (Platform.OS === 'android') setActivePicker(null);
  };

  const handleAllDayChange = (nextAllDay: boolean) => {
    onClearSaveError?.();
    if (nextAllDay) {
      setActivePicker((current) => (current === 'time' ? null : current));
    }
    setDraft((current) =>
      applyReminderScheduleAllDayChange(current, nextAllDay, {
        hasExplicitTime: hasExplicitTimeRef.current,
        presets: timePresets,
      }),
    );
  };

  const renderPicker = () => {
    if (!activePicker) return null;

    const picker = (
      <DateTimePicker
        value={activePicker === 'date' ? datePickerValue : timePickerValue}
        mode={activePicker}
        display={pickerDisplay}
        minimumDate={activePicker === 'date' ? minimumDate : undefined}
        is24Hour={activePicker === 'time'}
        locale="ja-JP"
        themeVariant="light"
        onChange={activePicker === 'date' ? handleDateChange : handleTimeChange}
      />
    );

    if (Platform.OS === 'android') return picker;

    return (
      <View style={styles.pickerSurface}>
        <View style={styles.inlinePicker}>{picker}</View>
      </View>
    );
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => {
          if (!isBusy) onClose();
        }}
      >
        <GestureHandlerRootView style={styles.modalGestureRoot}>
          <View style={styles.modalOverlay}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="日時変更をキャンセル"
              accessibilityState={{ disabled: isBusy }}
              disabled={isBusy}
              onPress={onClose}
              style={styles.backdrop}
            />

            <View accessibilityViewIsModal style={styles.panel}>
              <ScrollView
                bounces={false}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                  styles.content,
                  { paddingBottom: Math.max(18, safeAreaInsets.bottom + 8) },
                ]}
              >
                <View style={styles.actionBar}>
                  <Pressable
                    cssInterop={false}
                    accessibilityRole="button"
                    accessibilityLabel="日時変更をキャンセル"
                    accessibilityState={{ disabled: isBusy }}
                    disabled={isBusy}
                    hitSlop={6}
                    onPress={onClose}
                    style={({ pressed }) => [
                      styles.actionButton,
                      pressed && !isBusy ? styles.actionButtonPressed : null,
                      isBusy ? styles.actionButtonDisabled : null,
                    ]}
                  >
                    <Text style={styles.cancelActionText}>キャンセル</Text>
                  </Pressable>

                  <Pressable
                    cssInterop={false}
                    accessibilityRole="button"
                    accessibilityLabel="日時変更を完了"
                    accessibilityState={{ disabled: isSaveDisabled }}
                    disabled={isSaveDisabled}
                    hitSlop={6}
                    onPress={() => onConfirm(draft)}
                    style={({ pressed }) => [
                      styles.actionButton,
                      styles.completeActionButton,
                      pressed && !isSaveDisabled ? styles.actionButtonPressed : null,
                      isSaveDisabled ? styles.actionButtonDisabled : null,
                    ]}
                  >
                    <Text style={styles.completeActionText}>{isSaving ? '保存中…' : '完了'}</Text>
                  </Pressable>
                </View>

                <View style={styles.scheduleSurface}>
                  <Text style={styles.scheduleLabel}>お知らせ日時</Text>

                  <Pressable
                    cssInterop={false}
                    accessibilityRole="button"
                    accessibilityLabel="日付を変更"
                    accessibilityHint={formatReminderDetailDate(datePickerValue)}
                    accessibilityState={{ selected: activePicker === 'date', disabled: isBusy }}
                    disabled={isBusy}
                    onPress={() => setActivePicker('date')}
                    style={({ pressed }) => [
                      styles.scheduleDateButton,
                      activePicker === 'date' ? styles.scheduleValueActive : null,
                      isBusy ? styles.scheduleValueDisabled : null,
                      pressed ? styles.scheduleValuePressed : null,
                    ]}
                  >
                    <Text
                      adjustsFontSizeToFit
                      minimumFontScale={0.82}
                      numberOfLines={1}
                      style={styles.scheduleDateValue}
                    >
                      {formatReminderDetailDate(datePickerValue)}
                    </Text>
                  </Pressable>

                  {!draft.allDay ? <View style={styles.scheduleDivider} /> : null}

                  {!draft.allDay ? (
                    <Pressable
                      cssInterop={false}
                      accessibilityRole="button"
                      accessibilityLabel="時刻を変更"
                      accessibilityHint={formatReminderDetailTime(timePickerValue)}
                      accessibilityState={{ selected: activePicker === 'time', disabled: isBusy }}
                      disabled={isBusy}
                      onPress={() => setActivePicker('time')}
                      style={({ pressed }) => [
                        styles.scheduleTimeButton,
                        activePicker === 'time' ? styles.scheduleValueActive : null,
                        isBusy ? styles.scheduleValueDisabled : null,
                        pressed ? styles.scheduleValuePressed : null,
                      ]}
                    >
                      <Text numberOfLines={1} style={styles.scheduleTimeValue}>
                        {formatReminderDetailTime(timePickerValue)}
                      </Text>
                    </Pressable>
                  ) : null}

                  <View style={styles.editorSliderSpacing}>
                    <ReminderAllDaySlider
                      allDay={Boolean(draft.allDay)}
                      dateLabel={formatReminderDetailDate(datePickerValue)}
                      time={formatReminderDetailTime(timePickerValue)}
                      allDayNotifyTime={allDayNotifyTime}
                      disabled={isBusy}
                      reduceMotion={Boolean(reduceMotion)}
                      onChange={handleAllDayChange}
                    />
                  </View>
                </View>

                {Platform.OS === 'ios' ? renderPicker() : null}

                {!evaluated.isTargetFuture && !saveError ? (
                  <Text style={styles.targetWarning}>過去の日時には変更できません</Text>
                ) : null}

                {saveError ? (
                  <View accessible accessibilityRole="alert" style={styles.saveErrorCard}>
                    <Text style={styles.saveErrorTitle}>{saveError.message}</Text>
                    {saveError.isActiveLimitReached ? (
                      <Text style={styles.saveErrorDescription}>
                        Pro版ふわっと。なら、忘れたくないことを無制限に残せます。
                      </Text>
                    ) : null}
                    {saveError.isActiveLimitReached && onOpenProPaywall ? (
                      <Pressable
                        cssInterop={false}
                        accessibilityRole="button"
                        accessibilityLabel="Proを見る"
                        accessibilityState={{ disabled: isBusy }}
                        disabled={isBusy}
                        onPress={onOpenProPaywall}
                        style={({ pressed }) => [
                          styles.proActionButton,
                          pressed && !isBusy ? styles.actionButtonPressed : null,
                          isBusy ? styles.actionButtonDisabled : null,
                        ]}
                      >
                        <Text style={styles.proActionButtonText}>
                          {isOpeningProPaywall ? 'Proを確認中…' : 'Proを見る'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                <View
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={previousNoticeText}
                  style={styles.previousNotice}
                >
                  <Ionicons
                    name="notifications-outline"
                    size={18}
                    color={evaluated.isPreviousFuture ? palette.inkSecondary : palette.dangerText}
                  />
                  <Text
                    style={[
                      styles.previousNoticeText,
                      !evaluated.isPreviousFuture ? styles.previousNoticeTextPast : null,
                    ]}
                  >
                    {previousNoticeText}
                  </Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </GestureHandlerRootView>
      </Modal>

      {visible && Platform.OS === 'android' ? renderPicker() : null}
    </>
  );
}

const styles = StyleSheet.create({
  modalGestureRoot: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(38,49,81,0.32)',
  },
  panel: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '96%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: palette.white,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
  },
  content: {
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  actionBar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionButton: {
    minWidth: 84,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  completeActionButton: {
    backgroundColor: palette.lavenderDeep,
  },
  actionButtonPressed: {
    opacity: 0.68,
    transform: [{ scale: 0.96 }],
  },
  actionButtonDisabled: {
    opacity: 0.42,
  },
  cancelActionText: {
    color: palette.inkSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  completeActionText: {
    color: palette.white,
    fontSize: 15,
    fontWeight: '700',
  },
  scheduleSurface: {
    marginTop: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 24,
    backgroundColor: palette.cloud,
  },
  editorSliderSpacing: {
    marginTop: 12,
  },
  scheduleLabel: {
    paddingHorizontal: 8,
    paddingTop: 2,
    paddingBottom: 6,
    color: palette.inkSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  scheduleDateButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  scheduleTimeButton: {
    minHeight: 68,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  scheduleValueActive: {
    backgroundColor: palette.lavender,
  },
  scheduleValuePressed: {
    opacity: 0.76,
    transform: [{ scale: 0.98 }],
  },
  scheduleValueDisabled: {
    opacity: 0.5,
  },
  scheduleDateValue: {
    color: palette.ink,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  scheduleTimeValue: {
    color: palette.ink,
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  scheduleDivider: {
    height: 1,
    marginHorizontal: 12,
    backgroundColor: palette.line,
  },
  pickerSurface: {
    marginTop: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 20,
    backgroundColor: palette.white,
  },
  inlinePicker: {
    alignItems: 'center',
  },
  targetWarning: {
    marginTop: 10,
    color: palette.dangerText,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    textAlign: 'center',
  },
  saveErrorCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: palette.dangerSoft,
    gap: 8,
  },
  saveErrorTitle: {
    color: palette.dangerText,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  saveErrorDescription: {
    color: palette.inkSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  proActionButton: {
    minHeight: 48,
    marginTop: 2,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.lavenderDeep,
  },
  proActionButtonText: {
    color: palette.white,
    fontSize: 15,
    fontWeight: '700',
  },
  previousNotice: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  previousNoticeText: {
    minWidth: 0,
    flex: 1,
    color: palette.inkSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  previousNoticeTextPast: {
    color: palette.dangerText,
    fontWeight: '600',
  },
});
