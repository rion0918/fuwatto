import { act, cleanup, fireEvent, render } from '@testing-library/react-native';

import { useReminderUiStore } from '../stores/reminderUiStore';
import { ReminderInputSheet } from './ReminderInputSheet';

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (value: unknown) => React.useRef({ value }).current,
    useAnimatedStyle: (callback: () => unknown) => callback(),
    cancelAnimation: jest.fn(),
    runOnJS: (callback: unknown) => callback,
    withSpring: jest.fn((value: number) => value),
  };
});

jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Gesture: {
      Pan: () => {
        const gesture: Record<string, unknown> = {};
        for (const name of [
          'enabled',
          'minDistance',
          'activeOffsetX',
          'failOffsetY',
          'onStart',
          'onUpdate',
          'onFinalize',
        ]) {
          gesture[name] = () => gesture;
        }
        return gesture;
      },
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Error: 'error' },
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaInsetsContext: null,
}));

jest.mock('@react-native-community/datetimepicker', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return function MockDateTimePicker(props: Record<string, unknown>) {
    return React.createElement(View, { testID: 'date-time-picker', ...props });
  };
});

jest.mock('../../../bootstrap/appServicesContext', () => {
  const voiceInput = { subscribe: jest.fn(() => ({ remove: jest.fn() })) };
  const analytics = {
    captureVoiceInputStarted: jest.fn(),
    captureVoiceInputResult: jest.fn(),
  };
  return { useAppServices: () => ({ voiceInput, analytics }) };
});

jest.mock('@gorhom/bottom-sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View, TextInput } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    BottomSheetModal: React.forwardRef(function MockBottomSheetModal(
      { children }: { children: React.ReactNode },
      ref,
    ) {
      React.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return React.createElement(View, null, children);
    }),
    BottomSheetScrollView: View,
    BottomSheetBackdrop: View,
    BottomSheetTextInput: TextInput,
  };
});

describe('ReminderInputSheet custom time selection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2030, 4, 12, 13, 37));
    useReminderUiStore.getState().closeQuickAdd();
    useReminderUiStore.getState().resetInput('18:00');
  });

  afterEach(() => {
    cleanup();
    useReminderUiStore.getState().closeQuickAdd();
    jest.useRealTimers();
  });

  it('keeps an explicitly chosen earlier custom time instead of snapping back to 18:00, and lets the user switch to tomorrow to add it', async () => {
    await act(async () => {
      useReminderUiStore.getState().openQuickAdd('18:00');
    });

    const onSave = jest.fn(async () => {});
    const view = await render(<ReminderInputSheet defaultTargetTime="18:00" onSave={onSave} />);

    // Open custom time picker while Today is still selected (default time is 18:00).
    await fireEvent.press(view.getByText('時刻'));
    await fireEvent(
      view.getByTestId('date-time-picker'),
      'change',
      { type: 'set' },
      new Date(2030, 4, 12, 9, 15),
    );
    await fireEvent.press(view.getByText('この時刻にする'));

    // Chosen custom time must remain 09:15 (not overwritten back to 18:00).
    expect(useReminderUiStore.getState().timeDigits).toBe('0915');
    expect(view.getAllByText('09:15').length).toBeGreaterThanOrEqual(1);
    expect(
      view.getByText('過去の日時は選べません。お知らせを受け取る未来の日時を選んでください。'),
    ).toBeOnTheScreen();
    expect(view.getByRole('button', { name: '追加' })).toBeDisabled();

    // Switching to Tomorrow keeps 09:15 and enables adding.
    await fireEvent.press(view.getByText('明日'));
    expect(useReminderUiStore.getState().timeDigits).toBe('0915');
    expect(
      view.queryByText('過去の日時は選べません。お知らせを受け取る未来の日時を選んでください。'),
    ).toBeNull();
    expect(view.getByRole('button', { name: '追加' })).not.toBeDisabled();

    // Even switching back to Today preserves the user-chosen 09:15 instead of overwriting with 18:00.
    await fireEvent.press(view.getByText('今日'));
    expect(useReminderUiStore.getState().timeDigits).toBe('0915');
  });

  it('commits a future custom time for today and does not fall back to 18:00', async () => {
    await act(async () => {
      useReminderUiStore.getState().openQuickAdd('18:00');
    });

    const view = await render(<ReminderInputSheet defaultTargetTime="18:00" onSave={jest.fn()} />);

    await fireEvent.press(view.getByText('時刻'));
    await fireEvent(
      view.getByTestId('date-time-picker'),
      'change',
      { type: 'set' },
      new Date(2030, 4, 12, 14, 30),
    );
    await fireEvent.press(view.getByText('この時刻にする'));

    expect(useReminderUiStore.getState().timeDigits).toBe('1430');
    expect(view.getAllByText('14:30').length).toBeGreaterThanOrEqual(1);
    expect(view.getByRole('button', { name: '追加' })).not.toBeDisabled();
  });

  it('keeps automatically corrected times eligible for correction after time passes', async () => {
    await act(async () => {
      useReminderUiStore.getState().openQuickAdd('08:00');
    });
    const view = await render(<ReminderInputSheet defaultTargetTime="08:00" />);

    await fireEvent.press(view.getByText('明日'));
    await fireEvent.press(view.getByText('今日'));
    expect(useReminderUiStore.getState().timeDigits).toBe('1800');

    jest.setSystemTime(new Date(2030, 4, 12, 18, 1));
    await fireEvent.press(view.getByText('明日'));
    await fireEvent.press(view.getByText('今日'));

    expect(useReminderUiStore.getState().timeDigits).toBe('2000');
    expect(useReminderUiStore.getState().timeTouched).toBe(false);
    expect(view.getByRole('button', { name: '追加' })).not.toBeDisabled();
  });
});
