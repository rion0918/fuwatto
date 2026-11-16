import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

import type { ReminderDepartureNotice } from '../domain/reminder';
import { departureNoticesQueryKey } from './reminderQueryMutations';
import { useRemindersQuery } from './useRemindersQuery';

let mockStoredNotices: ReminderDepartureNotice[] = [];
const mockReadNotices = jest.fn(async () => mockStoredNotices);
const mockAcknowledge = jest.fn(async (_ids: string[]) => {});
const mockServices = {
  reminders: {
    listVisible: async () => [],
    listDepartureNotices: () => mockReadNotices(),
    acknowledgeDepartureNotices: (ids: string[]) => mockAcknowledge(ids),
  },
};
jest.mock('../../../bootstrap/appServicesContext', () => ({ useAppServices: () => mockServices }));

async function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...(await renderHook(() => useRemindersQuery(), { wrapper })), client };
}
const first = { id: 'first', title: '最初の泡', targetAt: '2030-05-12T09:00:00.000Z' };
const next = { ...first, id: 'next', title: '次の泡' };
beforeEach(() => {
  mockReadNotices.mockReset().mockImplementation(async () => mockStoredNotices);
  mockAcknowledge.mockReset().mockImplementation(async () => {});
  mockStoredNotices = [first];
});

test('acknowledging a shown batch preserves another departure that arrived while saving', async () => {
  let finish!: () => void;
  const saving = new Promise<void>((resolve) => {
    finish = resolve;
  });
  mockAcknowledge.mockImplementation(async (ids) => {
    await saving;
    mockStoredNotices = mockStoredNotices.filter((item) => !ids.includes(item.id));
  });
  const { result, client } = await setup();
  await waitFor(() => expect(result.current.departureNotices).toEqual([first]));
  let task!: Promise<void>;
  await act(() => {
    task = result.current.acknowledgeDepartureNotices(['first']);
  });
  await waitFor(() => expect(result.current.isAcknowledgingDepartures).toBe(true));
  await act(() => {
    mockStoredNotices = [first, next];
    client.setQueryData(departureNoticesQueryKey, mockStoredNotices);
  });
  await act(async () => {
    finish();
    await task;
  });
  await waitFor(() => expect(result.current.departureNotices).toEqual([next]));
  expect(mockAcknowledge).toHaveBeenCalledWith(['first']);
});

test('a failed acknowledgement preserves the notice and can be retried', async () => {
  mockAcknowledge.mockRejectedValueOnce(new Error('busy'));
  const { result } = await setup();
  await waitFor(() => expect(result.current.departureNotices).toEqual([first]));
  await act(async () => {
    await expect(result.current.acknowledgeDepartureNotices(['first'])).rejects.toThrow('busy');
  });
  expect(result.current.departureNotices).toEqual([first]);
  mockAcknowledge.mockImplementationOnce(async () => {
    mockStoredNotices = [];
  });
  await act(async () => {
    await result.current.acknowledgeDepartureNotices(['first']);
  });
  await waitFor(() => expect(result.current.departureNotices).toEqual([]));
});

test('a failed notice read is exposed and a later retry recovers the stored content', async () => {
  mockReadNotices.mockRejectedValueOnce(new Error('busy'));
  const { result } = await setup();
  await waitFor(() =>
    expect(result.current.departureNoticeError).toBe('空へかえった泡の案内を読み込めませんでした'),
  );
  await act(async () => {
    await result.current.refreshDepartureNotices();
  });
  await waitFor(() => expect(result.current.departureNotices).toEqual([first]));
  expect(result.current.departureNoticeError).toBeNull();
});
