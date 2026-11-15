import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { appThemes, bubbleColors, palette } from '../../../constants/colors';
import type {
  RaiseToSpeakSensorFailureReason,
  RaiseToSpeakSensorStatus,
} from '../hooks/useRaiseToSpeakGesture';

const ZERO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const FALLBACK_SAFE_AREA_INSETS_CONTEXT = createContext(ZERO_INSETS);

const TILT_PHONE_ROTATION_DEGREES = 9;
const ONBOARDING_DEMO_TILT_DEGREES = 14;
const CALIBRATION_POSE_TIMEOUT_MS = 10_000;
const TILT_PHONE_SPRING = {
  damping: 16,
  stiffness: 90,
  mass: 0.85,
  overshootClamping: false,
} as const;
const DEMO_WAVE_BARS = [
  { id: 'wave-1', height: 16 },
  { id: 'wave-2', height: 28 },
  { id: 'wave-3', height: 22 },
  { id: 'wave-4', height: 14 },
] as const;
const NOOP = () => {};

export type RaiseToSpeakIntroMode = 'modal' | 'onboarding';
export type RaiseToSpeakSetupFailureReason = 'permission-denied' | 'unavailable' | 'save-failed';

type RaiseToSpeakIntroModalProps = {
  visible: boolean;
  mode?: RaiseToSpeakIntroMode;
  busy: boolean;
  calibrating?: boolean;
  phase?: RaiseToSpeakCalibrationPhase;
  message: string | null;
  setupFailureReason?: RaiseToSpeakSetupFailureReason | null;
  permissionCanAskAgain?: boolean;
  sensorStatus: RaiseToSpeakSensorStatus;
  sensorFailureReason: RaiseToSpeakSensorFailureReason | null;
  tiltProgress: number | null;
  onEnable: () => void;
  onDismiss: () => void;
  onSkip?: () => void;
  onOpenSettings?: () => void;
  onRetry: () => void;
  onSuccessComplete?: () => void;
};

export type RaiseToSpeakCalibrationPhase =
  'intro' | 'preparing' | 'awaiting-tilt' | 'awaiting-upright' | 'saving' | 'success';

type TiltPhoneIllustrationProps = {
  active: boolean;
  reduceMotionEnabled: boolean;
  tiltProgress: number | null;
  phase: RaiseToSpeakCalibrationPhase;
};

function TiltPhoneIllustration({
  active,
  reduceMotionEnabled,
  tiltProgress,
  phase,
}: TiltPhoneIllustrationProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(rotation);

    if (tiltProgress !== null) {
      rotation.value = reduceMotionEnabled ? 0 : tiltProgress * TILT_PHONE_ROTATION_DEGREES;
      return () => cancelAnimation(rotation);
    }

    if (!active) {
      rotation.value = 0;
      return;
    }

    rotation.value = reduceMotionEnabled
      ? 0
      : withSequence(
          withSpring(-TILT_PHONE_ROTATION_DEGREES, TILT_PHONE_SPRING),
          withSpring(0, TILT_PHONE_SPRING),
          withSpring(TILT_PHONE_ROTATION_DEGREES, TILT_PHONE_SPRING),
          withSpring(0, TILT_PHONE_SPRING),
        );

    return () => cancelAnimation(rotation);
  }, [active, reduceMotionEnabled, rotation, tiltProgress]);

  const animatedPhoneStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  if (phase === 'success') {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel="音声入力の使い方を確認しました"
        style={styles.successIllustration}
      >
        <Ionicons name="checkmark-circle" size={76} color={palette.mintDeep} />
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="スマートフォンが左右に傾く動き"
      style={styles.tiltIllustration}
    >
      <Ionicons
        name="arrow-back-outline"
        size={24}
        color={palette.lavenderDeep}
        style={styles.leftTiltArrow}
      />
      <Ionicons
        name="arrow-forward-outline"
        size={24}
        color={palette.lavenderDeep}
        style={styles.rightTiltArrow}
      />
      <Animated.View style={[styles.phoneFrame, animatedPhoneStyle]}>
        <View style={styles.phoneScreen}>
          <View style={styles.phoneSpeaker} />
          <View style={styles.phoneCamera} />
          <View style={styles.phoneScreenContent}>
            <View style={styles.phoneScreenLineWide} />
            <View style={styles.phoneScreenLine} />
            <View style={styles.phoneScreenBubble} />
          </View>
          <View style={styles.phoneHomeIndicator} />
        </View>
      </Animated.View>
    </View>
  );
}

type OnboardingDemoIllustrationProps = {
  active: boolean;
  reduceMotionEnabled: boolean;
  replayKey: number;
};

function OnboardingDemoIllustration({
  active,
  reduceMotionEnabled,
  replayKey,
}: OnboardingDemoIllustrationProps) {
  const rotation = useSharedValue(0);
  const waveProgress = useSharedValue(reduceMotionEnabled ? 1 : 0);
  const bubbleProgress = useSharedValue(reduceMotionEnabled ? 1 : 0);
  const bubbleTone = bubbleColors[0];

  useEffect(() => {
    cancelAnimation(rotation);
    cancelAnimation(waveProgress);
    cancelAnimation(bubbleProgress);

    if (!active || reduceMotionEnabled) {
      rotation.value = 0;
      waveProgress.value = reduceMotionEnabled ? 0.85 : 0;
      bubbleProgress.value = reduceMotionEnabled ? 1 : 0;
      return;
    }

    const demoReplayNonce = replayKey;
    void demoReplayNonce;

    rotation.value = 0;
    waveProgress.value = 0;
    bubbleProgress.value = 0;

    rotation.value = withSequence(
      withDelay(
        180,
        withTiming(-ONBOARDING_DEMO_TILT_DEGREES, {
          duration: 720,
          easing: Easing.out(Easing.cubic),
        }),
      ),
      withDelay(
        1_300,
        withTiming(0, {
          duration: 680,
          easing: Easing.out(Easing.cubic),
        }),
      ),
    );

    waveProgress.value = withSequence(
      withDelay(880, withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) })),
      withDelay(950, withTiming(0.18, { duration: 320, easing: Easing.inOut(Easing.quad) })),
    );

    bubbleProgress.value = withDelay(
      2_860,
      withSpring(1, {
        damping: 14,
        stiffness: 110,
        mass: 0.9,
      }),
    );

    return () => {
      cancelAnimation(rotation);
      cancelAnimation(waveProgress);
      cancelAnimation(bubbleProgress);
    };
  }, [active, bubbleProgress, reduceMotionEnabled, replayKey, rotation, waveProgress]);

  const animatedPhoneStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const animatedWavesStyle = useAnimatedStyle(() => ({
    opacity: 0.2 + waveProgress.value * 0.8,
    transform: [{ scaleY: 0.45 + waveProgress.value * 0.55 }],
  }));

  const animatedBubbleStyle = useAnimatedStyle(() => ({
    opacity: bubbleProgress.value,
    transform: [
      { scale: 0.68 + bubbleProgress.value * 0.32 },
      { translateY: (1 - bubbleProgress.value) * 10 },
    ],
  }));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="スマートフォンを傾けて話し、縦に戻すと丸いメモの泡になるデモ"
      style={styles.onboardingDemoStage}
    >
      <View style={styles.onboardingDemoPhoneArea}>
        <Ionicons
          name="arrow-back-outline"
          size={20}
          color={palette.lavenderDeep}
          style={styles.onboardingLeftArrow}
        />
        <Animated.View style={[styles.onboardingPhoneFrame, animatedPhoneStyle]}>
          <View style={styles.phoneScreen}>
            <View style={styles.phoneSpeaker} />
            <View style={styles.phoneCamera} />
            <View style={styles.phoneScreenContent}>
              <Animated.View style={[styles.demoWaveRow, animatedWavesStyle]}>
                {DEMO_WAVE_BARS.map((bar) => (
                  <View
                    key={bar.id}
                    style={[styles.demoWaveBar, { height: Math.round(bar.height * 0.72) }]}
                  />
                ))}
              </Animated.View>
              <View style={styles.phoneScreenLineWide} />
              <View style={styles.phoneScreenLine} />
            </View>
            <View style={styles.phoneHomeIndicator} />
          </View>
        </Animated.View>
        <Ionicons
          name="arrow-forward-outline"
          size={20}
          color={palette.lavenderDeep}
          style={styles.onboardingRightArrow}
        />
      </View>

      <Ionicons
        name="arrow-forward"
        size={18}
        color={palette.lavenderDeep}
        style={styles.onboardingStepArrow}
      />

      <Animated.View style={[styles.onboardingDemoBubbleWrap, animatedBubbleStyle]}>
        <View
          style={[
            styles.onboardingMemoBubble,
            {
              borderColor: bubbleTone.border,
              backgroundColor: bubbleTone.background,
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.88)', bubbleTone.gradient[1], 'rgba(255,255,255,0.22)']}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.onboardingMemoBubbleGradient}
          >
            <View style={styles.onboardingMemoGloss} />
            <Text numberOfLines={1} style={styles.onboardingMemoTitle}>
              牛乳を買う
            </Text>
            <Text numberOfLines={1} style={styles.onboardingMemoMeta}>
              明日 8:00
            </Text>
          </LinearGradient>
        </View>
      </Animated.View>
    </View>
  );
}

function OnboardingSuccessIllustration() {
  const bubbleTone = bubbleColors[0];
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="傾けてこえメモの準備ができました"
      style={styles.onboardingSuccessStage}
    >
      <View
        style={[
          styles.onboardingSuccessBubble,
          {
            borderColor: bubbleTone.border,
            backgroundColor: bubbleTone.background,
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.92)', bubbleTone.gradient[1], 'rgba(255,255,255,0.28)']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.onboardingMemoBubbleGradient}
        >
          <View style={styles.onboardingMemoGloss} />
          <Ionicons name="mic-outline" size={28} color={palette.lavenderDeep} />
          <View style={styles.onboardingSuccessBadge}>
            <Ionicons name="checkmark" size={16} color={palette.white} />
          </View>
        </LinearGradient>
      </View>
    </View>
  );
}

export function RaiseToSpeakIntroModal({
  visible,
  mode = 'modal',
  busy,
  calibrating,
  phase,
  message,
  setupFailureReason = null,
  permissionCanAskAgain = true,
  sensorStatus,
  sensorFailureReason,
  tiltProgress,
  onEnable,
  onDismiss,
  onSkip,
  onOpenSettings,
  onRetry,
  onSuccessComplete = NOOP,
}: RaiseToSpeakIntroModalProps) {
  const isOnboarding = mode === 'onboarding';
  const setupPhase = phase ?? (calibrating ? 'awaiting-tilt' : 'intro');
  const safeAreaInsets =
    useContext(SafeAreaInsetsContext ?? FALLBACK_SAFE_AREA_INSETS_CONTEXT) ?? ZERO_INSETS;
  const isCalibrating = setupPhase === 'awaiting-tilt' || setupPhase === 'awaiting-upright';
  const isDismissLocked =
    busy || setupPhase === 'preparing' || setupPhase === 'saving' || setupPhase === 'success';
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [calibrationTimedOut, setCalibrationTimedOut] = useState(false);
  const [calibrationAttempt, setCalibrationAttempt] = useState(0);
  const [demoReplayKey, setDemoReplayKey] = useState(0);
  const poseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotionEnabled);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!visible || !isCalibrating) return undefined;

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background') {
        if (poseTimeoutRef.current !== null) {
          clearTimeout(poseTimeoutRef.current);
          poseTimeoutRef.current = null;
        }
        setCalibrationTimedOut(false);
        setCalibrationAttempt((attempt) => attempt + 1);
      }
    });

    return () => subscription.remove();
  }, [isCalibrating, visible]);

  useEffect(() => {
    if (!visible || setupPhase !== 'awaiting-tilt') {
      setCalibrationTimedOut(false);
      if (poseTimeoutRef.current !== null) clearTimeout(poseTimeoutRef.current);
      poseTimeoutRef.current = null;
      return undefined;
    }

    setCalibrationTimedOut(false);
    if (poseTimeoutRef.current !== null) clearTimeout(poseTimeoutRef.current);
    poseTimeoutRef.current = null;

    return () => {
      if (poseTimeoutRef.current !== null) clearTimeout(poseTimeoutRef.current);
      poseTimeoutRef.current = null;
    };
  }, [calibrationAttempt, setupPhase, visible]);

  useEffect(() => {
    if (
      !visible ||
      setupPhase !== 'awaiting-tilt' ||
      sensorStatus !== 'active' ||
      poseTimeoutRef.current !== null
    ) {
      return;
    }

    poseTimeoutRef.current = setTimeout(() => {
      setCalibrationTimedOut(true);
    }, CALIBRATION_POSE_TIMEOUT_MS);
  }, [calibrationAttempt, sensorStatus, setupPhase, visible]);

  useEffect(() => {
    if (!visible || setupPhase !== 'success' || isOnboarding) return;

    const timeout = setTimeout(onSuccessComplete, 1_000);
    return () => clearTimeout(timeout);
  }, [isOnboarding, onSuccessComplete, setupPhase, visible]);

  const handleRetry = () => {
    setCalibrationAttempt((attempt) => attempt + 1);
    setCalibrationTimedOut(false);
    onRetry();
  };

  const handleOnboardingSkip = onSkip ?? onDismiss;

  let title = isOnboarding ? '傾けて、声でメモ' : '傾けて話す';
  let body = isOnboarding
    ? '左右に傾けて話す。縦に戻して、内容を確認。'
    : 'スマホを左右どちらかへ傾けると音声入力を開始し、縦に戻すと終了します。';

  if (isCalibrating) {
    if (sensorStatus === 'unavailable') {
      if (sensorFailureReason === 'sensor-unavailable') {
        title = '加速度センサーを利用できません';
        body = 'この端末では加速度センサーを確認できませんでした。端末を再起動してお試しください。';
      } else if (sensorFailureReason === 'subscription-error') {
        title = 'センサーを開始できませんでした';
        body = '加速度センサーの開始に失敗しました。アプリを開いたまま、もう一度お試しください。';
      } else if (sensorFailureReason === 'no-valid-sample') {
        title = 'センサーを確認できませんでした';
        body = '加速度センサーから値を取得できませんでした。もう一度お試しください。';
      } else {
        title = 'センサーを確認できませんでした';
        body = '加速度センサーの状態を確認できませんでした。もう一度お試しください。';
      }
    } else if (setupPhase === 'awaiting-upright') {
      title = '開始の動きを確認できました';
      body = '次はスマホを縦に戻してください。音声入力も同じ操作で終了します。';
    } else if (calibrationTimedOut) {
      title = '傾きを検出できませんでした';
      body = 'いったん縦向きに戻し、画面を見たまま左右へ40度以上回転してください。';
    } else if (sensorStatus === 'waiting' || sensorStatus === 'inactive') {
      title = '準備しています…';
      body = '画面を開いたまま、少しお待ちください。';
    } else if (sensorStatus === 'starting') {
      title = 'センサーを確認しています…';
      body = 'スマホを縦向きに持ったまま、少しお待ちください。';
    } else {
      title = '左右どちらかへ傾けてください';
      body = '画面を見たまま、スマホをゆっくり40度ほど傾けます。';
    }
  } else if (setupPhase === 'saving') {
    title = '設定しています…';
    body = 'そのまま少しお待ちください。';
  } else if (setupPhase === 'preparing') {
    title = '準備しています…';
    body = 'マイクとセンサーを確認しています。';
  } else if (setupPhase === 'success') {
    title = isOnboarding ? '準備できました' : '使い方を確認できました';
    body = isOnboarding
      ? '傾けて話して縦に戻すだけで、文字と日時の候補を確認してから残せます。'
      : '傾けて開始、縦に戻して終了できます。';
  }

  const calibrationFeedback =
    isCalibrating && sensorStatus === 'active' && !calibrationTimedOut
      ? Math.abs(tiltProgress ?? 0) >= 1
        ? setupPhase === 'awaiting-upright'
          ? 'スマホを縦に戻してください'
          : 'そのまま傾きをキープしてください'
        : Math.abs(tiltProgress ?? 0) >= 0.65
          ? setupPhase === 'awaiting-upright'
            ? 'スマホを縦に戻してください'
            : 'もう少し傾けてください'
          : setupPhase === 'awaiting-upright'
            ? '縦向きのまま少し待ってください'
            : '左右へゆっくり傾けてください'
      : null;
  const canRetry =
    setupPhase === 'awaiting-tilt' && (sensorStatus === 'unavailable' || calibrationTimedOut);

  if (isOnboarding) {
    const showPermissionSettingsAction =
      setupPhase === 'intro' &&
      setupFailureReason === 'permission-denied' &&
      !permissionCanAskAgain &&
      Boolean(onOpenSettings);
    const isIntroPrepareRetry =
      setupPhase === 'intro' &&
      (setupFailureReason === 'permission-denied' || setupFailureReason === 'unavailable');

    return (
      <Modal
        visible={visible}
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        animationType={reduceMotionEnabled ? 'none' : 'fade'}
        onRequestClose={isDismissLocked ? undefined : onDismiss}
      >
        <View
          accessibilityViewIsModal
          style={[
            styles.onboardingSurface,
            {
              paddingTop: Math.max(20, safeAreaInsets.top + 14),
              paddingBottom: Math.max(20, safeAreaInsets.bottom + 14),
              paddingLeft: Math.max(20, safeAreaInsets.left + 16),
              paddingRight: Math.max(20, safeAreaInsets.right + 16),
            },
          ]}
        >
          <View pointerEvents="none" style={styles.onboardingAmbientLayer}>
            <View style={styles.onboardingAmbientTopRight} />
            <View style={styles.onboardingAmbientMiddleLeft} />
            <View style={styles.onboardingAmbientBottomRight} />
          </View>

          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            style={styles.onboardingScroll}
            contentContainerStyle={styles.onboardingScrollContent}
          >
            <View style={styles.onboardingInner}>
              <View style={styles.onboardingBadge}>
                <Ionicons name="sparkles-outline" size={14} color={palette.lavenderDeep} />
                <Text style={styles.onboardingBadgeText}>傾けてこえメモ</Text>
              </View>

              {setupPhase === 'success' ? (
                <OnboardingSuccessIllustration />
              ) : setupPhase === 'intro' ? (
                <View style={styles.onboardingDemoBlock}>
                  <OnboardingDemoIllustration
                    active={visible && setupPhase === 'intro'}
                    reduceMotionEnabled={reduceMotionEnabled}
                    replayKey={demoReplayKey}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="動きをもう一度見る"
                    onPress={() => setDemoReplayKey((count) => count + 1)}
                    className="active:opacity-70"
                    style={styles.replayButton}
                  >
                    <Ionicons name="refresh-outline" size={15} color={palette.lavenderDeep} />
                    <Text style={styles.replayButtonText}>動きをもう一度見る</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.onboardingCalibrationIllustrationWrap}>
                  <TiltPhoneIllustration
                    active={false}
                    reduceMotionEnabled={reduceMotionEnabled}
                    tiltProgress={isCalibrating ? tiltProgress : null}
                    phase={setupPhase}
                  />
                </View>
              )}

              <Text accessibilityLiveRegion="polite" style={styles.onboardingTitle}>
                {title}
              </Text>
              <Text accessibilityLiveRegion="polite" style={styles.onboardingBody}>
                {body}
              </Text>

              {setupPhase === 'intro' ? (
                <View style={styles.onboardingNoticeList}>
                  <View style={styles.onboardingNoticeCard}>
                    <Ionicons
                      name="play-circle-outline"
                      size={17}
                      color={palette.lavenderDeep}
                      style={styles.onboardingNoticeIcon}
                    />
                    <Text style={styles.onboardingNoticeText}>
                      デモの音声やメモは保存されません。
                    </Text>
                  </View>
                  <View style={styles.onboardingNoticeCard}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={17}
                      color={palette.mintDeep}
                      style={styles.onboardingNoticeIcon}
                    />
                    <Text style={styles.onboardingNoticeText}>
                      日時と内容を確認してから保存できます。
                    </Text>
                  </View>
                </View>
              ) : null}

              {isCalibrating ? (
                <View style={styles.onboardingReassuranceBanner}>
                  <Ionicons name="hand-left-outline" size={16} color={palette.lavenderDeep} />
                  <Text style={styles.onboardingReassuranceText}>
                    動きを練習します。声は出さなくて大丈夫です
                  </Text>
                </View>
              ) : null}

              {calibrationFeedback ? (
                <Text accessibilityLiveRegion="polite" style={styles.onboardingFeedback}>
                  {calibrationFeedback}
                </Text>
              ) : null}

              {message ? (
                <View accessibilityLiveRegion="polite" style={styles.onboardingErrorBanner}>
                  <Text style={styles.onboardingErrorText}>{message}</Text>
                </View>
              ) : null}

              <View style={styles.onboardingActions}>
                {setupPhase === 'success' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="はじめる"
                    onPress={onSuccessComplete}
                    className="active:opacity-70"
                    style={styles.onboardingPrimaryButton}
                  >
                    <Text style={styles.onboardingPrimaryLabel}>はじめる</Text>
                  </Pressable>
                ) : isCalibrating || setupPhase === 'preparing' || setupPhase === 'saving' ? (
                  <>
                    {canRetry ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="傾きセンサーをもう一度試す"
                        accessibilityState={{ disabled: isDismissLocked, busy }}
                        disabled={isDismissLocked}
                        onPress={handleRetry}
                        className="active:opacity-70"
                        style={styles.onboardingPrimaryButton}
                      >
                        <Text style={styles.onboardingPrimaryLabel}>もう一度試す</Text>
                      </Pressable>
                    ) : null}
                    {canRetry ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="オフのままはじめる"
                        disabled={isDismissLocked}
                        onPress={handleOnboardingSkip}
                        className="active:opacity-70"
                        style={styles.onboardingSecondaryButton}
                      >
                        <Text style={styles.onboardingSecondaryLabel}>オフのままはじめる</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="左右に傾けて音声入力の設定をキャンセル"
                      disabled={isDismissLocked}
                      onPress={onDismiss}
                      className="active:opacity-70"
                      style={styles.onboardingSecondaryButton}
                    >
                      <Text style={styles.onboardingSecondaryLabel}>キャンセル</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    {showPermissionSettingsAction ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="端末の設定を開く"
                        disabled={busy}
                        onPress={onOpenSettings}
                        className="active:opacity-70"
                        style={styles.onboardingPrimaryButton}
                      >
                        <Text style={styles.onboardingPrimaryLabel}>端末の設定を開く</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={isIntroPrepareRetry ? 'もう一度試す' : 'オンにして試す'}
                      accessibilityState={{ disabled: busy, busy }}
                      disabled={busy}
                      onPress={onEnable}
                      className="active:opacity-70"
                      style={
                        showPermissionSettingsAction
                          ? styles.onboardingSecondaryButton
                          : styles.onboardingPrimaryButton
                      }
                    >
                      {busy ? (
                        <ActivityIndicator
                          size="small"
                          color={
                            showPermissionSettingsAction ? palette.lavenderDeep : palette.white
                          }
                        />
                      ) : null}
                      <Text
                        style={
                          showPermissionSettingsAction
                            ? styles.onboardingSecondaryLabel
                            : styles.onboardingPrimaryLabel
                        }
                      >
                        {busy ? '確認中…' : isIntroPrepareRetry ? 'もう一度試す' : 'オンにして試す'}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="オフのままはじめる"
                      disabled={busy}
                      onPress={handleOnboardingSkip}
                      className="active:opacity-70"
                      style={styles.onboardingSecondaryButton}
                    >
                      <Text style={styles.onboardingSecondaryLabel}>オフのままはじめる</Text>
                    </Pressable>
                  </>
                )}
              </View>

              <Text style={styles.onboardingFooter}>あとから設定で変更できます</Text>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType={reduceMotionEnabled ? 'none' : 'fade'}
      onRequestClose={isDismissLocked ? undefined : onDismiss}
    >
      <View
        style={[
          styles.overlay,
          {
            paddingTop: Math.max(20, safeAreaInsets.top + 12),
            paddingBottom: Math.max(20, safeAreaInsets.bottom + 12),
            paddingLeft: Math.max(22, safeAreaInsets.left + 14),
            paddingRight: Math.max(22, safeAreaInsets.right + 14),
          },
        ]}
      >
        <View accessibilityViewIsModal style={styles.card}>
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            style={styles.cardScroll}
            contentContainerStyle={styles.cardContent}
          >
            <TiltPhoneIllustration
              active={visible && setupPhase === 'intro'}
              reduceMotionEnabled={reduceMotionEnabled}
              tiltProgress={isCalibrating ? tiltProgress : null}
              phase={setupPhase}
            />
            <Text accessibilityLiveRegion="polite" style={styles.title}>
              {title}
            </Text>
            <Text accessibilityLiveRegion="polite" style={styles.body}>
              {body}
            </Text>
            {calibrationFeedback ? (
              <Text accessibilityLiveRegion="polite" style={styles.message}>
                {calibrationFeedback}
              </Text>
            ) : null}
            {message ? (
              <Text accessibilityLiveRegion="polite" style={styles.message}>
                {message}
              </Text>
            ) : null}

            <View style={styles.actions}>
              {setupPhase === 'success' ? null : isCalibrating ||
                setupPhase === 'preparing' ||
                setupPhase === 'saving' ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="左右に傾けて音声入力の設定をキャンセル"
                    disabled={isDismissLocked}
                    onPress={onDismiss}
                    style={[styles.choiceButton, styles.secondaryButton]}
                  >
                    <Text style={styles.secondaryLabel}>キャンセル</Text>
                  </Pressable>
                  {canRetry ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="傾きセンサーをもう一度試す"
                      accessibilityState={{ disabled: isDismissLocked, busy }}
                      disabled={isDismissLocked}
                      onPress={handleRetry}
                      style={[styles.choiceButton, styles.primaryButton]}
                    >
                      <Text style={styles.primaryLabel}>もう一度試す</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="今は音声入力を使わない"
                    disabled={busy}
                    onPress={onDismiss}
                    style={[styles.choiceButton, styles.secondaryButton]}
                  >
                    <Text style={styles.secondaryLabel}>今はしない</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="左右に傾けて音声入力を使ってみる"
                    accessibilityState={{ disabled: busy, busy }}
                    disabled={busy}
                    onPress={onEnable}
                    style={[styles.choiceButton, styles.primaryButton]}
                  >
                    {busy ? <ActivityIndicator size="small" color={palette.white} /> : null}
                    <Text style={styles.primaryLabel}>{busy ? '確認中…' : '動きを試す'}</Text>
                  </Pressable>
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(38,49,81,0.28)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '100%',
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
  cardScroll: {
    width: '100%',
  },
  cardContent: {
    alignItems: 'center',
    padding: 22,
  },
  onboardingSurface: {
    flex: 1,
    backgroundColor: appThemes.lavender.background,
  },
  onboardingAmbientLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  onboardingAmbientTopRight: {
    position: 'absolute',
    top: -36,
    right: -42,
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    backgroundColor: 'rgba(255,255,255,0.44)',
  },
  onboardingAmbientMiddleLeft: {
    position: 'absolute',
    top: 190,
    left: -52,
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.68)',
    backgroundColor: 'rgba(232,227,255,0.46)',
  },
  onboardingAmbientBottomRight: {
    position: 'absolute',
    bottom: 64,
    right: -28,
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.66)',
    backgroundColor: 'rgba(221,244,255,0.42)',
  },
  onboardingScroll: {
    flex: 1,
    width: '100%',
  },
  onboardingScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  onboardingInner: {
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
  },
  onboardingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  onboardingBadgeText: {
    color: palette.lavenderDeep,
    fontSize: 13,
    fontWeight: '700',
  },
  onboardingDemoBlock: {
    width: '100%',
    alignItems: 'center',
    marginTop: 18,
  },
  onboardingDemoStage: {
    width: '100%',
    minHeight: 164,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  onboardingDemoPhoneArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  onboardingLeftArrow: {
    opacity: 0.55,
  },
  onboardingRightArrow: {
    opacity: 0.55,
  },
  onboardingPhoneFrame: {
    width: 66,
    height: 116,
    borderWidth: 2,
    borderColor: '#B9A6F1',
    borderRadius: 21,
    padding: 5,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: palette.lavenderDeep,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 4,
  },
  demoWaveRow: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    marginBottom: 4,
  },
  demoWaveBar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: palette.lavenderDeep,
  },
  onboardingStepArrow: {
    opacity: 0.65,
  },
  onboardingDemoBubbleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingMemoBubble: {
    width: 102,
    height: 102,
    borderRadius: 51,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: palette.lavenderDeep,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 3,
  },
  onboardingMemoBubbleGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  onboardingMemoGloss: {
    position: 'absolute',
    top: 10,
    left: 16,
    width: 28,
    height: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.72)',
    transform: [{ rotate: '-22deg' }],
  },
  onboardingMemoTitle: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  onboardingMemoMeta: {
    marginTop: 2,
    color: palette.lavenderDeep,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  replayButton: {
    marginTop: 10,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  replayButtonText: {
    color: palette.lavenderDeep,
    fontSize: 13,
    fontWeight: '700',
  },
  onboardingCalibrationIllustrationWrap: {
    marginTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    paddingHorizontal: 28,
    paddingVertical: 18,
  },
  onboardingSuccessStage: {
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingSuccessBubble: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: palette.lavenderDeep,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 4,
  },
  onboardingSuccessBadge: {
    marginTop: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.mintDeep,
  },
  onboardingTitle: {
    marginTop: 20,
    color: palette.ink,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
    textAlign: 'center',
  },
  onboardingBody: {
    marginTop: 10,
    color: palette.inkSecondary,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '500',
    textAlign: 'center',
  },
  onboardingNoticeList: {
    width: '100%',
    marginTop: 16,
    gap: 8,
  },
  onboardingNoticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  onboardingNoticeIcon: {
    marginTop: 2,
  },
  onboardingNoticeText: {
    flex: 1,
    color: palette.inkSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  onboardingReassuranceBanner: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  onboardingReassuranceText: {
    flexShrink: 1,
    color: palette.ink,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    textAlign: 'center',
  },
  onboardingFeedback: {
    marginTop: 12,
    color: palette.lavenderDeep,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  onboardingErrorBanner: {
    width: '100%',
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(154,82,10,0.28)',
    backgroundColor: palette.warningSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  onboardingErrorText: {
    color: palette.warningText,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    textAlign: 'center',
  },
  onboardingActions: {
    width: '100%',
    marginTop: 20,
    gap: 10,
  },
  onboardingPrimaryButton: {
    width: '100%',
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    backgroundColor: palette.ink,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  onboardingPrimaryLabel: {
    color: palette.white,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  onboardingSecondaryButton: {
    width: '100%',
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  onboardingSecondaryLabel: {
    color: palette.ink,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    textAlign: 'center',
  },
  onboardingFooter: {
    marginTop: 14,
    color: palette.inkSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    textAlign: 'center',
  },
  buttonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  tiltIllustration: {
    width: 190,
    height: 132,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIllustration: {
    width: 190,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftTiltArrow: {
    position: 'absolute',
    left: 14,
    top: 54,
    opacity: 0.58,
  },
  rightTiltArrow: {
    position: 'absolute',
    right: 14,
    top: 54,
    opacity: 0.58,
  },
  phoneFrame: {
    width: 64,
    height: 112,
    borderWidth: 2,
    borderColor: '#B9A6F1',
    borderRadius: 21,
    padding: 5,
    backgroundColor: 'rgba(255,255,255,0.94)',
    shadowColor: palette.lavenderDeep,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  phoneScreen: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E7DEFF',
    borderRadius: 15,
    padding: 5,
    backgroundColor: '#F6F1FF',
  },
  phoneSpeaker: {
    width: 18,
    height: 3,
    marginTop: 1,
    borderRadius: 2,
    backgroundColor: '#C8B9F2',
  },
  phoneCamera: {
    position: 'absolute',
    top: 5,
    right: 7,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#A58BEA',
  },
  phoneScreenContent: {
    width: '100%',
    alignItems: 'center',
    marginTop: 20,
    gap: 6,
  },
  phoneScreenLineWide: {
    width: 30,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D7CBFA',
  },
  phoneScreenLine: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2D9FC',
  },
  phoneScreenBubble: {
    width: 28,
    height: 28,
    marginTop: 7,
    borderWidth: 1,
    borderColor: '#D1C0F5',
    borderRadius: 14,
    backgroundColor: '#EDE5FF',
  },
  phoneHomeIndicator: {
    position: 'absolute',
    bottom: 6,
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#B9A6F1',
  },
  title: {
    marginTop: 16,
    color: palette.ink,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    marginTop: 9,
    color: palette.inkSecondary,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '500',
    textAlign: 'center',
  },
  message: {
    marginTop: 12,
    color: palette.warningText,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 20,
    gap: 10,
  },
  choiceButton: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
  },
  primaryButton: {
    gap: 6,
    backgroundColor: palette.lavenderDeep,
  },
  primaryLabel: {
    color: palette.white,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.cloud,
  },
  secondaryLabel: {
    color: palette.ink,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    textAlign: 'center',
  },
});
