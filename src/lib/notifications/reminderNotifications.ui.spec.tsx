import type { Reminder } from '../../features/reminders/domain/reminder';

const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockScheduleNotificationAsync = jest.fn();
const mockCancelScheduledNotificationAsync = jest.fn();
const mockGetAllScheduledNotificationsAsync = jest.fn();
const mockSetNotificationHandler = jest.fn();
const mockSetNotificationChannelAsync = jest.fn();
const mockDeleteNotificationChannelAsync = jest.fn();
const mockGetLastNotificationResponse = jest.fn();
const mockClearLastNotificationResponse = jest.fn();
const mockRemoveNotificationResponseSubscription = jest.fn();
let mockNotificationResponseListener: ((response: unknown) => void) | null = null;
let mockPlatformOs: 'ios' | 'android' = 'ios';

jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  SchedulableTriggerInputTypes: {
    DATE: 'date',
    TIME_INTERVAL: 'timeInterval',
  },
  AndroidImportance: {
    DEFAULT: 3,
    HIGH: 4,
  },
  AndroidNotificationPriority: {
    HIGH: 'high',
  },
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  cancelScheduledNotificationAsync: (...args: unknown[]) =>
    mockCancelScheduledNotificationAsync(...args),
  getAllScheduledNotificationsAsync: (...args: unknown[]) =>
    mockGetAllScheduledNotificationsAsync(...args),
  setNotificationHandler: (...args: unknown[]) => mockSetNotificationHandler(...args),
  setNotificationChannelAsync: (...args: unknown[]) => mockSetNotificationChannelAsync(...args),
  deleteNotificationChannelAsync: (...args: unknown[]) =>
    mockDeleteNotificationChannelAsync(...args),
  addNotificationResponseReceivedListener: (listener: (response: unknown) => void) => {
    mockNotificationResponseListener = listener;
    return { remove: mockRemoveNotificationResponseSubscription };
  },
  getLastNotificationResponse: (...args: unknown[]) => mockGetLastNotificationResponse(...args),
  clearLastNotificationResponse: (...args: unknown[]) => mockClearLastNotificationResponse(...args),
}));

jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatformOs;
    },
  },
}));

const {
  REMINDER_NOTIFICATION_CHANNEL_ID,
  cancelReminderNotifications,
  configureAndroidNotificationChannels,
  configureNotificationHandler,
  deleteLegacyAndroidNotificationChannels,
  extractReminderIdFromNotificationResponse,
  getLegacyScheduledNotificationIds,
  schedulePreviousReminderNotification,
  scheduleReminderNotifications,
  scheduleTargetReminderNotification,
  scheduleTestReminderNotifications,
  subscribeReminderNotificationResponses,
} =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./reminderNotifications') as typeof import('./reminderNotifications');

function createReminder(overrides: Partial<Reminder> = {}): Reminder {
  const now = Date.now();
  const targetDate = new Date(now + 48 * 60 * 60 * 1000);
  targetDate.setHours(10, 0, 0, 0);
  const previousDate = new Date(targetDate.getTime() - 14 * 60 * 60 * 1000);

  return {
    id: 'reminder-1',
    title: '歯医者',
    allDay: false,
    targetAt: targetDate.toISOString(),
    previousNotifyAt: previousDate.toISOString(),
    targetNotifyAt: targetDate.toISOString(),
    expiresAt: targetDate.toISOString(),
    previousNotificationId: null,
    targetNotificationId: null,
    status: 'active',
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    ...overrides,
  };
}

describe('reminderNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatformOs = 'ios';
    mockNotificationResponseListener = null;
    mockGetLastNotificationResponse.mockReturnValue(null);
    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    mockScheduleNotificationAsync
      .mockResolvedValueOnce('notif-target')
      .mockResolvedValueOnce('notif-previous');
  });

  it('schedules target and previous timed notifications with role-oriented copy', async () => {
    const reminder = createReminder();

    const result = await scheduleReminderNotifications(reminder);

    expect(result).toEqual({
      status: 'scheduled',
      ids: {
        previousNotificationId: 'notif-previous',
        targetNotificationId: 'notif-target',
      },
    });
    expect(mockScheduleNotificationAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        content: expect.objectContaining({
          title: '今日 10:00｜歯医者',
          body: '予定の時間になりました。',
          sound: true,
          data: { reminderId: 'reminder-1' },
        }),
      }),
    );
    expect(mockScheduleNotificationAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        content: expect.objectContaining({
          title: '明日 10:00｜歯医者',
          body: '明日の準備を、今のうちに。',
          sound: true,
          data: { reminderId: 'reminder-1' },
        }),
      }),
    );
  });

  it('schedules identical copy across bulk and single scheduling for all-day reminders', async () => {
    const targetDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
    targetDate.setHours(9, 0, 0, 0);
    const reminder = createReminder({
      title: 'クリーニングを受け取る',
      allDay: true,
      targetNotifyAt: targetDate.toISOString(),
    });

    await scheduleReminderNotifications(reminder);
    const bulkCalls = [...mockScheduleNotificationAsync.mock.calls];

    mockScheduleNotificationAsync.mockReset();
    mockScheduleNotificationAsync
      .mockResolvedValueOnce('single-target')
      .mockResolvedValueOnce('single-previous');

    const targetResult = await scheduleTargetReminderNotification(reminder, {
      permissionMode: 'check-only',
    });
    const previousResult = await schedulePreviousReminderNotification(reminder, {
      permissionMode: 'check-only',
    });

    expect(targetResult).toEqual({ status: 'scheduled', notificationId: 'single-target' });
    expect(previousResult).toEqual({ status: 'scheduled', notificationId: 'single-previous' });

    expect(mockScheduleNotificationAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        content: expect.objectContaining({
          title: '今日｜クリーニングを受け取る',
          body: '今日の予定をお知らせします。',
        }),
      }),
    );
    expect(mockScheduleNotificationAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        content: expect.objectContaining({
          title: '明日｜クリーニングを受け取る',
          body: '明日の準備を、今のうちに。',
        }),
      }),
    );
    expect(mockScheduleNotificationAsync.mock.calls[0][0].content).toEqual(bulkCalls[0][0].content);
    expect(mockScheduleNotificationAsync.mock.calls[1][0].content).toEqual(bulkCalls[1][0].content);
  });

  it('skips previous notification when previousNotifyAt is in the past', async () => {
    const reminder = createReminder({
      previousNotifyAt: new Date(Date.now() - 60 * 1000).toISOString(),
    });

    const bulkResult = await scheduleReminderNotifications(reminder);
    expect(bulkResult).toEqual({
      status: 'scheduled',
      ids: {
        previousNotificationId: null,
        targetNotificationId: 'notif-target',
      },
    });
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);

    const singlePrevious = await schedulePreviousReminderNotification(reminder);
    expect(singlePrevious).toEqual({
      status: 'skipped',
      reason: 'time-passed',
      notificationId: null,
    });
  });

  it('returns not-scheduled when permission is denied', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });
    const reminder = createReminder();

    const result = await scheduleReminderNotifications(reminder, { permissionMode: 'check-only' });

    expect(result).toEqual({
      status: 'not-scheduled',
      reason: 'notification-permission-denied',
      ids: {
        previousNotificationId: null,
        targetNotificationId: null,
      },
    });
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('returns partial status when previous notification scheduling throws', async () => {
    mockScheduleNotificationAsync.mockReset();
    mockScheduleNotificationAsync
      .mockResolvedValueOnce('notif-target')
      .mockRejectedValueOnce(new Error('native failure'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const reminder = createReminder();

    const result = await scheduleReminderNotifications(reminder);

    expect(result).toEqual({
      status: 'partial',
      reason: 'previous-scheduling-failed',
      ids: {
        previousNotificationId: null,
        targetNotificationId: 'notif-target',
      },
    });
    warnSpy.mockRestore();
  });

  it('cancels both scheduled notification ids for a reminder', async () => {
    mockCancelScheduledNotificationAsync.mockResolvedValue(undefined);
    const reminder = createReminder({
      previousNotificationId: 'prev-1',
      targetNotificationId: 'target-1',
    });

    await cancelReminderNotifications(reminder);

    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('prev-1');
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('target-1');
  });

  it('schedules test notifications using the refreshed timed and all-day copy', async () => {
    const timedReminder = createReminder();
    const timedResult = await scheduleTestReminderNotifications(timedReminder);

    expect(timedResult).toEqual({
      status: 'scheduled',
      ids: {
        previousNotificationId: 'notif-previous',
        targetNotificationId: 'notif-target',
      },
    });
    expect(mockScheduleNotificationAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        content: expect.objectContaining({
          title: '今日 10:00｜歯医者',
          body: '予定の時間になりました。',
        }),
        trigger: expect.objectContaining({
          type: 'timeInterval',
          seconds: 20,
        }),
      }),
    );
    expect(mockScheduleNotificationAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        content: expect.objectContaining({
          title: '明日 10:00｜歯医者',
          body: '明日の準備を、今のうちに。',
        }),
        trigger: expect.objectContaining({
          type: 'timeInterval',
          seconds: 10,
        }),
      }),
    );

    mockScheduleNotificationAsync.mockReset();
    mockScheduleNotificationAsync
      .mockResolvedValueOnce('allday-target')
      .mockResolvedValueOnce('allday-previous');

    await scheduleTestReminderNotifications(
      createReminder({
        title: 'クリーニングを受け取る',
        allDay: true,
      }),
    );

    expect(mockScheduleNotificationAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        content: expect.objectContaining({
          title: '今日｜クリーニングを受け取る',
          body: '今日の予定をお知らせします。',
        }),
      }),
    );
    expect(mockScheduleNotificationAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        content: expect.objectContaining({
          title: '明日｜クリーニングを受け取る',
          body: '明日の準備を、今のうちに。',
        }),
      }),
    );
  });

  it('configures Android HIGH importance channel and foreground priority for heads-up alerts', async () => {
    mockPlatformOs = 'android';
    configureNotificationHandler();

    const handlerArg = mockSetNotificationHandler.mock.calls[0][0];
    await expect(handlerArg.handleNotification()).resolves.toEqual(
      expect.objectContaining({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        priority: 'high',
      }),
    );

    await configureAndroidNotificationChannels();
    expect(mockSetNotificationChannelAsync).toHaveBeenCalledWith(
      REMINDER_NOTIFICATION_CHANNEL_ID,
      expect.objectContaining({
        name: 'リマインダー',
        importance: 4,
        sound: 'default',
        enableVibrate: true,
        showBadge: false,
      }),
    );

    const reminder = createReminder();
    await scheduleReminderNotifications(reminder);
    expect(mockScheduleNotificationAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        content: expect.objectContaining({ priority: 'high' }),
        trigger: expect.objectContaining({ channelId: 'reminder-alerts-high' }),
      }),
    );
    expect(mockScheduleNotificationAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        content: expect.objectContaining({ priority: 'high' }),
        trigger: expect.objectContaining({ channelId: 'reminder-alerts-high' }),
      }),
    );
    mockPlatformOs = 'ios';
  });

  it('detects legacy silent and default-importance scheduled notifications and deletes legacy channels', async () => {
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'legacy-silent', trigger: { channelId: 'reminder-silent' } },
      { identifier: 'legacy-default', trigger: { channelId: 'reminder-alerts' } },
      { identifier: 'current-high', trigger: { channelId: 'reminder-alerts-high' } },
    ]);

    const legacyIds = await getLegacyScheduledNotificationIds([
      'legacy-silent',
      'legacy-default',
      'current-high',
    ]);
    expect(legacyIds).toEqual(new Set(['legacy-silent', 'legacy-default']));

    mockPlatformOs = 'android';
    mockDeleteNotificationChannelAsync.mockResolvedValue(undefined);
    await deleteLegacyAndroidNotificationChannels();
    expect(mockDeleteNotificationChannelAsync).toHaveBeenCalledWith('reminder-silent');
    expect(mockDeleteNotificationChannelAsync).toHaveBeenCalledWith('reminder-alerts');
    mockPlatformOs = 'ios';
  });

  it('delivers warm notification taps with reminderId and clears the last response', () => {
    const onReminderTap = jest.fn();
    const unsubscribe = subscribeReminderNotificationResponses(onReminderTap);

    mockNotificationResponseListener?.({
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
      notification: {
        date: 1700000001,
        request: {
          identifier: 'notif-warm-1',
          content: { data: { reminderId: 'rem-1' } },
          trigger: null,
        },
      },
    });

    expect(onReminderTap).toHaveBeenCalledTimes(1);
    expect(onReminderTap).toHaveBeenCalledWith('rem-1', { isInitial: false });
    expect(mockClearLastNotificationResponse).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(mockRemoveNotificationResponseSubscription).toHaveBeenCalledTimes(1);
  });

  it('delivers cold-start notification taps once even when the listener replays the same response, while allowing later taps for the same reminder', () => {
    const coldResponse = {
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
      notification: {
        date: 1700000000,
        request: {
          identifier: 'notif-cold',
          content: { data: { reminderId: 'rem-cold' } },
          trigger: null,
        },
      },
    };
    mockGetLastNotificationResponse.mockReturnValueOnce(coldResponse);
    const onReminderTap = jest.fn();

    subscribeReminderNotificationResponses(onReminderTap);

    expect(onReminderTap).toHaveBeenCalledTimes(1);
    expect(onReminderTap).toHaveBeenLastCalledWith('rem-cold', { isInitial: true });
    expect(mockClearLastNotificationResponse).toHaveBeenCalledTimes(1);

    mockNotificationResponseListener?.(coldResponse);
    expect(onReminderTap).toHaveBeenCalledTimes(1);

    mockNotificationResponseListener?.({
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
      notification: {
        date: 1700000099,
        request: {
          identifier: 'notif-target',
          content: { data: { reminderId: 'rem-cold' } },
          trigger: null,
        },
      },
    });
    expect(onReminderTap).toHaveBeenCalledTimes(2);
    expect(onReminderTap).toHaveBeenLastCalledWith('rem-cold', { isInitial: false });
  });

  it('ignores non-default actions, invalid reminderId payloads, and native response errors safely', () => {
    const onReminderTap = jest.fn();
    mockGetLastNotificationResponse.mockImplementationOnce(() => {
      throw new Error('UnavailabilityError');
    });
    mockClearLastNotificationResponse.mockImplementation(() => {
      throw new Error('UnavailabilityError');
    });

    expect(
      extractReminderIdFromNotificationResponse({
        actionIdentifier: 'custom-action',
        notification: {
          date: 1700000000,
          request: {
            identifier: 'n1',
            content: { data: { reminderId: 'rem-1' } },
            trigger: null,
          },
        },
      } as never),
    ).toBeNull();
    expect(
      extractReminderIdFromNotificationResponse({
        actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
        notification: {
          date: 1700000000,
          request: {
            identifier: 'n2',
            content: { data: { reminderId: '   ' } },
            trigger: null,
          },
        },
      } as never),
    ).toBeNull();

    subscribeReminderNotificationResponses(onReminderTap);

    mockNotificationResponseListener?.({
      actionIdentifier: 'dismiss',
      notification: {
        date: 1700000002,
        request: { identifier: 'n3', content: { data: { reminderId: 'rem-1' } }, trigger: null },
      },
    });
    mockNotificationResponseListener?.({
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
      notification: {
        date: 1700000003,
        request: { identifier: 'n4', content: { data: { reminderId: 123 } }, trigger: null },
      },
    });
    mockNotificationResponseListener?.({
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
      notification: {
        date: 1700000004,
        request: { identifier: 'n5', content: { data: {} }, trigger: null },
      },
    });
    expect(onReminderTap).not.toHaveBeenCalled();

    mockNotificationResponseListener?.({
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
      notification: {
        date: 1700000005,
        request: { identifier: 'n6', content: { data: { reminderId: 'rem-ok' } }, trigger: null },
      },
    });
    expect(onReminderTap).toHaveBeenCalledTimes(1);
    expect(onReminderTap).toHaveBeenCalledWith('rem-ok', { isInitial: false });
  });
});
