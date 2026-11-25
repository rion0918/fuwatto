import { initializeDatabase } from '../db/client';
import {
  configureAndroidNotificationChannels,
  configureNotificationHandler,
} from '../lib/notifications/reminderNotifications';
import { appServices } from './appServices';

export async function configureAppRuntime() {
  configureNotificationHandler();
  await Promise.all([
    configureAndroidNotificationChannels().catch((error) => {
      console.warn('Failed to configure notification channels', error);
    }),
    appServices.purchases.configure(),
  ]);
}

export async function prepareAppData() {
  await initializeDatabase();
  try {
    const settings = await appServices.settings.get();
    if (settings.analyticsConsent === 'granted') {
      void appServices.analytics.setCaptureEnabled(true);
    } else if (settings.analyticsConsent === 'denied') {
      void appServices.analytics.setCaptureEnabled(false);
    }
  } catch (error) {
    console.warn('Failed to restore persisted analytics consent', error);
  }
  try {
    await appServices.reminders.migrateLegacyNotificationChannels();
  } catch (error) {
    console.warn('Failed to migrate legacy notification channels', error);
  }
  await appServices.reminders.cleanup();
  await appServices.storeReview.ensureFirstSeen();
  try {
    await appServices.reminders.retryPendingNotifications();
  } catch (error) {
    console.warn('Failed to retry pending reminder notifications', error);
  }
}
