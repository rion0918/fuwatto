import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';

import type { Reminder } from '../domain/reminder';
import { palette } from '../../../constants/colors';
import { ReminderScheduleEditorModal } from './ReminderScheduleEditorModal';

// Exercise the production JSX interop for Pressable; the test Babel preset skips NativeWind.
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

const initialReminder: Pick<Reminder, 'targetAt' | 'previousNotifyAt'> = {
  targetAt: new Date(2030, 4, 13, 14).toISOString(),
  previousNotifyAt: new Date(2030, 4, 12, 20).toISOString(),
};

describe('ReminderScheduleEditorModal', () => {
  const originalPlatform = Platform.OS;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2030, 4, 12, 10));
  });

  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  it('keeps the complete button visible and large enough with production style interop', async () => {
    const view = await render(
      <ReminderScheduleEditorModal
        visible
        reminder={initialReminder}
        isSaving={false}
        onConfirm={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(view.getByLabelText('日時変更を完了')).toHaveStyle({
      backgroundColor: palette.lavenderDeep,
      minHeight: 48,
      minWidth: 84,
    });
  });

  it('edits date and time, keeps the draft during a visible rerender, and saves it', async () => {
    const onConfirm = jest.fn();
    const view = await render(
      <ReminderScheduleEditorModal
        visible
        reminder={initialReminder}
        isSaving={false}
        onConfirm={onConfirm}
        onClose={jest.fn()}
      />,
    );

    const dateButton = view.getByLabelText('日付を変更');
    await fireEvent.press(dateButton);
    expect(dateButton).toBeSelected();
    expect(dateButton).not.toBeDisabled();
    await fireEvent(
      view.getByTestId('date-time-picker'),
      'change',
      { type: 'set' },
      new Date(2030, 4, 19, 12),
    );

    const timeButton = view.getByLabelText('時刻を変更');
    await fireEvent.press(timeButton);
    expect(timeButton).toBeSelected();
    expect(timeButton).not.toBeDisabled();
    await fireEvent(
      view.getByTestId('date-time-picker'),
      'change',
      { type: 'set' },
      new Date(2030, 4, 12, 15, 30),
    );

    expect(view.getAllByText('5月19日（日）').length).toBeGreaterThanOrEqual(1);
    expect(view.getAllByText('15:30').length).toBeGreaterThanOrEqual(1);
    expect(
      view.getByLabelText('前日のお知らせも 5月18日（土） 20:00 に変わります'),
    ).toBeOnTheScreen();

    await view.rerender(
      <ReminderScheduleEditorModal
        visible
        reminder={{ ...initialReminder }}
        isSaving={false}
        onConfirm={onConfirm}
        onClose={jest.fn()}
      />,
    );

    expect(view.getAllByText('5月19日（日）').length).toBeGreaterThanOrEqual(1);
    expect(view.getAllByText('15:30').length).toBeGreaterThanOrEqual(1);

    await fireEvent.press(view.getByLabelText('日時変更を完了'));
    expect(onConfirm).toHaveBeenCalledWith({ targetDate: '2030-05-19', targetTime: '15:30' });
  });

  it('disables saving and explains when the selected target is in the past', async () => {
    const onConfirm = jest.fn();
    const view = await render(
      <ReminderScheduleEditorModal
        visible
        reminder={{
          targetAt: new Date(2030, 4, 12, 11).toISOString(),
          previousNotifyAt: new Date(2030, 4, 11, 20).toISOString(),
        }}
        isSaving={false}
        onConfirm={onConfirm}
        onClose={jest.fn()}
      />,
    );

    await fireEvent.press(view.getByLabelText('時刻を変更'));
    await fireEvent(
      view.getByTestId('date-time-picker'),
      'change',
      { type: 'set' },
      new Date(2030, 4, 12, 9),
    );

    expect(view.getByText('過去の日時には変更できません')).toBeOnTheScreen();
    expect(
      view.getByLabelText('前日のお知らせ時刻は過ぎているため、当日だけお知らせします'),
    ).toBeOnTheScreen();
    const completeButton = view.getByLabelText('日時変更を完了');
    expect(completeButton).toBeDisabled();
    await fireEvent.press(completeButton);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('uses the all-day slider while editing and preserves the selected time when toggled back', async () => {
    const onConfirm = jest.fn();
    const view = await render(
      <ReminderScheduleEditorModal
        visible
        reminder={initialReminder}
        isSaving={false}
        onConfirm={onConfirm}
        onClose={jest.fn()}
      />,
    );

    const slider = view.getByRole('switch');
    expect(slider).not.toBeChecked();
    await fireEvent(slider, 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    expect(slider).toBeChecked();
    expect(view.queryByLabelText('時刻を変更')).toBeNull();
    expect(view.getByText('終日 · 09:00にお知らせ')).toBeOnTheScreen();

    await fireEvent(slider, 'accessibilityTap');
    expect(slider).not.toBeChecked();
    expect(view.getByLabelText('時刻を変更')).toBeOnTheScreen();
    expect(view.getAllByText('14:00').length).toBeGreaterThanOrEqual(1);
  });

  it('confirms the all-day change on Android', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const onConfirm = jest.fn();
    const view = await render(
      <ReminderScheduleEditorModal
        visible
        reminder={initialReminder}
        isSaving={false}
        onConfirm={onConfirm}
        onClose={jest.fn()}
      />,
    );

    await fireEvent(view.getByRole('switch'), 'accessibilityTap');
    await fireEvent.press(view.getByLabelText('日時変更を完了'));

    expect(onConfirm).toHaveBeenCalledWith({
      targetDate: '2030-05-13',
      targetTime: '14:00',
      allDay: true,
    });
  });

  it('confirms an Android native time selection after switching back from all-day', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const onConfirm = jest.fn();
    const view = await render(
      <ReminderScheduleEditorModal
        visible
        reminder={{ ...initialReminder, allDay: true }}
        isSaving={false}
        onConfirm={onConfirm}
        onClose={jest.fn()}
      />,
    );

    await fireEvent(view.getByRole('switch'), 'accessibilityTap');
    await fireEvent.press(view.getByLabelText('時刻を変更'));
    await fireEvent(
      view.getByTestId('date-time-picker'),
      'change',
      { type: 'set' },
      new Date(2030, 4, 13, 15, 30),
    );
    expect(view.queryByTestId('date-time-picker')).toBeNull();
    await fireEvent.press(view.getByLabelText('日時変更を完了'));

    expect(onConfirm).toHaveBeenCalledWith({
      targetDate: '2030-05-13',
      targetTime: '15:30',
      allDay: false,
    });
  });

  it('disables every action while saving', async () => {
    const view = await render(
      <ReminderScheduleEditorModal
        visible
        reminder={initialReminder}
        isSaving
        onConfirm={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(view.getByText('保存中…')).toBeOnTheScreen();
    expect(view.getByLabelText('日時変更を完了')).toBeDisabled();
    expect(view.getByLabelText('日付を変更')).toBeDisabled();
    expect(view.getByLabelText('時刻を変更')).toBeDisabled();
    for (const cancelButton of view.getAllByLabelText('日時変更をキャンセル')) {
      expect(cancelButton).toBeDisabled();
    }
  });
});
