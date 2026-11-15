import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { RaiseToSpeakIntroModal } from './RaiseToSpeakIntroModal';

afterEach(() => {
  jest.restoreAllMocks();
});

test('calibration exposes a cancellable action', async () => {
  const onDismiss = jest.fn();
  const view = await render(
    <RaiseToSpeakIntroModal
      visible
      busy={false}
      calibrating
      message={null}
      sensorStatus="active"
      sensorFailureReason={null}
      tiltProgress={0}
      onEnable={jest.fn()}
      onDismiss={onDismiss}
      onRetry={jest.fn()}
    />,
  );

  const cancelButton = view.getByLabelText('左右に傾けて音声入力の設定をキャンセル');
  expect(cancelButton).not.toBeDisabled();
  await fireEvent.press(cancelButton);
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test('intro exposes the tilt illustration', async () => {
  const view = await render(
    <RaiseToSpeakIntroModal
      visible
      busy={false}
      calibrating={false}
      message={null}
      sensorStatus="inactive"
      sensorFailureReason={null}
      tiltProgress={0}
      onEnable={jest.fn()}
      onDismiss={jest.fn()}
      onRetry={jest.fn()}
    />,
  );

  expect(view.getByLabelText('スマートフォンが左右に傾く動き')).toBeTruthy();
});

test('intro exposes the enable action', async () => {
  const onEnable = jest.fn();
  const view = await render(
    <RaiseToSpeakIntroModal
      visible
      busy={false}
      calibrating={false}
      message={null}
      sensorStatus="inactive"
      sensorFailureReason={null}
      tiltProgress={0}
      onEnable={onEnable}
      onDismiss={jest.fn()}
      onRetry={jest.fn()}
    />,
  );

  expect(view.getByText('動きを試す')).toBeTruthy();
  expect(view.queryByText('音声は端末内で処理し、録音を保存しません')).toBeNull();
  const enableButton = view.getByLabelText('左右に傾けて音声入力を使ってみる');
  expect(enableButton).not.toBeDisabled();
  await fireEvent.press(enableButton);
  expect(onEnable).toHaveBeenCalledTimes(1);
});

test('intro labels the setup action as trying the motion', async () => {
  const view = await render(
    <RaiseToSpeakIntroModal
      visible
      busy={false}
      phase="intro"
      message={null}
      sensorStatus="inactive"
      sensorFailureReason={null}
      tiltProgress={null}
      onEnable={jest.fn()}
      onDismiss={jest.fn()}
      onRetry={jest.fn()}
      onSuccessComplete={jest.fn()}
    />,
  );

  expect(view.getByText('傾けて話す')).toBeTruthy();
  expect(view.getByText('動きを試す')).toBeTruthy();
});

test('intro guides the user to return upright after tilt is detected', async () => {
  const view = await render(
    <RaiseToSpeakIntroModal
      visible
      busy={false}
      phase="awaiting-upright"
      message={null}
      sensorStatus="active"
      sensorFailureReason={null}
      tiltProgress={1}
      onEnable={jest.fn()}
      onDismiss={jest.fn()}
      onRetry={jest.fn()}
      onSuccessComplete={jest.fn()}
    />,
  );

  expect(view.getByText('開始の動きを確認できました')).toBeTruthy();
  expect(
    view.getByText('次はスマホを縦に戻してください。音声入力も同じ操作で終了します。'),
  ).toBeTruthy();
});

test('intro shows a non-dismissible preparation state while permissions are checked', async () => {
  const onDismiss = jest.fn();
  const view = await render(
    <RaiseToSpeakIntroModal
      visible
      busy
      phase="preparing"
      message={null}
      sensorStatus="waiting"
      sensorFailureReason={null}
      tiltProgress={null}
      onEnable={jest.fn()}
      onDismiss={onDismiss}
      onRetry={jest.fn()}
    />,
  );

  expect(view.getByText('準備しています…')).toBeTruthy();
  expect(view.getByText('マイクとセンサーを確認しています。')).toBeTruthy();
  expect(view.getByLabelText('左右に傾けて音声入力の設定をキャンセル')).toBeDisabled();
  await fireEvent.press(view.getByLabelText('左右に傾けて音声入力の設定をキャンセル'));
  expect(onDismiss).not.toHaveBeenCalled();
});

test('success keeps the modal visible until the completion callback is invoked', async () => {
  jest.useFakeTimers();
  const onSuccessComplete = jest.fn();
  const view = await render(
    <RaiseToSpeakIntroModal
      visible
      busy={false}
      phase="success"
      message={null}
      sensorStatus="waiting"
      sensorFailureReason={null}
      tiltProgress={null}
      onEnable={jest.fn()}
      onDismiss={jest.fn()}
      onRetry={jest.fn()}
      onSuccessComplete={onSuccessComplete}
    />,
  );

  expect(view.getByText('使い方を確認できました')).toBeTruthy();
  expect(onSuccessComplete).not.toHaveBeenCalled();

  await act(async () => {
    jest.advanceTimersByTime(999);
  });
  expect(onSuccessComplete).not.toHaveBeenCalled();

  await act(async () => {
    jest.advanceTimersByTime(1);
  });
  expect(onSuccessComplete).toHaveBeenCalledTimes(1);

  await act(async () => {
    view.unmount();
  });
  jest.useRealTimers();
});

test('intro places the defer choice before the enable choice', async () => {
  const view = await render(
    <RaiseToSpeakIntroModal
      visible
      busy={false}
      calibrating={false}
      message={null}
      sensorStatus="inactive"
      sensorFailureReason={null}
      tiltProgress={0}
      onEnable={jest.fn()}
      onDismiss={jest.fn()}
      onRetry={jest.fn()}
    />,
  );

  expect(view.getAllByRole('button').map((button) => button.props.accessibilityLabel)).toEqual([
    '今は音声入力を使わない',
    '左右に傾けて音声入力を使ってみる',
  ]);
});

test('calibration reports missing sensor samples and offers retry', async () => {
  const onRetry = jest.fn();
  const view = await render(
    <RaiseToSpeakIntroModal
      visible
      busy={false}
      calibrating
      message={null}
      sensorStatus="unavailable"
      sensorFailureReason="no-valid-sample"
      tiltProgress={0}
      onEnable={jest.fn()}
      onDismiss={jest.fn()}
      onRetry={onRetry}
    />,
  );

  expect(view.getByText('センサーを確認できませんでした')).toBeTruthy();
  expect(view.getByText(/加速度センサーから値を取得できませんでした/)).toBeTruthy();
  const retryButton = view.getByLabelText('傾きセンサーをもう一度試す');
  await fireEvent.press(retryButton);
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test.each([
  ['sensor-unavailable', '加速度センサーを利用できません'],
  ['subscription-error', 'センサーを開始できませんでした'],
] as const)('calibration explains the %s failure', async (sensorFailureReason, title) => {
  const view = await render(
    <RaiseToSpeakIntroModal
      visible
      busy={false}
      calibrating
      message={null}
      sensorStatus="unavailable"
      sensorFailureReason={sensorFailureReason}
      tiltProgress={null}
      onEnable={jest.fn()}
      onDismiss={jest.fn()}
      onRetry={jest.fn()}
    />,
  );

  expect(view.getByText(title)).toBeTruthy();
  expect(view.getByLabelText('傾きセンサーをもう一度試す')).toBeTruthy();
});

test('calibration reports that an installed subscription is waiting for its first value', async () => {
  const view = await render(
    <RaiseToSpeakIntroModal
      visible
      busy={false}
      calibrating
      message={null}
      sensorStatus="starting"
      sensorFailureReason={null}
      tiltProgress={null}
      onEnable={jest.fn()}
      onDismiss={jest.fn()}
      onRetry={jest.fn()}
    />,
  );

  expect(view.getByText('センサーを確認しています…')).toBeTruthy();
  expect(view.queryByLabelText('傾きセンサーをもう一度試す')).toBeNull();
});

test('calibration does not report a sensor failure while subscription prerequisites are pending', async () => {
  jest.useFakeTimers();
  const view = await render(
    <RaiseToSpeakIntroModal
      visible
      busy={false}
      calibrating
      message={null}
      sensorStatus="waiting"
      sensorFailureReason={null}
      tiltProgress={0}
      onEnable={jest.fn()}
      onDismiss={jest.fn()}
      onRetry={jest.fn()}
    />,
  );

  await act(async () => {
    jest.advanceTimersByTime(3_000);
  });
  expect(view.getByText('準備しています…')).toBeTruthy();
  expect(view.queryByText('センサーを確認できませんでした')).toBeNull();
  expect(view.queryByLabelText('傾きセンサーをもう一度試す')).toBeNull();

  await act(async () => {
    view.unmount();
  });
  jest.useRealTimers();
});

test('calibration exposes progress feedback while the phone is being tilted', async () => {
  const view = await render(
    <RaiseToSpeakIntroModal
      visible
      busy={false}
      calibrating
      message={null}
      sensorStatus="active"
      sensorFailureReason={null}
      tiltProgress={0.8}
      onEnable={jest.fn()}
      onDismiss={jest.fn()}
      onRetry={jest.fn()}
    />,
  );

  expect(view.getByText('もう少し傾けてください')).toBeTruthy();
  await act(async () => {
    view.unmount();
  });
});

test('calibration offers retry when an active sensor does not detect the pose', async () => {
  jest.useFakeTimers();
  const view = await render(
    <RaiseToSpeakIntroModal
      visible
      busy={false}
      calibrating
      message={null}
      sensorStatus="active"
      sensorFailureReason={null}
      tiltProgress={0}
      onEnable={jest.fn()}
      onDismiss={jest.fn()}
      onRetry={jest.fn()}
    />,
  );

  expect(view.getByText(/画面を見たまま/)).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(10_000);
  });
  expect(view.getByText('傾きを検出できませんでした')).toBeTruthy();
  expect(view.getByLabelText('傾きセンサーをもう一度試す')).toBeTruthy();

  await act(async () => {
    view.unmount();
  });
  jest.useRealTimers();
});

test('calibration keeps the pose timeout deadline when sensor status briefly changes', async () => {
  jest.useFakeTimers();
  const view = await render(
    <RaiseToSpeakIntroModal
      visible
      busy={false}
      calibrating
      message={null}
      sensorStatus="active"
      sensorFailureReason={null}
      tiltProgress={0}
      onEnable={jest.fn()}
      onDismiss={jest.fn()}
      onRetry={jest.fn()}
    />,
  );

  await act(async () => {
    jest.advanceTimersByTime(9_000);
    await Promise.resolve();
  });
  await act(async () => {
    view.rerender(
      <RaiseToSpeakIntroModal
        visible
        busy={false}
        calibrating
        message={null}
        sensorStatus="waiting"
        sensorFailureReason={null}
        tiltProgress={0}
        onEnable={jest.fn()}
        onDismiss={jest.fn()}
        onRetry={jest.fn()}
      />,
    );
    await Promise.resolve();
  });
  await act(async () => {
    jest.advanceTimersByTime(1_000);
    await Promise.resolve();
  });

  expect(view.getByText('傾きを検出できませんでした')).toBeTruthy();
  await act(async () => {
    view.unmount();
  });
  jest.useRealTimers();
});

test('calibration retry starts a fresh pose timeout', async () => {
  jest.useFakeTimers();
  const onRetry = jest.fn();
  const view = await render(
    <RaiseToSpeakIntroModal
      visible
      busy={false}
      calibrating
      message={null}
      sensorStatus="active"
      sensorFailureReason={null}
      tiltProgress={0}
      onEnable={jest.fn()}
      onDismiss={jest.fn()}
      onRetry={onRetry}
    />,
  );

  await act(async () => {
    jest.advanceTimersByTime(10_000);
  });
  await fireEvent.press(view.getByLabelText('傾きセンサーをもう一度試す'));
  expect(onRetry).toHaveBeenCalledTimes(1);

  await act(async () => {
    jest.advanceTimersByTime(9_999);
  });
  expect(view.queryByText('傾きを検出できませんでした')).toBeNull();

  await act(async () => {
    jest.advanceTimersByTime(1);
  });
  expect(view.getByText('傾きを検出できませんでした')).toBeTruthy();

  await act(async () => {
    view.unmount();
  });
  jest.useRealTimers();
});

test('intro applies edge-to-edge modal flags, safe-area padding, and scroll container', async () => {
  const view = await render(
    <SafeAreaInsetsContext.Provider value={{ top: 24, right: 32, bottom: 20, left: 32 }}>
      <RaiseToSpeakIntroModal
        visible
        busy={false}
        calibrating={false}
        message={null}
        sensorStatus="inactive"
        sensorFailureReason={null}
        tiltProgress={0}
        onEnable={jest.fn()}
        onDismiss={jest.fn()}
        onRetry={jest.fn()}
      />
    </SafeAreaInsetsContext.Provider>,
  );

  const [modal] = view.container.queryAll(
    (node) => node.type === 'RCTModalHostView' || node.type === 'Modal',
  );
  expect(modal).toBeDefined();
  expect(modal.props.statusBarTranslucent).toBe(true);
  expect(modal.props.navigationBarTranslucent).toBe(true);

  const [overlay] = view.container.queryAll(
    (node) => StyleSheet.flatten(node.props.style)?.paddingTop === 36,
  );
  expect(overlay).toBeDefined();
  expect(StyleSheet.flatten(overlay.props.style)).toMatchObject({
    paddingTop: 36,
    paddingBottom: 32,
    paddingLeft: 46,
    paddingRight: 46,
  });

  const [card] = view.container.queryAll((node) => node.props.accessibilityViewIsModal === true);
  expect(StyleSheet.flatten(card.props.style)).toMatchObject({
    maxWidth: 420,
    maxHeight: '100%',
  });
  expect(
    view.container.queryAll((node) => node.type === 'RCTScrollView' || node.type === 'ScrollView')
      .length,
  ).toBeGreaterThan(0);
});

describe('RaiseToSpeakIntroModal onboarding mode', () => {
  it('renders full-screen lavender onboarding copy, demo notice, replay button, and immediately pressable actions', async () => {
    const onEnable = jest.fn();
    const onDismiss = jest.fn();
    const view = await render(
      <SafeAreaInsetsContext.Provider value={{ top: 20, right: 0, bottom: 24, left: 0 }}>
        <RaiseToSpeakIntroModal
          visible
          mode="onboarding"
          busy={false}
          phase="intro"
          message={null}
          sensorStatus="inactive"
          sensorFailureReason={null}
          tiltProgress={null}
          onEnable={onEnable}
          onDismiss={onDismiss}
          onRetry={jest.fn()}
          onSuccessComplete={jest.fn()}
        />
      </SafeAreaInsetsContext.Provider>,
    );

    const [surface] = view.container.queryAll(
      (node) => StyleSheet.flatten(node.props.style)?.backgroundColor === '#F5F3FF',
    );
    expect(surface).toBeDefined();
    expect(view.getByText('傾けて、声でメモ')).toBeOnTheScreen();
    expect(view.getByText('傾けてこえメモ')).toBeOnTheScreen();
    expect(view.getByText('左右に傾けて話す。縦に戻して、内容を確認。')).toBeOnTheScreen();
    expect(view.getByText(/デモ/)).toBeOnTheScreen();
    expect(view.getByText(/保存されません/)).toBeOnTheScreen();
    expect(view.getByText(/確認してから/)).toBeOnTheScreen();
    expect(view.getByText('あとから設定で変更できます')).toBeOnTheScreen();

    const replayButton = view.getByRole('button', { name: '動きをもう一度見る' });
    expect(replayButton).toBeOnTheScreen();
    await fireEvent.press(replayButton);

    const tryButton = view.getByRole('button', { name: /オンにして試す/ });
    const skipButton = view.getByRole('button', { name: /オフのままはじめる/ });
    expect(tryButton).toHaveStyle({ backgroundColor: '#263151' });
    expect(tryButton).not.toBeDisabled();
    expect(skipButton).not.toBeDisabled();

    await fireEvent.press(tryButton);
    await fireEvent.press(skipButton);
    expect(onEnable).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('respects Reduce Motion with static fallback and non-animated modal transition', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const view = await render(
      <RaiseToSpeakIntroModal
        visible
        mode="onboarding"
        busy={false}
        phase="intro"
        message={null}
        sensorStatus="inactive"
        sensorFailureReason={null}
        tiltProgress={null}
        onEnable={jest.fn()}
        onDismiss={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    const [modal] = view.container.queryAll(
      (node) => node.type === 'RCTModalHostView' || node.type === 'Modal',
    );
    expect(modal.props.animationType).toBe('none');
    expect(view.getByRole('button', { name: '動きをもう一度見る' })).toBeOnTheScreen();
  });

  it('shows practice reassurance without requiring speech and handles sensor failure with retry and skip', async () => {
    const onSkip = jest.fn();
    const onRetry = jest.fn();
    const view = await render(
      <RaiseToSpeakIntroModal
        visible
        mode="onboarding"
        busy={false}
        phase="awaiting-tilt"
        message={null}
        sensorStatus="active"
        sensorFailureReason={null}
        tiltProgress={0}
        onEnable={jest.fn()}
        onDismiss={jest.fn()}
        onSkip={onSkip}
        onRetry={onRetry}
      />,
    );

    expect(view.getByText('動きを練習します。声は出さなくて大丈夫です')).toBeOnTheScreen();

    await view.rerender(
      <RaiseToSpeakIntroModal
        visible
        mode="onboarding"
        busy={false}
        phase="awaiting-tilt"
        message={null}
        sensorStatus="unavailable"
        sensorFailureReason="sensor-unavailable"
        tiltProgress={null}
        onEnable={jest.fn()}
        onDismiss={jest.fn()}
        onSkip={onSkip}
        onRetry={onRetry}
      />,
    );

    await fireEvent.press(view.getByText('もう一度試す'));
    await fireEvent.press(view.getByText('オフのままはじめる'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('offers settings link, retry, and skip when permission is permanently denied', async () => {
    const onOpenSettings = jest.fn();
    const onEnable = jest.fn();
    const onSkip = jest.fn();
    const view = await render(
      <RaiseToSpeakIntroModal
        visible
        mode="onboarding"
        busy={false}
        phase="intro"
        message="端末の設定でマイクの権限を許可してください。"
        setupFailureReason="permission-denied"
        permissionCanAskAgain={false}
        sensorStatus="inactive"
        sensorFailureReason={null}
        tiltProgress={null}
        onEnable={onEnable}
        onDismiss={jest.fn()}
        onSkip={onSkip}
        onOpenSettings={onOpenSettings}
        onRetry={jest.fn()}
      />,
    );

    expect(view.getByText('端末の設定でマイクの権限を許可してください。')).toBeOnTheScreen();
    await fireEvent.press(view.getByText('端末の設定を開く'));
    await fireEvent.press(view.getByText('もう一度試す'));
    await fireEvent.press(view.getByText('オフのままはじめる'));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onEnable).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('shows 準備できました with manual はじめる button and does not auto-close on success', async () => {
    jest.useFakeTimers();
    try {
      const onSuccessComplete = jest.fn();
      const view = await render(
        <RaiseToSpeakIntroModal
          visible
          mode="onboarding"
          busy={false}
          phase="success"
          message={null}
          sensorStatus="waiting"
          sensorFailureReason={null}
          tiltProgress={null}
          onEnable={jest.fn()}
          onDismiss={jest.fn()}
          onRetry={jest.fn()}
          onSuccessComplete={onSuccessComplete}
        />,
      );

      expect(view.getByText('準備できました')).toBeOnTheScreen();
      await act(async () => {
        jest.advanceTimersByTime(3_000);
      });
      expect(onSuccessComplete).not.toHaveBeenCalled();

      await fireEvent.press(view.getByText('はじめる'));
      expect(onSuccessComplete).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
