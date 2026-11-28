import { fireEvent, render, within } from '@testing-library/react-native';
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

  it('defaults today 00:00 all-day reminders to the next available time when toggled to timed', async () => {
    const onConfirm = jest.fn();
    const view = await render(
      <ReminderScheduleEditorModal
        visible
        reminder={{
          targetAt: new Date(2030, 4, 12, 0, 0).toISOString(),
          previousNotifyAt: new Date(2030, 4, 11, 20, 0).toISOString(),
          allDay: true,
        }}
        isSaving={false}
        onConfirm={onConfirm}
        onClose={jest.fn()}
      />,
    );

    await fireEvent(view.getByRole('switch'), 'accessibilityTap');

    expect(view.getByLabelText('時刻を変更')).toBeOnTheScreen();
    expect(view.getAllByText('12:00').length).toBeGreaterThanOrEqual(1);
    expect(view.queryByText('過去の日時には変更できません')).toBeNull();
    const completeButton = view.getByLabelText('日時変更を完了');
    expect(completeButton).not.toBeDisabled();

    await fireEvent.press(completeButton);
    expect(onConfirm).toHaveBeenCalledWith({
      targetDate: '2030-05-12',
      targetTime: '12:00',
      allDay: false,
    });
  });

  it('defaults tomorrow 00:00 all-day reminders to the morning preset when toggled to timed', async () => {
    const onConfirm = jest.fn();
    const view = await render(
      <ReminderScheduleEditorModal
        visible
        reminder={{
          targetAt: new Date(2030, 4, 13, 0, 0).toISOString(),
          previousNotifyAt: new Date(2030, 4, 12, 20, 0).toISOString(),
          allDay: true,
        }}
        isSaving={false}
        onConfirm={onConfirm}
        onClose={jest.fn()}
      />,
    );

    await fireEvent(view.getByRole('switch'), 'accessibilityTap');

    expect(view.getAllByText('08:00').length).toBeGreaterThanOrEqual(1);
    await fireEvent.press(view.getByLabelText('日時変更を完了'));
    expect(onConfirm).toHaveBeenCalledWith({
      targetDate: '2030-05-13',
      targetTime: '08:00',
      allDay: false,
    });
  });

  it('uses shared previousNotifyTime setting for past detection and preview on stale reminders', async () => {
    const view = await render(
      <ReminderScheduleEditorModal
        visible
        reminder={{
          targetAt: new Date(2030, 4, 13, 14, 0).toISOString(),
          previousNotifyAt: new Date(2030, 4, 12, 20, 0).toISOString(),
        }}
        previousNotifyTime="09:00"
        isSaving={false}
        onConfirm={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(
      view.getByLabelText('前日のお知らせ時刻は過ぎているため、当日だけお知らせします'),
    ).toBeOnTheScreen();

    await view.rerender(
      <ReminderScheduleEditorModal
        visible={false}
        reminder={{
          targetAt: new Date(2030, 4, 10, 14, 0).toISOString(),
          previousNotifyAt: new Date(2030, 4, 9, 20, 0).toISOString(),
        }}
        previousNotifyTime="18:30"
        isSaving={false}
        onConfirm={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    await view.rerender(
      <ReminderScheduleEditorModal
        visible
        reminder={{
          targetAt: new Date(2030, 4, 10, 14, 0).toISOString(),
          previousNotifyAt: new Date(2030, 4, 9, 20, 0).toISOString(),
        }}
        previousNotifyTime="18:30"
        isSaving={false}
        onConfirm={jest.fn()}
        onClose={jest.fn()}
      />,
    );

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

  it('recomputes default time to today next available time when a tomorrow 00:00 all-day reminder is moved to today and toggled off', async () => {
    const onConfirm = jest.fn();
    const view = await render(
      <ReminderScheduleEditorModal
        visible
        reminder={{
          targetAt: new Date(2030, 4, 13, 0, 0).toISOString(),
          previousNotifyAt: new Date(2030, 4, 12, 20, 0).toISOString(),
          allDay: true,
        }}
        isSaving={false}
        onConfirm={onConfirm}
        onClose={jest.fn()}
      />,
    );

    await fireEvent.press(view.getByLabelText('日付を変更'));
    await fireEvent(
      view.getByTestId('date-time-picker'),
      'change',
      { type: 'set' },
      new Date(2030, 4, 12, 12),
    );
    await fireEvent(view.getByRole('switch'), 'accessibilityTap');

    expect(view.getAllByText('12:00').length).toBeGreaterThanOrEqual(1);
    const completeButton = view.getByLabelText('日時変更を完了');
    expect(completeButton).not.toBeDisabled();
    await fireEvent.press(completeButton);
    expect(onConfirm).toHaveBeenCalledWith({
      targetDate: '2030-05-12',
      targetTime: '12:00',
      allDay: false,
    });
  });

  it('uses custom timePresets when toggling a 00:00 today all-day reminder to timed', async () => {
    const onConfirm = jest.fn();
    const customPresets = [
      { label: '朝', time: '07:00' },
      { label: '昼', time: '11:30' },
      { label: '夕', time: '17:30' },
      { label: '夜', time: '21:00' },
    ];
    const view = await render(
      <ReminderScheduleEditorModal
        visible
        reminder={{
          targetAt: new Date(2030, 4, 12, 0, 0).toISOString(),
          previousNotifyAt: new Date(2030, 4, 11, 20, 0).toISOString(),
          allDay: true,
        }}
        timePresets={customPresets}
        isSaving={false}
        onConfirm={onConfirm}
        onClose={jest.fn()}
      />,
    );

    await fireEvent(view.getByRole('switch'), 'accessibilityTap');
    expect(view.getAllByText('11:30').length).toBeGreaterThanOrEqual(1);
    await fireEvent.press(view.getByLabelText('日時変更を完了'));
    expect(onConfirm).toHaveBeenCalledWith({
      targetDate: '2030-05-12',
      targetTime: '11:30',
      allDay: false,
    });
  });

  it('displays save errors, renders Pro paywall action for active limit errors, disables actions while opening Paywall, and clears errors on edit', async () => {
    const onClearSaveError = jest.fn();
    const onOpenProPaywall = jest.fn();
    const view = await render(
      <ReminderScheduleEditorModal
        visible
        reminder={initialReminder}
        isSaving={false}
        saveError={{
          message: '無料版で保持できる予定の上限に達しています',
          isActiveLimitReached: true,
        }}
        onConfirm={jest.fn()}
        onClose={jest.fn()}
        onClearSaveError={onClearSaveError}
        onOpenProPaywall={onOpenProPaywall}
      />,
    );

    expect(view.getByText('無料版で保持できる予定の上限に達しています')).toBeOnTheScreen();
    expect(view.getByText(/Pro版ふわっと。/)).toBeOnTheScreen();
    const proButton = view.getByLabelText('Proを見る');
    await fireEvent.press(proButton);
    expect(onOpenProPaywall).toHaveBeenCalledTimes(1);

    await fireEvent.press(view.getByLabelText('日付を変更'));
    await fireEvent(
      view.getByTestId('date-time-picker'),
      'change',
      { type: 'set' },
      new Date(2030, 4, 16, 12),
    );
    expect(onClearSaveError).toHaveBeenCalledTimes(1);

    await view.rerender(
      <ReminderScheduleEditorModal
        visible
        reminder={initialReminder}
        isSaving={false}
        isOpeningProPaywall
        saveError={{
          message: '無料版で保持できる予定の上限に達しています',
          isActiveLimitReached: true,
        }}
        onConfirm={jest.fn()}
        onClose={jest.fn()}
        onClearSaveError={onClearSaveError}
        onOpenProPaywall={onOpenProPaywall}
      />,
    );

    expect(view.getByText('Proを確認中…')).toBeOnTheScreen();
    expect(view.getByLabelText('Proを見る')).toBeDisabled();
    expect(view.getByLabelText('日時変更を完了')).toBeDisabled();
    expect(view.getByLabelText('日付を変更')).toBeDisabled();
    expect(view.getByLabelText('時刻を変更')).toBeDisabled();
  });

  it('keeps the Pro paywall button focusable outside the save error alert element', async () => {
    const view = await render(
      <ReminderScheduleEditorModal
        visible
        reminder={initialReminder}
        isSaving={false}
        saveError={{
          message: '無料版で保持できる予定の上限に達しています',
          isActiveLimitReached: true,
        }}
        onConfirm={jest.fn()}
        onClose={jest.fn()}
        onOpenProPaywall={jest.fn()}
      />,
    );

    const alert = view.getByRole('alert');
    expect(alert.props.accessible).toBe(true);
    expect(within(alert).getByText('無料版で保持できる予定の上限に達しています')).toBeOnTheScreen();
    expect(within(alert).getByText(/Pro版ふわっと。/)).toBeOnTheScreen();
    expect(within(alert).queryByLabelText('Proを見る')).toBeNull();

    const proButton = view.getByRole('button', { name: 'Proを見る' });
    expect(proButton).toBeOnTheScreen();

    let ancestor = proButton.parent;
    while (ancestor) {
      expect(ancestor.props.accessible).not.toBe(true);
      expect(ancestor.props.accessibilityRole).not.toBe('alert');
      ancestor = ancestor.parent;
    }
  });

  it('disables the open DateTimePicker and ignores date and time change events while busy', async () => {
    const onConfirm = jest.fn();
    const onClearSaveError = jest.fn();
    const view = await render(
      <ReminderScheduleEditorModal
        visible
        reminder={initialReminder}
        isSaving={false}
        saveError={{ message: '日時を保存できませんでした' }}
        onConfirm={onConfirm}
        onClose={jest.fn()}
        onClearSaveError={onClearSaveError}
      />,
    );

    await fireEvent.press(view.getByLabelText('日付を変更'));
    expect(view.getByTestId('date-time-picker').props.disabled).toBe(false);

    await view.rerender(
      <ReminderScheduleEditorModal
        visible
        reminder={initialReminder}
        isSaving
        saveError={{ message: '日時を保存できませんでした' }}
        onConfirm={onConfirm}
        onClose={jest.fn()}
        onClearSaveError={onClearSaveError}
      />,
    );

    expect(view.getByTestId('date-time-picker').props.disabled).toBe(true);
    await fireEvent(
      view.getByTestId('date-time-picker'),
      'change',
      { type: 'set' },
      new Date(2030, 4, 20, 12),
    );
    expect(onClearSaveError).not.toHaveBeenCalled();
    expect(view.getAllByText('5月13日（月）').length).toBeGreaterThanOrEqual(1);
    expect(view.queryByText('5月20日（月）')).toBeNull();
    expect(view.getByText('日時を保存できませんでした')).toBeOnTheScreen();

    await view.rerender(
      <ReminderScheduleEditorModal
        visible
        reminder={initialReminder}
        isSaving={false}
        saveError={{ message: '日時を保存できませんでした' }}
        onConfirm={onConfirm}
        onClose={jest.fn()}
        onClearSaveError={onClearSaveError}
      />,
    );

    await fireEvent.press(view.getByLabelText('時刻を変更'));
    expect(view.getByTestId('date-time-picker').props.disabled).toBe(false);

    await view.rerender(
      <ReminderScheduleEditorModal
        visible
        reminder={initialReminder}
        isSaving={false}
        isOpeningProPaywall
        saveError={{
          message: '無料版で保持できる予定の上限に達しています',
          isActiveLimitReached: true,
        }}
        onConfirm={onConfirm}
        onClose={jest.fn()}
        onClearSaveError={onClearSaveError}
        onOpenProPaywall={jest.fn()}
      />,
    );

    expect(view.getByTestId('date-time-picker').props.disabled).toBe(true);
    await fireEvent(
      view.getByTestId('date-time-picker'),
      'change',
      { type: 'set' },
      new Date(2030, 4, 13, 18, 45),
    );
    expect(onClearSaveError).not.toHaveBeenCalled();
    expect(view.getAllByText('14:00').length).toBeGreaterThanOrEqual(1);
    expect(view.queryByText('18:45')).toBeNull();

    await view.rerender(
      <ReminderScheduleEditorModal
        visible
        reminder={initialReminder}
        isSaving={false}
        isOpeningProPaywall={false}
        saveError={{
          message: '無料版で保持できる予定の上限に達しています',
          isActiveLimitReached: true,
        }}
        onConfirm={onConfirm}
        onClose={jest.fn()}
        onClearSaveError={onClearSaveError}
        onOpenProPaywall={jest.fn()}
      />,
    );

    expect(view.getByTestId('date-time-picker').props.disabled).toBe(false);
    await fireEvent(
      view.getByTestId('date-time-picker'),
      'change',
      { type: 'set' },
      new Date(2030, 4, 13, 18, 45),
    );
    expect(onClearSaveError).toHaveBeenCalledTimes(1);
    expect(view.getAllByText('18:45').length).toBeGreaterThanOrEqual(1);

    await fireEvent.press(view.getByLabelText('日時変更を完了'));
    expect(onConfirm).toHaveBeenCalledWith({
      targetDate: '2030-05-13',
      targetTime: '18:45',
    });
  });
});
