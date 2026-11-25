import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, AppState, BackHandler, Linking, Platform, type AppStateStatus } from 'react-native';

import type { Reminder, ReminderDepartureNotice } from '../domain/reminder';
import { useReminderUiStore as mockUseReminderUiStore } from '../stores/reminderUiStore';
import type { AppSettings, UpdateAppSettingsInput } from '../../settings/domain/appSettings';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};
let mockRouteParams: { action?: string; id?: string; intent?: string } = {};
let mockFocusCallbacks: (() => undefined | (() => void))[] = [];
let mockAppStateListeners = new Set<(state: AppStateStatus) => void>();
let mockBackListeners = new Set<() => boolean | null | undefined>();

let mockAnalyticsConfigured = true;
const mockSetCaptureEnabled = jest.fn(async () => true);
const mockCaptureScreen = jest.fn();
const mockRaiseToSpeakPrepare = jest.fn();
const mockRefreshReminders = jest.fn(async () => ({ data: mockReminders, error: null }));
const mockCreateReminder = jest.fn();
const mockDeleteReminder = jest.fn();
const mockRecordQuickAddCompleted = jest.fn(async () => false);
const mockRecordBubbleCompleted = jest.fn(async () => false);
const mockEnsureFirstSeen = jest.fn(async () => {});

let mockReminders: Reminder[] = [];
let mockBoardReminders: Reminder[] = [];
let mockBoardOnDeleteMotionComplete: ((id: string, phase: string) => void) | null = null;
let mockInputSheetOnSave: ((title: string) => Promise<void>) | null = null;
let mockDetailSheetOnDelete: ((reminder: Reminder) => Promise<void>) | null = null;
let mockDepartureNotices: ReminderDepartureNotice[] = [];
let mockDepartureSheetVisible = false;
let mockSettingsState: AppSettings | undefined;
let mockSettingsUpdateImpl: ((patch: UpdateAppSettingsInput) => Promise<void>) | null = null;
const mockSettingsUpdate = jest.fn();
const mockUpdateAnalyticsConsent = jest.fn();

const mockSettingsListeners = new Set<(next: AppSettings | undefined) => void>();

let mockRaiseGestureOptions: {
  enabled: boolean;
  blocked: boolean;
  trackTiltProgress?: boolean;
  onStart: () => void | Promise<void>;
  onStop: (reason: 'portrait' | 'interrupted') => void;
} | null = null;
let mockSensorStatus: 'inactive' | 'waiting' | 'starting' | 'active' | 'unavailable' = 'active';
let mockSensorFailureReason:
  'sensor-unavailable' | 'subscription-error' | 'no-valid-sample' | null = null;
let mockTiltProgress: number | null = 0;
const mockRetrySensor = jest.fn();

let mockOpenedDetailReminderId: string | null = null;

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    id: 'default',
    previousNotifyTime: '20:00',
    allDayNotifyTime: '09:00',
    defaultTargetTime: '08:00',
    noonTargetTime: '12:00',
    eveningTargetTime: '18:00',
    nightTargetTime: '20:00',
    autoDeleteEnabled: true,
    notificationPermissionIntroSeen: true,
    raiseToSpeakEnabled: false,
    raiseToSpeakIntroSeen: false,
    raiseToSpeakOnboardingCompleted: false,
    analyticsConsent: 'denied',
    theme: 'lavender',
    ...overrides,
  };
}

function mockSetSettingsState(next: AppSettings | undefined) {
  mockSettingsState = next;
  for (const listener of mockSettingsListeners) {
    listener(next);
  }
}

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => mockRouter,
    usePathname: () => '/',
    useLocalSearchParams: () => mockRouteParams,
    useFocusEffect: (callback: () => undefined | (() => void)) => {
      React.useEffect(() => {
        mockFocusCallbacks.push(callback);
        return callback();
      }, [callback]);
    },
  };
});

jest.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success' },
  notificationAsync: jest.fn(async () => {}),
  selectionAsync: jest.fn(async () => {}),
}));

jest.mock('expo-linear-gradient', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LinearGradient: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

jest.mock('../../../bootstrap/appServicesContext', () => ({
  useAppServices: () => ({
    analytics: {
      configured: mockAnalyticsConfigured,
      setCaptureEnabled: mockSetCaptureEnabled,
      captureScreen: mockCaptureScreen,
      captureQuickAddOpened: jest.fn(),
      captureQuickAddSubmitted: jest.fn(),
      captureQuickAddClosed: jest.fn(),
      captureReminderCreated: jest.fn(),
      captureReminderCreationFailed: jest.fn(),
      captureReminderDeleted: jest.fn(),
      captureReminderEdited: jest.fn(),
      captureNotificationPermissionUpdated: jest.fn(),
      captureProGateReached: jest.fn(),
      captureProPaywallRequested: jest.fn(),
      captureProPaywallResult: jest.fn(),
    },
    notificationSettings: {
      getNotificationPermissionStatus: jest.fn(async () => ({
        status: 'granted',
        label: '許可済み',
        canAskAgain: false,
      })),
      requestNotificationPermissions: jest.fn(),
    },
    purchases: {
      getProAccessState: jest.fn(async () => 'free'),
      presentProPaywallIfNeeded: jest.fn(async () => 'cancelled'),
    },
    raiseToSpeak: {
      prepare: (...args: unknown[]) => mockRaiseToSpeakPrepare(...args),
    },
    storeReview: {
      ensureFirstSeen: mockEnsureFirstSeen,
      recordQuickAddCompleted: mockRecordQuickAddCompleted,
      recordBubbleCompleted: mockRecordBubbleCompleted,
    },
  }),
}));

jest.mock('../../settings/presentation/useAppSettingsQuery', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useAppSettingsQuery: () => {
      const [settings, setSettings] = React.useState<AppSettings | undefined>(mockSettingsState);

      React.useEffect(() => {
        mockSettingsListeners.add(setSettings);
        setSettings(mockSettingsState);
        return () => {
          mockSettingsListeners.delete(setSettings);
        };
      }, []);

      const update = React.useCallback(async (patch: UpdateAppSettingsInput) => {
        mockSettingsUpdate(patch);
        if (mockSettingsUpdateImpl) {
          await mockSettingsUpdateImpl(patch);
        }
        const next = mockSettingsState ? { ...mockSettingsState, ...patch } : undefined;
        mockSetSettingsState(next);
        return next;
      }, []);

      const updateAnalyticsConsent = React.useCallback(
        async (analyticsConsent: AppSettings['analyticsConsent']) => {
          mockUpdateAnalyticsConsent(analyticsConsent);
          return update({ analyticsConsent });
        },
        [update],
      );

      return {
        settings,
        loading: settings === undefined,
        refresh: jest.fn(async () => ({ data: mockSettingsState })),
        update,
        updateAnalyticsConsent,
      };
    },
  };
});

jest.mock('../presentation/useRemindersQuery', () => ({
  useRemindersQuery: () => ({
    departureNotices: mockDepartureNotices,
    departureNoticeError: null,
    refreshDepartureNotices: jest.fn(),
    acknowledgeDepartureNotices: jest.fn(),
    isAcknowledgingDepartures: false,
    reminders: mockReminders,
    loading: false,
    error: null,
    refresh: mockRefreshReminders,
    removeReminder: jest.fn(),
    removeReminders: jest.fn(),
    createReminder: mockCreateReminder,
    deleteReminder: mockDeleteReminder,
    deleteReminders: jest.fn(),
    updateReminderTitle: jest.fn(),
    updateReminderSchedule: jest.fn(),
    isCreating: false,
    isDeletingReminders: false,
  }),
}));

jest.mock('../stores/notificationDevStore', () => ({
  useNotificationDevStore: (
    selector: (state: { isNotificationTestModeEnabled: boolean }) => unknown,
  ) => selector({ isNotificationTestModeEnabled: false }),
}));

jest.mock('../hooks/useRaiseToSpeakGesture', () => ({
  useRaiseToSpeakGesture: (options: typeof mockRaiseGestureOptions) => {
    mockRaiseGestureOptions = options;
    return {
      sensorStatus: mockSensorStatus,
      sensorFailureReason: mockSensorFailureReason,
      retrySensor: mockRetrySensor,
      tiltProgress: mockTiltProgress,
    };
  },
}));

jest.mock('../../../shared/components/AppScreen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    AppScreen: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});

jest.mock('../components/ReminderBubbleBoard', () => ({
  ReminderBubbleBoard: ({
    reminders,
    onDeleteMotionComplete,
  }: {
    reminders: Reminder[];
    onDeleteMotionComplete?: (id: string, phase: string) => void;
  }) => {
    mockBoardReminders = reminders;
    mockBoardOnDeleteMotionComplete = onDeleteMotionComplete ?? null;
    return null;
  },
}));

jest.mock('../components/ReminderDepartureSheet', () => ({
  ReminderDepartureSheet: ({ visible }: { visible: boolean }) => {
    mockDepartureSheetVisible = visible;
    return null;
  },
}));

jest.mock('../components/ReminderInputSheet', () => ({
  ReminderInputSheet: ({ onSave }: { onSave?: (title: string) => Promise<void> }) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    mockInputSheetOnSave = onSave ?? null;
    const isOpen = mockUseReminderUiStore((state) => state.isQuickAddOpen);
    const inputMode = mockUseReminderUiStore((state) => state.quickAddInputMode);
    return isOpen ? React.createElement(Text, { testID: 'quick-add-open' }, inputMode) : null;
  },
}));

jest.mock('../components/ReminderDetailSheet', () => ({
  ReminderDetailSheet: ({
    reminder,
    onDelete,
  }: {
    reminder: Reminder | null;
    onDelete?: (reminder: Reminder) => Promise<void>;
  }) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    mockOpenedDetailReminderId = reminder?.id ?? null;
    mockDetailSheetOnDelete = onDelete ?? null;
    return reminder ? React.createElement(Text, { testID: 'detail-open' }, reminder.id) : null;
  },
}));

jest.mock('../components/NotificationPermissionIntroModal', () => ({
  NotificationPermissionIntroModal: () => null,
}));

const { HomeScreen } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./HomeScreen') as typeof import('./HomeScreen');
const { AnalyticsConsentGate } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../settings/components/AnalyticsConsentGate') as typeof import('../../settings/components/AnalyticsConsentGate');

describe('HomeScreen first-run raise-to-speak onboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {};
    mockFocusCallbacks = [];
    mockAppStateListeners = new Set();
    mockBackListeners = new Set();
    mockAnalyticsConfigured = true;
    mockReminders = [];
    mockBoardOnDeleteMotionComplete = null;
    mockInputSheetOnSave = null;
    mockDetailSheetOnDelete = null;
    mockDepartureNotices = [];
    mockDepartureSheetVisible = false;
    mockSettingsState = makeSettings();
    mockSettingsUpdateImpl = null;
    mockRaiseGestureOptions = null;
    mockSensorStatus = 'active';
    mockSensorFailureReason = null;
    mockTiltProgress = 0;
    mockOpenedDetailReminderId = null;
    mockRaiseToSpeakPrepare.mockResolvedValue({ status: 'ready' });
    mockCreateReminder.mockResolvedValue({ notification: { status: 'scheduled' } });
    mockDeleteReminder.mockResolvedValue(true);
    mockUseReminderUiStore.getState().closeQuickAdd();

    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      mockAppStateListeners.add(listener);
      return {
        remove: () => {
          mockAppStateListeners.delete(listener);
        },
      };
    });
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, listener) => {
      mockBackListeners.add(listener);
      return {
        remove: () => {
          mockBackListeners.delete(listener);
        },
      };
    });
    jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  });

  afterEach(() => {
    mockSettingsListeners.clear();
    jest.restoreAllMocks();
  });

  it('shows AnalyticsConsentGate before raise-to-speak onboarding and opens onboarding even when analytics is denied', async () => {
    mockSetSettingsState(
      makeSettings({
        analyticsConsent: 'unknown',
        raiseToSpeakOnboardingCompleted: false,
      }),
    );

    const view = await render(
      <AnalyticsConsentGate>
        <HomeScreen />
      </AnalyticsConsentGate>,
    );

    expect(view.getByText('匿名の利用状況を共有しますか？')).toBeOnTheScreen();
    expect(view.queryByText('傾けて、声でメモ')).toBeNull();

    await fireEvent.press(view.getByLabelText('匿名の利用状況を共有しない'));

    await waitFor(() => {
      expect(mockUpdateAnalyticsConsent).toHaveBeenCalledWith('denied');
      expect(view.getByText('傾けて、声でメモ')).toBeOnTheScreen();
    });
  });

  it('skips directly to raise-to-speak onboarding when analytics is not configured', async () => {
    mockAnalyticsConfigured = false;
    mockSetSettingsState(
      makeSettings({
        analyticsConsent: 'unknown',
        raiseToSpeakOnboardingCompleted: false,
      }),
    );

    const view = await render(
      <AnalyticsConsentGate>
        <HomeScreen />
      </AnalyticsConsentGate>,
    );

    expect(view.queryByText('匿名の利用状況を共有しますか？')).toBeNull();
    expect(view.getByText('傾けて、声でメモ')).toBeOnTheScreen();
  });

  it('persists skipped onboarding on オフのままはじめる and allows in-screen retry if saving fails', async () => {
    mockSettingsUpdateImpl = async () => {
      throw new Error('disk full');
    };
    const view = await render(<HomeScreen />);

    await fireEvent.press(view.getByText('オフのままはじめる'));

    await waitFor(() => {
      expect(view.getByText('傾けて、声でメモ')).toBeOnTheScreen();
      expect(view.getByText(/保存できませんでした/)).toBeOnTheScreen();
    });

    mockSettingsUpdateImpl = null;
    await fireEvent.press(view.getByText('オフのままはじめる'));

    await waitFor(() => {
      expect(mockSettingsUpdate).toHaveBeenLastCalledWith({
        raiseToSpeakEnabled: false,
        raiseToSpeakOnboardingCompleted: true,
      });
      expect(view.queryByText('傾けて、声でメモ')).toBeNull();
    });
  });

  it('completes practice, keeps Home voice input blocked during 準備できました, and closes only on はじめる', async () => {
    jest.useFakeTimers();
    try {
      const view = await render(<HomeScreen />);

      expect(mockRaiseGestureOptions?.blocked).toBe(true);

      await fireEvent.press(view.getByText('オンにして試す'));
      await waitFor(() => expect(mockRaiseToSpeakPrepare).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(view.getByText('動きを練習します。声は出さなくて大丈夫です')).toBeOnTheScreen(),
      );
      expect(mockRaiseGestureOptions?.enabled).toBe(true);
      expect(mockRaiseGestureOptions?.blocked).toBe(false);

      await act(async () => {
        await mockRaiseGestureOptions?.onStart();
      });
      expect(view.queryByTestId('quick-add-open')).toBeNull();
      expect(view.getByText('開始の動きを確認できました')).toBeOnTheScreen();

      await act(async () => {
        mockRaiseGestureOptions?.onStop('portrait');
      });

      await waitFor(() => {
        expect(mockSettingsUpdate).toHaveBeenCalledWith({
          raiseToSpeakEnabled: true,
          raiseToSpeakIntroSeen: true,
          raiseToSpeakOnboardingCompleted: true,
        });
        expect(view.getByText('準備できました')).toBeOnTheScreen();
      });
      expect(mockRaiseGestureOptions?.blocked).toBe(true);

      await act(async () => {
        jest.advanceTimersByTime(3_000);
      });
      expect(view.getByText('準備できました')).toBeOnTheScreen();

      await fireEvent.press(view.getByText('はじめる'));
      await waitFor(() => {
        expect(view.queryByText('準備できました')).toBeNull();
        expect(mockRaiseGestureOptions?.blocked).toBe(false);
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows settings link when permission is permanently denied and keeps raise-to-speak off', async () => {
    mockRaiseToSpeakPrepare.mockResolvedValue({
      status: 'permission-denied',
      canAskAgain: false,
    });
    const view = await render(<HomeScreen />);

    await fireEvent.press(view.getByText('オンにして試す'));

    await waitFor(() => {
      expect(view.getByText('端末の設定を開く')).toBeOnTheScreen();
      expect(view.getByText('もう一度試す')).toBeOnTheScreen();
      expect(view.getByText('オフのままはじめる')).toBeOnTheScreen();
    });
    expect(mockSettingsUpdate).not.toHaveBeenCalled();

    await fireEvent.press(view.getByText('端末の設定を開く'));
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  });

  it('returns to intro when practice is cancelled or backed out, and skips on intro Android back', async () => {
    const view = await render(<HomeScreen />);

    await fireEvent.press(view.getByText('オンにして試す'));
    await waitFor(() => expect(mockRaiseGestureOptions?.enabled).toBe(true));

    await fireEvent.press(view.getByLabelText('左右に傾けて音声入力の設定をキャンセル'));
    await waitFor(() => {
      expect(view.getByText('傾けて、声でメモ')).toBeOnTheScreen();
    });
    expect(mockSettingsUpdate).not.toHaveBeenCalled();

    const [backHandler] = [...mockBackListeners];
    expect(backHandler).toBeDefined();
    await act(async () => {
      backHandler();
    });

    await waitFor(() => {
      expect(mockSettingsUpdate).toHaveBeenCalledWith({
        raiseToSpeakEnabled: false,
        raiseToSpeakOnboardingCompleted: true,
      });
    });
  });

  it('resets practice phase to awaiting-tilt when backgrounded', async () => {
    const view = await render(<HomeScreen />);

    await fireEvent.press(view.getByText('オンにして試す'));
    await waitFor(() => expect(mockRaiseGestureOptions?.enabled).toBe(true));
    await act(async () => {
      await mockRaiseGestureOptions?.onStart();
    });
    expect(view.getByText('開始の動きを確認できました')).toBeOnTheScreen();

    await act(async () => {
      for (const listener of mockAppStateListeners) {
        listener('background');
      }
    });

    await waitFor(() => {
      expect(view.getByText('左右どちらかへ傾けてください')).toBeOnTheScreen();
    });
  });

  it('defers widget add deep link until onboarding closes', async () => {
    mockRouteParams = { action: 'add', intent: '1' };
    const view = await render(<HomeScreen />);

    expect(view.queryByTestId('quick-add-open')).toBeNull();

    await fireEvent.press(view.getByText('オフのままはじめる'));
    await waitFor(() => {
      expect(view.getByTestId('quick-add-open')).toBeOnTheScreen();
    });
  });

  it('keeps past reminders outside the floating board and opens them through their own entry', async () => {
    mockSettingsState = makeSettings({
      autoDeleteEnabled: false,
      raiseToSpeakOnboardingCompleted: true,
    });
    const future: Reminder = {
      id: 'future',
      title: 'これからの予定',
      targetAt: '2035-05-13T10:00:00.000Z',
      expiresAt: '2035-05-13T10:00:00.000Z',
      previousNotifyAt: '2035-05-12T20:00:00.000Z',
      targetNotifyAt: '2035-05-13T10:00:00.000Z',
      previousNotificationId: null,
      targetNotificationId: null,
      status: 'active',
      createdAt: '',
      updatedAt: '',
    };
    mockReminders = [
      future,
      { ...future, id: 'past', title: '過去の予定', status: 'expired' },
      {
        ...future,
        id: 'crossed',
        title: '時刻を過ぎた予定',
        expiresAt: '2000-01-01T00:00:00.000Z',
      },
    ];
    const view = await render(<HomeScreen />);
    expect(mockBoardReminders.map((item) => item.id)).toEqual(['future']);
    expect(view.getByText('過ぎた予定 2件')).toBeOnTheScreen();
    expect(view.queryByText('時刻を過ぎた泡を見返す')).toBeNull();
    await fireEvent.press(view.getByLabelText('過ぎた予定、2件を開く'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/reminders-list',
      params: { filter: 'past' },
    });
  });

  it('does not promote an expired reminder into the next reminder card when there are no upcoming plans', async () => {
    mockSettingsState = makeSettings({
      autoDeleteEnabled: false,
      raiseToSpeakOnboardingCompleted: true,
    });
    mockReminders = [
      {
        id: 'past',
        title: '過去の予定',
        targetAt: '2000-01-01T10:00:00.000Z',
        expiresAt: '2000-01-01T10:00:00.000Z',
        previousNotifyAt: '',
        targetNotifyAt: '',
        previousNotificationId: null,
        targetNotificationId: null,
        status: 'expired',
        createdAt: '',
        updatedAt: '',
      },
    ];
    const view = await render(<HomeScreen />);
    expect(mockBoardReminders).toEqual([]);
    expect(view.queryByText('次のリマインド')).toBeNull();
    expect(view.queryByText('期限済み')).toBeNull();
    expect(view.getByLabelText('過ぎた予定、1件を開く')).toBeOnTheScreen();
  });

  it('explains departed titles on the first home screen and opens their confirmation without blocking add', async () => {
    mockSettingsState = makeSettings({ raiseToSpeakOnboardingCompleted: true });
    mockDepartureNotices = [
      { id: 'first', title: '観葉植物に水をあげる', targetAt: '2000-01-01T10:00:00.000Z' },
      { id: 'second', title: '映画のチケットを取る', targetAt: '2000-01-01T09:00:00.000Z' },
    ];
    const view = await render(<HomeScreen />);
    expect(view.getByText('空へかえった泡')).toBeOnTheScreen();
    expect(view.getByText('観葉植物に水をあげる ほか1件')).toBeOnTheScreen();
    expect(mockDepartureSheetVisible).toBe(false);
    await fireEvent.press(view.getByLabelText('空へかえった泡、2件を開く'));
    expect(mockDepartureSheetVisible).toBe(true);
    expect(mockRaiseGestureOptions?.blocked).toBe(true);
  });

  it('opens the past reminder view from a widget only after onboarding completes', async () => {
    mockRouteParams = { action: 'past', intent: 'past-1' };
    const view = await render(<HomeScreen />);
    expect(mockRouter.push).not.toHaveBeenCalled();
    await fireEvent.press(view.getByText('オフのままはじめる'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/reminders-list',
        params: { filter: 'past' },
      }),
    );
  });

  it('defers widget view deep link until onboarding closes', async () => {
    const reminder: Reminder = {
      id: 'rem-1',
      title: '牛乳を買う',
      allDay: false,
      targetAt: '2026-11-16T08:00:00.000Z',
      previousNotifyAt: '2026-11-15T20:00:00.000Z',
      targetNotifyAt: '2026-11-16T08:00:00.000Z',
      expiresAt: '2026-11-16T23:59:59.999Z',
      previousNotificationId: null,
      targetNotificationId: null,
      status: 'active',
      createdAt: '2026-11-15T10:00:00.000Z',
      updatedAt: '2026-11-15T10:00:00.000Z',
    };
    mockReminders = [reminder];
    mockRouteParams = { action: 'view', id: 'rem-1', intent: '2' };
    const view = await render(<HomeScreen />);

    expect(mockRefreshReminders).toHaveBeenCalledTimes(1);
    expect(mockOpenedDetailReminderId).toBeNull();

    await fireEvent.press(view.getByText('オフのままはじめる'));
    await waitFor(() => {
      expect(mockRefreshReminders).toHaveBeenCalledTimes(2);
      expect(view.getByTestId('detail-open')).toHaveTextContent('rem-1');
    });
  });

  it('records clean quick add completions for store review when the sheet closes', async () => {
    mockSettingsState = makeSettings({
      raiseToSpeakOnboardingCompleted: true,
      notificationPermissionIntroSeen: true,
    });
    mockReminders = [
      {
        id: 'existing-1',
        title: '既存のリマインダー',
        allDay: false,
        targetAt: '2035-05-13T10:00:00.000Z',
        previousNotifyAt: '2035-05-12T20:00:00.000Z',
        targetNotifyAt: '2035-05-13T10:00:00.000Z',
        expiresAt: '2035-05-13T10:00:00.000Z',
        previousNotificationId: null,
        targetNotificationId: null,
        status: 'active',
        createdAt: '',
        updatedAt: '',
      },
    ];
    const view = await render(<HomeScreen />);

    await fireEvent.press(view.getByLabelText('リマインダーを追加'));
    await waitFor(() => expect(view.getByTestId('quick-add-open')).toBeOnTheScreen());

    await act(async () => {
      await mockInputSheetOnSave?.('牛乳を買う');
    });
    await act(async () => {
      mockUseReminderUiStore.getState().closeQuickAdd();
    });

    await waitFor(() => {
      expect(mockRecordQuickAddCompleted).toHaveBeenCalledWith(1, { eligibleToPrompt: true });
    });
  });

  it('marks quick add store review ineligible when saving triggered a notification alert', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSettingsState = makeSettings({
      raiseToSpeakOnboardingCompleted: true,
      notificationPermissionIntroSeen: true,
    });
    mockReminders = [
      {
        id: 'existing-1',
        title: '既存のリマインダー',
        allDay: false,
        targetAt: '2035-05-13T10:00:00.000Z',
        previousNotifyAt: '2035-05-12T20:00:00.000Z',
        targetNotifyAt: '2035-05-13T10:00:00.000Z',
        expiresAt: '2035-05-13T10:00:00.000Z',
        previousNotificationId: null,
        targetNotificationId: null,
        status: 'active',
        createdAt: '',
        updatedAt: '',
      },
    ];
    mockCreateReminder.mockResolvedValueOnce({
      notification: { status: 'not-scheduled', reason: 'notification-permission-denied' },
    });
    const view = await render(<HomeScreen />);

    await fireEvent.press(view.getByLabelText('リマインダーを追加'));
    await waitFor(() => expect(view.getByTestId('quick-add-open')).toBeOnTheScreen());

    await act(async () => {
      await mockInputSheetOnSave?.('ごみ出し');
    });
    await act(async () => {
      mockUseReminderUiStore.getState().closeQuickAdd();
    });

    await waitFor(() => {
      expect(mockRecordQuickAddCompleted).toHaveBeenCalledWith(1, { eligibleToPrompt: false });
    });
  });

  it('records active bubble deletion for store review and ignores expired reminder deletion', async () => {
    mockSettingsState = makeSettings({
      raiseToSpeakOnboardingCompleted: true,
      notificationPermissionIntroSeen: true,
    });
    const activeReminder: Reminder = {
      id: 'rem-active',
      title: '買い物',
      allDay: false,
      targetAt: '2035-05-13T10:00:00.000Z',
      previousNotifyAt: '2035-05-12T20:00:00.000Z',
      targetNotifyAt: '2035-05-13T10:00:00.000Z',
      expiresAt: '2035-05-13T10:00:00.000Z',
      previousNotificationId: null,
      targetNotificationId: null,
      status: 'active',
      createdAt: '',
      updatedAt: '',
    };
    const expiredReminder: Reminder = {
      ...activeReminder,
      id: 'rem-past',
      status: 'expired',
      targetAt: '2000-01-01T10:00:00.000Z',
      expiresAt: '2000-01-01T10:00:00.000Z',
    };
    mockReminders = [activeReminder, expiredReminder];
    await render(<HomeScreen />);

    await act(async () => {
      await mockDetailSheetOnDelete?.(expiredReminder);
    });
    expect(mockDeleteReminder).toHaveBeenCalledWith('rem-past');
    expect(mockRecordBubbleCompleted).not.toHaveBeenCalled();

    let deletePromise: Promise<void> | undefined;
    await act(async () => {
      deletePromise = mockDetailSheetOnDelete?.(activeReminder);
    });
    await act(async () => {
      mockBoardOnDeleteMotionComplete?.('rem-active', 'bursting');
      await deletePromise;
    });

    await waitFor(() => {
      expect(mockDeleteReminder).toHaveBeenCalledWith('rem-active', { deferCache: true });
      expect(mockRecordBubbleCompleted).toHaveBeenCalledTimes(1);
    });
  });
});
