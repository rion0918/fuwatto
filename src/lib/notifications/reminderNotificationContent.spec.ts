import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildPreviousNotificationContent,
  buildTargetNotificationContent,
} from './reminderNotificationContent';

test('builds previous notification content with local 24h time for timed reminders', () => {
  const content = buildPreviousNotificationContent({
    title: '歯医者',
    allDay: false,
    targetNotifyAt: new Date(2026, 6, 14, 10, 0).toISOString(),
  });

  assert.deepEqual(content, {
    title: '明日 10:00｜歯医者',
    body: '明日の準備を、今のうちに。',
  });
});

test('builds previous notification content without clock time for all-day reminders', () => {
  const content = buildPreviousNotificationContent({
    title: 'クリーニングを受け取る',
    allDay: true,
    targetNotifyAt: new Date(2026, 6, 14, 9, 0).toISOString(),
  });

  assert.deepEqual(content, {
    title: '明日｜クリーニングを受け取る',
    body: '明日の準備を、今のうちに。',
  });
});

test('builds target notification content with local 24h time for timed reminders', () => {
  const content = buildTargetNotificationContent({
    title: '歯医者',
    allDay: false,
    targetNotifyAt: new Date(2026, 6, 14, 10, 0).toISOString(),
  });

  assert.deepEqual(content, {
    title: '今日 10:00｜歯医者',
    body: '予定の時間になりました。',
  });
});

test('builds target notification content without notification trigger time for all-day reminders', () => {
  const content = buildTargetNotificationContent({
    title: 'クリーニングを受け取る',
    allDay: true,
    targetNotifyAt: new Date(2026, 6, 14, 9, 0).toISOString(),
  });

  assert.deepEqual(content, {
    title: '今日｜クリーニングを受け取る',
    body: '今日の予定をお知らせします。',
  });
});

test('formats zero-padded local 24h times and preserves reminder titles verbatim', () => {
  const morning = buildPreviousNotificationContent({
    title: 'ゴミ出し（燃えるゴミ）',
    targetNotifyAt: new Date(2026, 6, 14, 8, 5).toISOString(),
  });
  const lateNight = buildTargetNotificationContent({
    title: '明日の資料を送る',
    allDay: false,
    targetNotifyAt: new Date(2026, 6, 14, 23, 59).toISOString(),
  });

  assert.equal(morning.title, '明日 08:05｜ゴミ出し（燃えるゴミ）');
  assert.equal(lateNight.title, '今日 23:59｜明日の資料を送る');
});
