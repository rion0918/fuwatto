import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertSourceIncludes, readSource } from '../../test-utils/sourceAssertions';

const source = readSource(import.meta.url, './reminderNotifications.ts');

test('scheduled notifications use reminder time and title instead of the app name', () => {
  assert.equal(source.includes("title: 'ふわっと。'"), false);
  assert.equal(source.includes("title: '前日のお知らせ'"), false);
  assert.equal(source.includes("title: 'ポップ・リマインダー'"), false);
  assert.equal(source.includes('ふわっと残しています'), false);
});

test('notification setup uses one high-importance OS-controlled Android channel', () => {
  assertSourceIncludes(source, [
    /REMINDER_NOTIFICATION_CHANNEL_ID = 'reminder-alerts-high'/,
    /configureAndroidNotificationChannels/,
    /Notifications\.setNotificationChannelAsync\(REMINDER_NOTIFICATION_CHANNEL_ID/,
    /importance:\s*Notifications\.AndroidImportance\.HIGH/,
    /priority:\s*Notifications\.AndroidNotificationPriority\.HIGH/,
  ]);
  assert.equal(source.includes("setNotificationChannelAsync('reminder-silent'"), false);
  assert.equal(source.includes("setNotificationChannelAsync('reminder-alerts'"), false);
  assert.equal(source.includes('通知音なし'), false);
});

test('scheduled notifications delegate sound behavior to the OS settings', () => {
  assertSourceIncludes(source, [
    /shouldPlaySound: true/,
    /sound: true/,
    /channelId: REMINDER_NOTIFICATION_CHANNEL_ID/,
  ]);
  assert.equal(source.includes('soundEnabled'), false);
});

test('legacy silent and default-importance channels can be identified and cleaned up after migration', () => {
  assertSourceIncludes(source, [
    /getLegacyScheduledNotificationIds/,
    /Notifications\.getAllScheduledNotificationsAsync\(\)/,
    /deleteLegacyAndroidNotificationChannels/,
    /Notifications\.deleteNotificationChannelAsync\(/,
    /reminder-silent/,
    /reminder-alerts/,
  ]);
});

test('notification scheduling reports permission and native scheduling failures', () => {
  assertSourceIncludes(source, [
    /notification-permission-denied/,
    /target-time-passed/,
    /scheduling-failed/,
    /previous-scheduling-failed/,
    /permissionMode/,
  ]);
  assert.equal(source.includes('exact-alarm-permission-required'), false);
});

test('target notification is scheduled before the optional previous notification', () => {
  const targetIndex = source.indexOf('targetNotificationId = await scheduleIfFuture');
  const previousIndex = source.indexOf('previousNotificationId = await scheduleIfFuture');

  assert.equal(targetIndex >= 0, true);
  assert.equal(previousIndex > targetIndex, true);
});

test('notification gateway can replace target and previous notifications independently', () => {
  assertSourceIncludes(source, [
    /scheduleTargetReminderNotification/,
    /schedulePreviousReminderNotification/,
    /cancelScheduledReminderNotification/,
    /scheduleTarget: scheduleTargetReminderNotification/,
    /schedulePrevious: schedulePreviousReminderNotification/,
    /cancelOne: cancelScheduledReminderNotification/,
  ]);
});

test('target and previous notification contents are shared by single, full, and test scheduling paths', () => {
  assertSourceIncludes(source, [
    /buildTargetNotificationContent/,
    /buildPreviousNotificationContent/,
  ]);
  assert.equal(source.match(/buildTargetNotificationContent\(reminder\)/g)?.length, 2);
  assert.equal(source.match(/buildPreviousNotificationContent\(reminder\)/g)?.length, 2);
  assert.equal(source.match(/buildTargetNotificationContent\(/g)?.length, 3);
  assert.equal(source.match(/buildPreviousNotificationContent\(/g)?.length, 3);
  assert.equal(source.includes("title: '通知テスト 当日'"), false);
  assert.equal(source.includes("title: '通知テスト 前日'"), false);
  assert.equal(/body: `「\$\{reminder\.title\}」の時間をお知らせします`/.test(source), false);
});

test('notification cancellation surfaces native failures', () => {
  assertSourceIncludes(source, [
    /await Notifications\.cancelScheduledNotificationAsync\(notificationId\)/,
    /console\.warn\('Failed to cancel notification', error\)/,
    /throw error/,
  ]);
});
