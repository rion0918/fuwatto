type AnalyticsEvent = {
  event: string;
  properties: Record<string, unknown>;
};

let mockBeforeSend: (event: AnalyticsEvent) => AnalyticsEvent | null;

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('expo-file-system/legacy', () => ({ documentDirectory: null }));

jest.mock('posthog-react-native', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((_key, options) => {
    mockBeforeSend = options.before_send;
    return { optedOut: false, optIn: jest.fn() };
  }),
}));

async function loadBeforeSend() {
  const previousKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
  process.env.EXPO_PUBLIC_POSTHOG_API_KEY = 'test-project-key';
  try {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { posthogAnalytics } = require('./posthogAnalytics');
    await posthogAnalytics.setCaptureEnabled(true);
    return mockBeforeSend;
  } finally {
    if (previousKey === undefined) delete process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
    else process.env.EXPO_PUBLIC_POSTHOG_API_KEY = previousKey;
  }
}

it('preserves the SDK geoip opt-out while removing personal event properties', async () => {
  const beforeSend = await loadBeforeSend();

  expect(
    beforeSend({
      event: 'reminder created',
      properties: {
        distinct_id: 'anonymous-id',
        $geoip_disable: true,
        source: 'home_button',
        status: 'denied',
        environment: 'production',
        analytics_version: 2,
        platform: 'android',
        app_version: '0.1.0',
        app_build: '12',
        quick_add_id: 'anonymous-sheet-visit',
        input_mode: 'voice',
        elapsed_seconds: 5,
        first_in_quick_add: true,
        created_count: 1,
        title: 'private reminder',
        $ip: '192.0.2.1',
        $device_model: 'private device',
      },
    }),
  ).toEqual({
    event: 'reminder created',
    properties: {
      distinct_id: 'anonymous-id',
      $geoip_disable: true,
      source: 'home_button',
      status: 'denied',
      environment: 'production',
      analytics_version: 2,
      platform: 'android',
      app_version: '0.1.0',
      app_build: '12',
      quick_add_id: 'anonymous-sheet-visit',
      input_mode: 'voice',
      elapsed_seconds: 5,
      first_in_quick_add: true,
      created_count: 1,
    },
  });
  expect(beforeSend({ event: '$autocapture', properties: {} })).toBeNull();
});

it('preserves trigger and prompt_count for store review requested while removing disallowed properties', async () => {
  const beforeSend = await loadBeforeSend();

  expect(
    beforeSend({
      event: 'store review requested',
      properties: {
        distinct_id: 'anonymous-id',
        $geoip_disable: true,
        analytics_version: 2,
        environment: 'production',
        platform: 'android',
        app_version: '1.1.1',
        app_build: '14',
        trigger: 'quick_add_closed',
        prompt_count: 1,
        title: 'private reminder',
        reminder_id: 'rem-1',
        $ip: '192.0.2.1',
        $device_model: 'private device',
        unexpected_key: 'drop-me',
      },
    }),
  ).toEqual({
    event: 'store review requested',
    properties: {
      distinct_id: 'anonymous-id',
      $geoip_disable: true,
      analytics_version: 2,
      environment: 'production',
      platform: 'android',
      app_version: '1.1.1',
      app_build: '14',
      trigger: 'quick_add_closed',
      prompt_count: 1,
    },
  });

  expect(
    beforeSend({
      event: 'store review requested',
      properties: {
        distinct_id: 'anonymous-id',
        trigger: 'bubble_deleted',
        prompt_count: 2,
        title: 'secret',
      },
    }),
  ).toEqual({
    event: 'store review requested',
    properties: {
      distinct_id: 'anonymous-id',
      trigger: 'bubble_deleted',
      prompt_count: 2,
    },
  });
});
