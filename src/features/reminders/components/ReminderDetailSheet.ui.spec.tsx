import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ComponentProps, ReactNode } from 'react';

import { ActiveReminderLimitReachedError } from '../application/reminderUseCases';
import type { Reminder } from '../domain/reminder';
import { ReminderDetailSheet } from './ReminderDetailSheet';

const mockPresentDetail = jest.fn();
const mockDismissDetail = jest.fn();
let mockOnDetailDismiss: (() => void) | undefined;

jest.mock('react-native', () => {
  const native = jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  let registered = false;

  const Pressable = React.forwardRef(function ProductionPressable(props, ref) {
    const { cssInterop } = jest.requireActual<typeof import('react-native-css-interop')>(
      'react-native-css-interop',
    );
    const { jsx } = jest.requireActual('react-native-css-interop/jsx-runtime');
    if (!registered) {
      cssInterop(native.Pressable, { className: 'style' });
      registered = true;
    }
    return jsx(native.Pressable, { ...props, ref });
  });
  return new Proxy(native, {
    get(target, key) {
      return key === 'Pressable' ? Pressable : Reflect.get(target, key);
    },
  });
});

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated/mock'),
  useReducedMotion: () => true,
}));

jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureHandlerRootView: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@react-native-community/datetimepicker', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  return function MockDateTimePicker(props: Record<string, unknown>) {
    return React.createElement(View, { testID: 'date-time-picker', ...props });
  };
});

jest.mock('@gorhom/bottom-sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { ScrollView, TextInput, View } =
    jest.requireActual<typeof import('react-native')>('react-native');

  return {
    BottomSheetBackdrop: View,
    BottomSheetModal: React.forwardRef(function MockBottomSheetModal(
      { children, onDismiss }: { children: ReactNode; onDismiss: () => void },
      ref,
    ) {
      mockOnDetailDismiss = onDismiss;
      React.useImperativeHandle(ref, () => ({
        present: mockPresentDetail,
        dismiss: mockDismissDetail,
      }));
      return React.createElement(View, null, children);
    }),
    BottomSheetScrollView: (props: ComponentProps<typeof ScrollView>) =>
      React.createElement(ScrollView, { ...props, testID: 'reminder-detail-scroll' }),
    BottomSheetTextInput: TextInput,
  };
});

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  const targetAt = new Date(2030, 4, 10, 14, 0).toISOString();

  return {
    id: 'reminder-1',
    title: '銀行へ行く',
    allDay: false,
    targetAt,
    previousNotifyAt: new Date(2030, 4, 9, 20, 0).toISOString(),
    targetNotifyAt: targetAt,
    expiresAt: targetAt,
    previousNotificationId: null,
    targetNotificationId: null,
    status: 'expired',
    createdAt: new Date(2030, 4, 1).toISOString(),
    updatedAt: new Date(2030, 4, 1).toISOString(),
    ...overrides,
  };
}

describe('ReminderDetailSheet dismissal', () => {
  beforeEach(() => {
    mockPresentDetail.mockClear();
    mockDismissDetail.mockClear();
    mockOnDetailDismiss = undefined;
  });

  it('presents the next reminder when it is selected between delete and onDismiss', async () => {
    const firstReminder = makeReminder({ status: 'active' });
    const nextReminder = makeReminder({ id: 'reminder-2', title: '図書館へ行く' });
    let completeDelete!: () => void;
    const deletion = new Promise<void>((resolve) => {
      completeDelete = resolve;
    });
    const props = {
      onClose: jest.fn(),
      onDelete: jest.fn().mockReturnValue(deletion),
      onUpdateTitle: jest.fn(),
      onUpdateSchedule: jest.fn(),
    };
    const view = await render(<ReminderDetailSheet {...props} reminder={firstReminder} />);
    expect(mockPresentDetail).toHaveBeenCalledTimes(1);

    await fireEvent.press(view.getByLabelText('このシャボン玉を削除する'));
    expect(mockDismissDetail).toHaveBeenCalledTimes(1);
    expect(props.onDelete).not.toHaveBeenCalled();

    await view.rerender(<ReminderDetailSheet {...props} reminder={nextReminder} />);
    expect(mockPresentDetail).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockOnDetailDismiss?.();
    });
    expect(props.onClose).toHaveBeenCalledWith(firstReminder.id);
    expect(props.onDelete).toHaveBeenCalledTimes(1);
    expect(props.onDelete).toHaveBeenCalledWith(firstReminder);
    expect(mockPresentDetail).toHaveBeenCalledTimes(2);

    await act(async () => {
      completeDelete();
      await deletion;
    });
    expect(view.getByText(nextReminder.title)).toBeOnTheScreen();
    expect(mockDismissDetail).toHaveBeenCalledTimes(1);
    expect(mockPresentDetail).toHaveBeenCalledTimes(2);
  });

  it('deletes the current reminder once and leaves the sheet closed when the selection is unchanged', async () => {
    const reminder = makeReminder();
    const onClose = jest.fn();
    const onDelete = jest.fn().mockResolvedValue(undefined);
    const view = await render(
      <ReminderDetailSheet
        reminder={reminder}
        onClose={onClose}
        onDelete={onDelete}
        onUpdateTitle={jest.fn()}
        onUpdateSchedule={jest.fn()}
      />,
    );

    await fireEvent.press(view.getByLabelText('このシャボン玉を削除する'));
    expect(mockDismissDetail).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();

    await act(async () => {
      mockOnDetailDismiss?.();
    });
    expect(onClose).toHaveBeenCalledWith(reminder.id);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(reminder);
    expect(mockPresentDetail).toHaveBeenCalledTimes(1);
  });
});

describe('ReminderDetailSheet schedule editing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2030, 4, 12, 10, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the schedule modal open on ActiveReminderLimitReachedError, shows Pro guidance, and recovers after Paywall unlock', async () => {
    const reminder = makeReminder();
    const onUpdateSchedule = jest
      .fn()
      .mockRejectedValueOnce(new ActiveReminderLimitReachedError())
      .mockResolvedValueOnce({
        reminder,
        notification: {
          status: 'scheduled',
          ids: { previousNotificationId: null, targetNotificationId: null },
        },
      });
    const onOpenProPaywall = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const view = await render(
      <ReminderDetailSheet
        reminder={reminder}
        previousNotifyTime="20:00"
        allDayNotifyTime="09:00"
        onClose={jest.fn()}
        onDelete={jest.fn()}
        onUpdateTitle={jest.fn()}
        onUpdateSchedule={onUpdateSchedule}
        onOpenProPaywall={onOpenProPaywall}
      />,
    );

    await fireEvent.press(view.getByLabelText('予定日時を編集'));
    await fireEvent.press(view.getByLabelText('日付を変更'));
    await fireEvent(
      view.getByTestId('date-time-picker'),
      'change',
      { type: 'set' },
      new Date(2030, 4, 15, 12),
    );
    await fireEvent.press(view.getByLabelText('日時変更を完了'));

    await waitFor(() => {
      expect(view.getByLabelText('日時変更を完了')).toBeOnTheScreen();
      expect(view.getByText('無料版で保持できる予定の上限に達しています')).toBeOnTheScreen();
      expect(view.getByText(/Pro版ふわっと。/)).toBeOnTheScreen();
      expect(view.getByLabelText('Proを見る')).toBeOnTheScreen();
    });

    await fireEvent.press(view.getByLabelText('Proを見る'));
    await waitFor(() => {
      expect(onOpenProPaywall).toHaveBeenCalledTimes(1);
    });
    expect(view.getByLabelText('日時変更を完了')).toBeOnTheScreen();
    expect(view.getByText('無料版で保持できる予定の上限に達しています')).toBeOnTheScreen();

    await fireEvent.press(view.getByLabelText('Proを見る'));
    await waitFor(() => {
      expect(onOpenProPaywall).toHaveBeenCalledTimes(2);
      expect(view.queryByText('無料版で保持できる予定の上限に達しています')).toBeNull();
    });

    await fireEvent.press(view.getByLabelText('日時変更を完了'));
    await waitFor(() => {
      expect(onUpdateSchedule).toHaveBeenCalledTimes(2);
      expect(view.queryByLabelText('日時変更を完了')).toBeNull();
    });
  });

  it('keeps the modal open on past-target save errors and clears the error when time changes', async () => {
    const reminder = makeReminder({
      targetAt: new Date(2030, 4, 12, 11, 0).toISOString(),
      previousNotifyAt: new Date(2030, 4, 11, 20, 0).toISOString(),
      status: 'active',
    });
    const onUpdateSchedule = jest
      .fn()
      .mockRejectedValueOnce(new Error('Reminder target time must be in the future'))
      .mockResolvedValueOnce({
        reminder,
        notification: {
          status: 'scheduled',
          ids: { previousNotificationId: null, targetNotificationId: null },
        },
      });

    const view = await render(
      <ReminderDetailSheet
        reminder={reminder}
        onClose={jest.fn()}
        onDelete={jest.fn()}
        onUpdateTitle={jest.fn()}
        onUpdateSchedule={onUpdateSchedule}
      />,
    );

    await fireEvent.press(view.getByLabelText('予定日時を編集'));
    await fireEvent.press(view.getByLabelText('日時変更を完了'));

    await waitFor(() => {
      expect(view.getByLabelText('日時変更を完了')).toBeOnTheScreen();
      expect(
        view.getByText('過去の日時には変更できません。未来の日時を選び直してください'),
      ).toBeOnTheScreen();
    });

    await fireEvent.press(view.getByLabelText('時刻を変更'));
    await fireEvent(
      view.getByTestId('date-time-picker'),
      'change',
      { type: 'set' },
      new Date(2030, 4, 12, 16, 0),
    );
    expect(
      view.queryByText('過去の日時には変更できません。未来の日時を選び直してください'),
    ).toBeNull();

    await fireEvent.press(view.getByLabelText('日時変更を完了'));
    await waitFor(() => {
      expect(view.queryByLabelText('日時変更を完了')).toBeNull();
    });
  });

  it('shows database save errors inside the open modal and clears them on cancel', async () => {
    const reminder = makeReminder({
      targetAt: new Date(2030, 4, 13, 14, 0).toISOString(),
      previousNotifyAt: new Date(2030, 4, 12, 20, 0).toISOString(),
      status: 'active',
    });
    const onUpdateSchedule = jest.fn().mockRejectedValueOnce(new Error('SQLITE_BUSY'));

    const view = await render(
      <ReminderDetailSheet
        reminder={reminder}
        onClose={jest.fn()}
        onDelete={jest.fn()}
        onUpdateTitle={jest.fn()}
        onUpdateSchedule={onUpdateSchedule}
      />,
    );

    await fireEvent.press(view.getByLabelText('予定日時を編集'));
    await fireEvent.press(view.getByLabelText('日時変更を完了'));

    await waitFor(() => {
      expect(view.getByLabelText('日時変更を完了')).toBeOnTheScreen();
      expect(view.getByText('日時を保存できませんでした')).toBeOnTheScreen();
    });

    const cancelButtons = view.getAllByLabelText('日時変更をキャンセル');
    await act(async () => {
      await fireEvent.press(cancelButtons[cancelButtons.length - 1]);
    });

    await waitFor(() => {
      expect(view.queryByLabelText('日時変更を完了')).toBeNull();
      expect(view.queryByText('日時を保存できませんでした')).toBeNull();
    });
  });

  it('discards the previous reminder draft when the detail switches to a different reminder', async () => {
    const firstReminder = makeReminder();
    const nextReminder = makeReminder({
      id: 'reminder-2',
      title: '図書館へ行く',
      targetAt: new Date(2030, 4, 16, 11, 0).toISOString(),
      status: 'active',
    });
    const props = {
      onClose: jest.fn(),
      onDelete: jest.fn(),
      onUpdateTitle: jest.fn(),
      onUpdateSchedule: jest.fn().mockResolvedValue({
        reminder: nextReminder,
        notification: { status: 'scheduled' },
      }),
    };
    const view = await render(<ReminderDetailSheet {...props} reminder={firstReminder} />);

    await fireEvent.press(view.getByLabelText('予定日時を編集'));
    await fireEvent.press(view.getByLabelText('日付を変更'));
    await fireEvent(
      view.getByTestId('date-time-picker'),
      'change',
      { type: 'set' },
      new Date(2030, 4, 15, 12),
    );
    await view.rerender(<ReminderDetailSheet {...props} reminder={{ ...firstReminder }} />);
    expect(view.getByLabelText('日時変更を完了')).toBeOnTheScreen();

    await view.rerender(<ReminderDetailSheet {...props} reminder={nextReminder} />);
    expect(view.queryByLabelText('日時変更を完了')).toBeNull();
    expect(props.onUpdateSchedule).not.toHaveBeenCalled();

    await fireEvent.press(view.getByLabelText('予定日時を編集'));
    await fireEvent.press(view.getByLabelText('日時変更を完了'));
    expect(props.onUpdateSchedule).toHaveBeenCalledTimes(1);
    expect(props.onUpdateSchedule).toHaveBeenCalledWith(
      nextReminder,
      expect.objectContaining({ targetDate: '2030-05-16', targetTime: '11:00' }),
    );
  });

  it('forwards settings previousNotifyTime to the schedule modal for expired reminders', async () => {
    const reminder = makeReminder();
    const view = await render(
      <ReminderDetailSheet
        reminder={reminder}
        previousNotifyTime="18:30"
        onClose={jest.fn()}
        onDelete={jest.fn()}
        onUpdateTitle={jest.fn()}
        onUpdateSchedule={jest.fn()}
      />,
    );

    await fireEvent.press(view.getByLabelText('予定日時を編集'));
    await fireEvent.press(view.getByLabelText('日付を変更'));
    await fireEvent(
      view.getByTestId('date-time-picker'),
      'change',
      { type: 'set' },
      new Date(2030, 4, 15, 12),
    );

    expect(
      view.getByLabelText('前日のお知らせも 5月14日（火） 18:30 に変わります'),
    ).toBeOnTheScreen();
  });
});
