import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Reminder } from '../domain/reminder';
import {
  applyReminderScheduleAllDayChange,
  createReminderScheduleDraft,
  evaluateReminderScheduleDraft,
  resolveDefaultTimeForScheduleDate,
} from './reminderScheduleEditor';

const reminder = {
  targetAt: new Date(2030, 4, 12, 8, 15).toISOString(),
} satisfies Pick<Reminder, 'targetAt'>;

test('schedule editor creates a local date and time draft', () => {
  assert.deepEqual(createReminderScheduleDraft(reminder), {
    targetDate: '2030-05-12',
    targetTime: '08:15',
  });
});

test('schedule editor identifies future target and past previous notification', () => {
  const evaluated = evaluateReminderScheduleDraft(
    { targetDate: '2030-05-15', targetTime: '08:15' },
    '20:00',
    new Date(2030, 4, 14, 21),
  );

  assert.equal(evaluated.isValid, true);
  assert.equal(evaluated.isTargetFuture, true);
  assert.equal(evaluated.isPreviousFuture, false);
  assert.equal(evaluated.schedule?.previousNotifyAt.getDate(), 14);
});

test('schedule editor rejects a past target and malformed draft', () => {
  const past = evaluateReminderScheduleDraft(
    { targetDate: '2030-05-14', targetTime: '08:15' },
    '20:00',
    new Date(2030, 4, 14, 9),
  );
  const malformed = evaluateReminderScheduleDraft(
    { targetDate: '2030-02-31', targetTime: '08:15' },
    '20:00',
    new Date(2030, 4, 14, 9),
  );

  assert.equal(past.isValid, true);
  assert.equal(past.isTargetFuture, false);
  assert.equal(malformed.isValid, false);
});

test('schedule editor replaces 00:00 with the next available time for today all-day reminders', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2030, 4, 12, 10, 0) });

  assert.deepEqual(
    createReminderScheduleDraft({
      targetAt: new Date(2030, 4, 12, 0, 0).toISOString(),
      allDay: true,
    }),
    {
      targetDate: '2030-05-12',
      targetTime: '12:00',
      allDay: true,
    },
  );
});

test('schedule editor replaces 00:00 with default morning time for future all-day reminders', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2030, 4, 12, 10, 0) });

  assert.deepEqual(
    createReminderScheduleDraft({
      targetAt: new Date(2030, 4, 13, 0, 0).toISOString(),
      allDay: true,
    }),
    {
      targetDate: '2030-05-13',
      targetTime: '08:00',
      allDay: true,
    },
  );
});

test('resolveDefaultTimeForScheduleDate handles presets, late-night boundaries, and custom presets', () => {
  const customPresets = [
    { label: '朝', time: '07:15' },
    { label: '昼', time: '12:30' },
    { label: '夕', time: '18:00' },
    { label: '夜', time: '21:00' },
  ];

  assert.equal(
    resolveDefaultTimeForScheduleDate('2030-05-12', customPresets, new Date(2030, 4, 12, 10, 0)),
    '12:30',
  );
  assert.equal(
    resolveDefaultTimeForScheduleDate('2030-05-12', customPresets, new Date(2030, 4, 12, 22, 0)),
    '22:05',
  );
  assert.equal(
    resolveDefaultTimeForScheduleDate('2030-05-12', customPresets, new Date(2030, 4, 12, 23, 57)),
    '23:58',
  );
  assert.equal(
    resolveDefaultTimeForScheduleDate(
      '2030-05-12',
      customPresets,
      new Date(2030, 4, 12, 23, 59, 10),
    ),
    '07:15',
  );
  assert.equal(
    resolveDefaultTimeForScheduleDate('2030-05-13', customPresets, new Date(2030, 4, 12, 22, 0)),
    '07:15',
  );
});

test('applyReminderScheduleAllDayChange fills default future time unless explicit time was set', () => {
  const now = new Date(2030, 4, 12, 10, 0);

  assert.deepEqual(
    applyReminderScheduleAllDayChange(
      { targetDate: '2030-05-12', targetTime: '00:00', allDay: true },
      false,
      { hasExplicitTime: false, now },
    ),
    { targetDate: '2030-05-12', targetTime: '12:00', allDay: false },
  );

  assert.deepEqual(
    applyReminderScheduleAllDayChange(
      { targetDate: '2030-05-13', targetTime: '00:00', allDay: true },
      false,
      { hasExplicitTime: false, now },
    ),
    { targetDate: '2030-05-13', targetTime: '08:00', allDay: false },
  );

  assert.deepEqual(
    applyReminderScheduleAllDayChange(
      { targetDate: '2030-05-12', targetTime: '15:30', allDay: true },
      false,
      { hasExplicitTime: true, now },
    ),
    { targetDate: '2030-05-12', targetTime: '15:30', allDay: false },
  );
});

test('evaluateReminderScheduleDraft applies updated shared previousNotifyTime', () => {
  const evaluated = evaluateReminderScheduleDraft(
    { targetDate: '2030-05-15', targetTime: '14:00' },
    '18:30',
    new Date(2030, 4, 12, 10, 0),
  );

  assert.equal(evaluated.isValid, true);
  assert.equal(evaluated.isTargetFuture, true);
  assert.equal(evaluated.isPreviousFuture, true);
  assert.equal(evaluated.schedule?.previousNotifyAt.getHours(), 18);
  assert.equal(evaluated.schedule?.previousNotifyAt.getMinutes(), 30);
});
