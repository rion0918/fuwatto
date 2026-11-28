import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

type WidgetRouteIntent = { action?: string; id?: string; intent?: string };

export function useWidgetDetailIntent(
  { action, id, intent }: WidgetRouteIntent,
  refresh: () => Promise<readonly { id: string }[]>,
  open: (id: string) => void,
  enabled = true,
) {
  const [attempt, setAttempt] = useState(0);
  const consumedIntentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || action !== 'view' || !id || !intent || consumedIntentRef.current === intent) {
      return;
    }
    let cancelled = false;

    void refresh().then(
      (reminders) => {
        if (cancelled) return;
        consumedIntentRef.current = intent;
        if (reminders.some((reminder) => reminder.id === id)) {
          open(id);
        } else {
          Alert.alert('リマインダーが見つかりません', 'この予定はすでに削除されています。');
        }
      },
      () => {
        if (cancelled) return;
        Alert.alert('リマインダーを読み込めませんでした', 'もう一度お試しください。', [
          {
            text: '閉じる',
            style: 'cancel',
            onPress: () => {
              if (!cancelled) consumedIntentRef.current = intent;
            },
          },
          {
            text: '再試行',
            onPress: () => {
              if (!cancelled) setAttempt((value) => value + 1);
            },
          },
        ]);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [action, enabled, id, intent, attempt, refresh, open]);
}
