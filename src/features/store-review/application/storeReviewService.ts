import { isEligibleForStoreReview, type StoreReviewState } from '../domain/storeReviewPolicy';

export type StoreReviewTrigger = 'quick_add_closed' | 'bubble_deleted';

export type StoreReviewStateRepository = {
  getOrCreate(nowIso: string): Promise<StoreReviewState>;
  save(state: StoreReviewState): Promise<void>;
};

export type StoreReviewGateway = {
  isAvailable(): Promise<boolean>;
  requestReview(): Promise<void>;
};

export type StoreReviewAnalyticsGateway = {
  captureStoreReviewRequested(input: { trigger: StoreReviewTrigger; promptCount: number }): void;
};

export type StoreReviewDependencies = {
  repository: StoreReviewStateRepository;
  gateway: StoreReviewGateway;
  analytics?: StoreReviewAnalyticsGateway;
};

export function createStoreReviewService(dependencies: StoreReviewDependencies) {
  const { repository, gateway, analytics } = dependencies;
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  }

  async function recordPositiveMoment(input: {
    trigger: StoreReviewTrigger;
    incrementBy: number;
    eligibleToPrompt: boolean;
    now?: Date;
  }): Promise<boolean> {
    const increment = Math.max(0, Math.floor(input.incrementBy));
    if (increment === 0) return false;

    const now = input.now ?? new Date();
    const nowIso = now.toISOString();

    return enqueue(async () => {
      try {
        const current = await repository.getOrCreate(nowIso);
        const updated: StoreReviewState = {
          ...current,
          firstSeenAt: current.firstSeenAt ?? nowIso,
          successCount: current.successCount + increment,
        };
        await repository.save(updated);

        if (!input.eligibleToPrompt || !isEligibleForStoreReview(updated, now)) {
          return false;
        }

        const available = await gateway.isAvailable();
        if (!available) {
          return false;
        }

        const nextPromptCount = updated.promptCount + 1;
        await repository.save({
          ...updated,
          promptCount: nextPromptCount,
          lastPromptAt: nowIso,
        });

        await gateway.requestReview();
        analytics?.captureStoreReviewRequested({
          trigger: input.trigger,
          promptCount: nextPromptCount,
        });
        return true;
      } catch (error) {
        console.warn('Failed to process store review prompt', error);
        return false;
      }
    });
  }

  return {
    ensureFirstSeen(now = new Date()): Promise<void> {
      const nowIso = now.toISOString();
      return enqueue(async () => {
        try {
          await repository.getOrCreate(nowIso);
        } catch (error) {
          console.warn('Failed to initialize store review state', error);
        }
      });
    },

    recordQuickAddCompleted(
      createdCount: number,
      options: { eligibleToPrompt?: boolean; now?: Date } = {},
    ): Promise<boolean> {
      return recordPositiveMoment({
        trigger: 'quick_add_closed',
        incrementBy: createdCount,
        eligibleToPrompt: options.eligibleToPrompt ?? true,
        now: options.now,
      });
    },

    recordBubbleCompleted(
      options: { eligibleToPrompt?: boolean; now?: Date } = {},
    ): Promise<boolean> {
      return recordPositiveMoment({
        trigger: 'bubble_deleted',
        incrementBy: 1,
        eligibleToPrompt: options.eligibleToPrompt ?? true,
        now: options.now,
      });
    },
  };
}
