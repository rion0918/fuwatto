import { addMinutes, format, isSameDay } from 'date-fns';

import { DEFAULT_TIME_PRESETS, type TimePreset } from '../../../shared/utils/timePresets';
import type { Reminder } from '../domain/reminder';
import { buildReminderSchedule } from '../domain/reminderSchedule';
import { getNextAvailableTimeForToday } from './reminderTimePresets';

export type ReminderScheduleDraft = {
  targetDate: string;
  targetTime: string;
  allDay?: boolean;
};

export type ReminderScheduleDraftOptions = {
  presets?: TimePreset[];
  now?: Date;
};

/** Resolve a valid default time for a schedule date when an all-day reminder has no explicit time. */
export function resolveDefaultTimeForScheduleDate(
  targetDate: string,
  presets: TimePreset[] = DEFAULT_TIME_PRESETS,
  now = new Date(),
): string {
  const resolvedPresets = presets.length > 0 ? presets : DEFAULT_TIME_PRESETS;
  const fallbackTime = resolvedPresets[0].time;
  const targetDay = new Date(`${targetDate}T00:00:00`);
  if (Number.isNaN(targetDay.getTime())) {
    return fallbackTime;
  }

  if (isSameDay(targetDay, now)) {
    const nextAvailable = getNextAvailableTimeForToday(targetDay, resolvedPresets, now);
    if (nextAvailable) {
      return nextAvailable;
    }

    const nextMinute = addMinutes(now, 1);
    if (isSameDay(nextMinute, targetDay)) {
      return format(nextMinute, 'HH:mm');
    }

    return fallbackTime;
  }

  return fallbackTime;
}

export function createReminderScheduleDraft(
  reminder: Pick<Reminder, 'targetAt' | 'allDay'>,
  options?: ReminderScheduleDraftOptions,
) {
  const target = new Date(reminder.targetAt);
  const targetDate = format(target, 'yyyy-MM-dd');
  const targetTime = reminder.allDay
    ? resolveDefaultTimeForScheduleDate(targetDate, options?.presets, options?.now)
    : format(target, 'HH:mm');

  return {
    targetDate,
    targetTime,
    ...(reminder.allDay ? { allDay: true } : {}),
  } satisfies ReminderScheduleDraft;
}

/** Toggle all-day mode while filling a sensible future time if none was explicitly chosen. */
export function applyReminderScheduleAllDayChange(
  draft: ReminderScheduleDraft,
  nextAllDay: boolean,
  options: {
    hasExplicitTime: boolean;
    presets?: TimePreset[];
    now?: Date;
  },
): ReminderScheduleDraft {
  if (nextAllDay) {
    return { ...draft, allDay: true };
  }

  if (!options.hasExplicitTime) {
    return {
      ...draft,
      allDay: false,
      targetTime: resolveDefaultTimeForScheduleDate(draft.targetDate, options.presets, options.now),
    };
  }

  return { ...draft, allDay: false };
}

export function evaluateReminderScheduleDraft(
  draft: ReminderScheduleDraft,
  previousNotifyTime: string,
  now = new Date(),
  allDayNotifyTime = '09:00',
) {
  try {
    const schedule = buildReminderSchedule({
      dateOffset: 0,
      customTargetDate: draft.targetDate,
      targetTime: draft.targetTime,
      allDay: draft.allDay ?? false,
      allDayNotifyTime,
      previousNotifyTime,
      now,
    });

    return {
      schedule,
      isTargetFuture: draft.allDay
        ? schedule.expiresAt.getTime() > now.getTime()
        : schedule.targetAt.getTime() > now.getTime(),
      isPreviousFuture: schedule.previousNotifyAt.getTime() > now.getTime(),
      isValid: true,
    };
  } catch {
    return {
      schedule: null,
      isTargetFuture: false,
      isPreviousFuture: false,
      isValid: false,
    };
  }
}
