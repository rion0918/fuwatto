import * as SQLite from 'expo-sqlite';

import {
  getPopReminderDatabaseDirectory,
  initializeDatabase,
  POP_REMINDER_DATABASE_NAME,
} from '../db/client';
import { addLocalDays, startOfLocalDay } from '../features/reminders/domain/localDate';

import { coerceAppTheme, type AppTheme } from '../shared/domain/appTheme';

export type WidgetReminder = {
  id: string;
  title: string;
  targetAt: string;
  isExpired: boolean;
  allDay?: boolean;
};

export type WidgetSnapshot = {
  reminders: WidgetReminder[];
  pastReminderCount: number;
  theme: AppTheme;
};

type ReminderRow = {
  id: string;
  title: string;
  all_day: number;
  target_at: string;
  target_notify_at: string;
  expires_at: string;
  status: string;
};

type SettingsRow = {
  theme: string;
  auto_delete_enabled: number;
};

type WidgetSettings = {
  theme: AppTheme;
  autoDeleteEnabled: boolean;
};

let widgetDb: SQLite.SQLiteDatabase | null = null;

function getWidgetDb(): SQLite.SQLiteDatabase {
  if (!widgetDb) {
    widgetDb = SQLite.openDatabaseSync(
      POP_REMINDER_DATABASE_NAME,
      { useNewConnection: true },
      getPopReminderDatabaseDirectory(),
    );
  }
  return widgetDb;
}

function getReminders(db: SQLite.SQLiteDatabase, now: Date): WidgetReminder[] {
  const nowIso = now.toISOString();
  const todayStart = startOfLocalDay(now);
  const todayStartIso = todayStart.toISOString();
  const tomorrowStartIso = addLocalDays(todayStart, 1).toISOString();
  const todayAllDayRows = db.getAllSync<ReminderRow>(
    `SELECT id, title, all_day, target_at, target_notify_at, expires_at, status
     FROM reminders
     WHERE status = 'active' AND expires_at > ? AND all_day <> 0
       AND target_at >= ? AND target_at < ?
     ORDER BY target_at ASC`,
    [nowIso, todayStartIso, tomorrowStartIso],
  );
  const rows = db.getAllSync<ReminderRow>(
    `SELECT id, title, all_day, target_at, target_notify_at, expires_at, status
         FROM reminders
         WHERE status = 'active' AND expires_at > ?
           AND NOT (all_day <> 0 AND target_at >= ? AND target_at < ?)
         ORDER BY target_at ASC
         LIMIT 20`,
    [nowIso, todayStartIso, tomorrowStartIso],
  );

  return [...todayAllDayRows, ...rows].map((row) => ({
    id: row.id,
    title: row.title,
    targetAt: row.target_at,
    isExpired: row.status === 'expired' || row.expires_at <= nowIso,
    allDay: row.all_day !== 0,
  }));
}

function getSettings(db: SQLite.SQLiteDatabase): WidgetSettings {
  try {
    const row = db.getFirstSync<SettingsRow>(
      `SELECT theme, auto_delete_enabled
       FROM app_settings
       WHERE id = 'default'
       LIMIT 1`,
    );

    return {
      theme: coerceAppTheme(row?.theme ?? 'lavender'),
      autoDeleteEnabled: row?.auto_delete_enabled !== 0,
    };
  } catch (error) {
    console.warn('[Widget] Failed to fetch settings from SQLite', error);
    throw error;
  }
}

export async function getWidgetSnapshot(now = new Date()): Promise<WidgetSnapshot> {
  try {
    await initializeDatabase();
    const db = getWidgetDb();
    const settings = getSettings(db);

    return {
      reminders: getReminders(db, now),
      pastReminderCount: settings.autoDeleteEnabled
        ? 0
        : (db.getFirstSync<{ count: number }>(
            `SELECT COUNT(*) AS count FROM reminders
         WHERE status = 'expired' OR (status = 'active' AND expires_at <= ?)`,
            [now.toISOString()],
          )?.count ?? 0),
      theme: settings.theme,
    };
  } catch (error) {
    console.warn('[Widget] Failed to fetch reminders from SQLite', error);
    throw error;
  }
}
