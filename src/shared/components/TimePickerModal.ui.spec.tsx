import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { TimePickerModal } from './TimePickerModal';

jest.mock('@react-native-community/datetimepicker', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  return function MockDateTimePicker(props: Record<string, unknown>) {
    return React.createElement(View, { testID: 'date-time-picker', ...props });
  };
});

describe('TimePickerModal', () => {
  const originalPlatformOs = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatformOs,
    });
  });

  it('commits the chosen draft time on iOS without resetting the picker value mid-scroll', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    const view = await render(
      <TimePickerModal visible value="18:00" onConfirm={onConfirm} onClose={onClose} />,
    );

    const picker = view.getByTestId('date-time-picker');
    const initialValueTime = (picker.props.value as Date).getTime();

    await fireEvent(picker, 'change', { type: 'set' }, new Date(2030, 4, 12, 9, 15));
    expect((view.getByTestId('date-time-picker').props.value as Date).getTime()).toBe(
      initialValueTime,
    );

    await fireEvent.press(view.getByText('この時刻にする'));
    expect(onConfirm).toHaveBeenCalledWith('09:15');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('resets stale cancelled draft time when reopened on iOS', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    const view = await render(
      <TimePickerModal visible value="18:00" onConfirm={onConfirm} onClose={onClose} />,
    );

    await fireEvent(
      view.getByTestId('date-time-picker'),
      'change',
      { type: 'set' },
      new Date(2030, 4, 12, 10, 45),
    );
    await fireEvent.press(view.getByLabelText('時刻選択を閉じる'));
    expect(onConfirm).not.toHaveBeenCalled();

    await view.rerender(
      <TimePickerModal visible={false} value="18:00" onConfirm={onConfirm} onClose={onClose} />,
    );
    await view.rerender(
      <TimePickerModal visible value="18:00" onConfirm={onConfirm} onClose={onClose} />,
    );

    const reopenedValue = view.getByTestId('date-time-picker').props.value as Date;
    expect(reopenedValue.getHours()).toBe(18);
    expect(reopenedValue.getMinutes()).toBe(0);

    await fireEvent.press(view.getByText('この時刻にする'));
    expect(onConfirm).toHaveBeenCalledWith('18:00');
  });

  it('commits immediately on Android when a time is set', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const onConfirm = jest.fn();
    const onClose = jest.fn();

    const view = await render(
      <TimePickerModal visible value="18:00" onConfirm={onConfirm} onClose={onClose} />,
    );

    await fireEvent(
      view.getByTestId('date-time-picker'),
      'change',
      { type: 'set' },
      new Date(2030, 4, 12, 7, 30),
    );

    expect(onConfirm).toHaveBeenCalledWith('07:30');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
