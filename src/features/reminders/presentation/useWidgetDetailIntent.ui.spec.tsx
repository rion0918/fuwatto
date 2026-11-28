import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useWidgetDetailIntent } from './useWidgetDetailIntent';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

afterEach(() => jest.restoreAllMocks());

test('waits for fresh data and only opens the latest requested reminder', async () => {
  const first = deferred<{ id: string }[]>();
  const second = deferred<{ id: string }[]>();
  const refresh = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const open = jest.fn();
  const view = await renderHook<void, { id: string; intent: string }>(
    ({ id, intent }) => useWidgetDetailIntent({ action: 'view', id, intent }, refresh, open),
    { initialProps: { id: 'first', intent: '1' } },
  );
  expect(open).not.toHaveBeenCalled();
  await view.rerender({ id: 'second', intent: '2' });
  await act(async () => second.resolve([{ id: 'second' }]));
  expect(open).toHaveBeenCalledWith('second');
  await act(async () => first.resolve([{ id: 'first' }]));
  expect(open).toHaveBeenCalledTimes(1);
});

test('a later tap of the same reminder opens again', async () => {
  const refresh = jest.fn(async () => [{ id: 'first' }]);
  const open = jest.fn();
  const view = await renderHook<void, { intent: string }>(
    ({ intent }) => useWidgetDetailIntent({ action: 'view', id: 'first', intent }, refresh, open),
    { initialProps: { intent: '1' } },
  );
  await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
  await view.rerender({ intent: '2' });
  await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
});

test('missing and failed reads differ, and failed reads can be retried', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const refresh = jest
    .fn()
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce(new Error('busy'))
    .mockResolvedValueOnce([{ id: 'first' }]);
  const open = jest.fn();
  const view = await renderHook<void, { intent: string }>(
    ({ intent }) => useWidgetDetailIntent({ action: 'view', id: 'first', intent }, refresh, open),
    { initialProps: { intent: '1' } },
  );
  await waitFor(() =>
    expect(alert).toHaveBeenCalledWith('リマインダーが見つかりません', expect.any(String)),
  );
  await view.rerender({ intent: '2' });
  await waitFor(() =>
    expect(alert).toHaveBeenLastCalledWith(
      'リマインダーを読み込めませんでした',
      expect.any(String),
      expect.any(Array),
    ),
  );
  const retry = alert.mock.calls.at(-1)?.[2]?.find((button) => button.text === '再試行');
  await act(async () => retry?.onPress?.());
  await waitFor(() => expect(open).toHaveBeenCalledWith('first'));
});

test('holds view deep links while disabled and opens once enabled', async () => {
  const refresh = jest.fn(async () => [{ id: 'first' }]);
  const open = jest.fn();
  const view = await renderHook<void, { enabled: boolean }>(
    ({ enabled }) =>
      useWidgetDetailIntent({ action: 'view', id: 'first', intent: '1' }, refresh, open, enabled),
    { initialProps: { enabled: false } },
  );

  expect(refresh).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();

  await view.rerender({ enabled: true });
  await waitFor(() => expect(open).toHaveBeenCalledWith('first'));
});

test('uses current deleted copy without 自動消滅 and does not re-alert for a consumed intent', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const refresh = jest.fn(async () => []);
  const open = jest.fn();

  const view = await renderHook<
    void,
    {
      enabled: boolean;
      refreshFn: () => Promise<readonly { id: string }[]>;
      openFn: (id: string) => void;
    }
  >(
    ({ enabled, refreshFn, openFn }) =>
      useWidgetDetailIntent(
        { action: 'view', id: 'deleted-1', intent: 'intent-deleted' },
        refreshFn,
        openFn,
        enabled,
      ),
    { initialProps: { enabled: true, refreshFn: refresh, openFn: open } },
  );

  await waitFor(() => {
    expect(alert).toHaveBeenCalledTimes(1);
  });
  expect(alert).toHaveBeenCalledWith(
    'リマインダーが見つかりません',
    'この予定はすでに削除されています。',
  );
  const message = alert.mock.calls[0]?.[1];
  expect(typeof message === 'string' && message.includes('自動消滅')).toBe(false);
  expect(open).not.toHaveBeenCalled();

  await view.rerender({
    enabled: true,
    refreshFn: jest.fn(async () => []),
    openFn: jest.fn(),
  });
  await view.rerender({
    enabled: false,
    refreshFn: jest.fn(async () => []),
    openFn: jest.fn(),
  });
  await view.rerender({
    enabled: true,
    refreshFn: jest.fn(async () => []),
    openFn: jest.fn(),
  });

  expect(refresh).toHaveBeenCalledTimes(1);
  expect(alert).toHaveBeenCalledTimes(1);
});

test('marks opened view intents as consumed so rerenders after deletion do not misfire', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const refresh = jest
    .fn<Promise<readonly { id: string }[]>, []>()
    .mockResolvedValueOnce([{ id: 'first' }])
    .mockResolvedValue([]);
  const open = jest.fn();

  const view = await renderHook<
    void,
    {
      enabled: boolean;
      refreshFn: () => Promise<readonly { id: string }[]>;
      openFn: (id: string) => void;
    }
  >(
    ({ enabled, refreshFn, openFn }) =>
      useWidgetDetailIntent(
        { action: 'view', id: 'first', intent: 'intent-open-1' },
        refreshFn,
        openFn,
        enabled,
      ),
    { initialProps: { enabled: true, refreshFn: refresh, openFn: open } },
  );

  await waitFor(() => expect(open).toHaveBeenCalledWith('first'));

  await view.rerender({
    enabled: true,
    refreshFn: jest.fn(async () => []),
    openFn: jest.fn(),
  });
  await view.rerender({
    enabled: false,
    refreshFn: jest.fn(async () => []),
    openFn: jest.fn(),
  });
  await view.rerender({
    enabled: true,
    refreshFn: jest.fn(async () => []),
    openFn: jest.fn(),
  });

  expect(refresh).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledTimes(1);
  expect(alert).not.toHaveBeenCalled();
});

test('dismissing a read failure alert consumes that intent while retry and new intents still run', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const refresh = jest
    .fn<Promise<readonly { id: string }[]>, []>()
    .mockRejectedValueOnce(new Error('busy'))
    .mockRejectedValueOnce(new Error('still busy'))
    .mockResolvedValueOnce([{ id: 'first' }]);
  const open = jest.fn();

  const view = await renderHook<
    void,
    { intent: string; refreshFn: () => Promise<readonly { id: string }[]> }
  >(
    ({ intent, refreshFn }) =>
      useWidgetDetailIntent({ action: 'view', id: 'first', intent }, refreshFn, open, true),
    { initialProps: { intent: 'intent-fail-1', refreshFn: refresh } },
  );

  await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
  const closeButton = alert.mock.calls[0]?.[2]?.find((button) => button.text === '閉じる');
  await act(async () => closeButton?.onPress?.());

  await view.rerender({
    intent: 'intent-fail-1',
    refreshFn: jest.fn(async () => [{ id: 'first' }]),
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(alert).toHaveBeenCalledTimes(1);

  await view.rerender({ intent: 'intent-fail-2', refreshFn: refresh });
  await waitFor(() => expect(alert).toHaveBeenCalledTimes(2));
  const retryButton = alert.mock.calls[1]?.[2]?.find((button) => button.text === '再試行');
  await act(async () => retryButton?.onPress?.());
  await waitFor(() => expect(open).toHaveBeenCalledWith('first'));
});
