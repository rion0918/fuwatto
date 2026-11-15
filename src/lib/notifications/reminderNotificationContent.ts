import type { Reminder } from '../../features/reminders/domain/reminder';

export type NotificationDisplayInput = Pick<Reminder, 'title' | 'allDay' | 'targetNotifyAt'>;

export type NotificationMessageContent = {
  title: string;
  body: string;
};

function formatLocalTime24h(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function buildDayTimePrefix(
  dayLabel: '明日' | '今日',
  reminder: Pick<Reminder, 'allDay' | 'targetNotifyAt'>,
): string {
  if (reminder.allDay) {
    return dayLabel;
  }

  const timeLabel = formatLocalTime24h(reminder.targetNotifyAt);
  return timeLabel ? `${dayLabel} ${timeLabel}` : dayLabel;
}

export function buildPreviousNotificationContent(
  reminder: NotificationDisplayInput,
): NotificationMessageContent {
  const prefix = buildDayTimePrefix('明日', reminder);

  return {
    title: `${prefix}｜${reminder.title}`,
    body: '明日の準備を、今のうちに。',
  };
}

export function buildTargetNotificationContent(
  reminder: NotificationDisplayInput,
): NotificationMessageContent {
  const prefix = buildDayTimePrefix('今日', reminder);

  return {
    title: `${prefix}｜${reminder.title}`,
    body: reminder.allDay ? '今日の予定をお知らせします。' : '予定の時間になりました。',
  };
}
