import {
  subscribeReminderNotificationResponses,
  type ReminderNotificationTapMeta,
} from '../lib/notifications/reminderNotifications';
import { buildReminderViewDeepLinkUrl } from './deepLinkIntent';

export function subscribeReminderNotificationIntent(
  onUrl: (url: string, meta: ReminderNotificationTapMeta) => void,
) {
  return subscribeReminderNotificationResponses((reminderId, meta) => {
    onUrl(buildReminderViewDeepLinkUrl(reminderId), meta);
  });
}
