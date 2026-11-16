import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ReminderDepartureSheet } from './ReminderDepartureSheet';

const mockPresent = jest.fn();
const mockDismiss = jest.fn();

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 20 }),
}));
jest.mock('@gorhom/bottom-sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View, FlatList } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    BottomSheetBackdrop: View,
    BottomSheetFlatList: FlatList,
    BottomSheetModal: React.forwardRef(function Modal(
      { children, onDismiss }: { children: ReactNode; onDismiss: () => void },
      ref,
    ) {
      React.useImperativeHandle(
        ref,
        () => ({
          present: mockPresent,
          dismiss: () => {
            mockDismiss();
            onDismiss();
          },
        }),
        [onDismiss],
      );
      return <View>{children}</View>;
    }),
  };
});
const notices = [
  { id: 'first', title: '観葉植物に水をあげる', targetAt: '2030-05-12T09:00:00.000Z' },
  {
    id: 'second',
    title: '長い名前の予定でも内容を隠さずに振り返れる泡',
    targetAt: '2030-05-11T00:00:00.000Z',
    allDay: true,
  },
];

test('shows every departed title and only acknowledges the displayed IDs on confirmation', async () => {
  const onConfirm = jest.fn(async () => {});
  const onClose = jest.fn();
  const view = await render(
    <ReminderDepartureSheet
      visible
      notices={notices}
      acknowledging={false}
      onConfirm={onConfirm}
      onClose={onClose}
    />,
  );
  expect(view.getByText('空へかえった泡')).toBeOnTheScreen();
  for (const item of notices) expect(view.getByText(item.title)).toBeOnTheScreen();
  expect(onConfirm).not.toHaveBeenCalled();
  await fireEvent.press(view.getByLabelText('空へかえった泡を確認しました'));
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(['first', 'second']));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('closing the sheet leaves the contents unacknowledged', async () => {
  const onConfirm = jest.fn(async () => {});
  const onClose = jest.fn();
  const view = await render(
    <ReminderDepartureSheet
      visible
      notices={notices}
      acknowledging={false}
      onConfirm={onConfirm}
      onClose={onClose}
    />,
  );
  await fireEvent.press(view.getByLabelText('泡の案内を閉じる'));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

test('a saving failure stays visible with a retry and does not dismiss the notice', async () => {
  const onConfirm = jest
    .fn()
    .mockRejectedValueOnce(new Error('busy'))
    .mockResolvedValueOnce(undefined);
  const onClose = jest.fn();
  const view = await render(
    <ReminderDepartureSheet
      visible
      notices={notices}
      acknowledging={false}
      onConfirm={onConfirm}
      onClose={onClose}
    />,
  );
  await fireEvent.press(view.getByLabelText('空へかえった泡を確認しました'));
  await waitFor(() =>
    expect(view.getByRole('alert')).toHaveTextContent(/確認を保存できませんでした/),
  );
  expect(onClose).not.toHaveBeenCalled();
  await fireEvent.press(view.getByLabelText('空へかえった泡を確認しました'));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});

test('does not dismiss an unpresented modal before its first opening', async () => {
  mockPresent.mockClear();
  mockDismiss.mockClear();
  const props = {
    notices,
    acknowledging: false,
    onConfirm: jest.fn(async () => {}),
    onClose: jest.fn(),
  };
  const view = await render(<ReminderDepartureSheet {...props} visible={false} />);
  expect(mockDismiss).not.toHaveBeenCalled();
  await view.rerender(<ReminderDepartureSheet {...props} visible />);
  expect(mockPresent).toHaveBeenCalledTimes(1);
});
