import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { StoreReviewState } from '../domain/storeReviewPolicy';
import { createStoreReviewService } from './storeReviewService';

function createFixture(options?: {
  initialState?: StoreReviewState;
  available?: boolean;
  failRequest?: boolean;
}) {
  let state: StoreReviewState | null = options?.initialState ?? null;
  let reviewCalls = 0;
  const analyticsEvents: { trigger: string; promptCount: number }[] = [];

  const service = createStoreReviewService({
    repository: {
      async getOrCreate(nowIso) {
        if (!state) {
          state = {
            id: 'default',
            firstSeenAt: nowIso,
            successCount: 0,
            promptCount: 0,
            lastPromptAt: null,
          };
        } else if (!state.firstSeenAt) {
          state = { ...state, firstSeenAt: nowIso };
        }
        return { ...state };
      },
      async save(next) {
        state = { ...next };
      },
    },
    gateway: {
      async isAvailable() {
        return options?.available ?? true;
      },
      async requestReview() {
        reviewCalls += 1;
        if (options?.failRequest) throw new Error('store review failed');
      },
    },
    analytics: {
      captureStoreReviewRequested(event) {
        analyticsEvents.push(event);
      },
    },
  });

  return {
    service,
    getState: () => state,
    getReviewCalls: () => reviewCalls,
    analyticsEvents,
  };
}

test('does not prompt before 48h or 3 successes, then prompts cleanly once eligible', async () => {
  const day0 = new Date('2026-11-17T00:00:00.000Z');
  const day1 = new Date('2026-11-18T00:00:00.000Z');
  const day3 = new Date('2026-11-20T00:00:00.000Z');
  const fixture = createFixture();

  await fixture.service.ensureFirstSeen(day0);
  assert.equal(await fixture.service.recordQuickAddCompleted(2, { now: day1 }), false);
  assert.equal(fixture.getReviewCalls(), 0);
  assert.equal(fixture.getState()?.successCount, 2);

  assert.equal(await fixture.service.recordBubbleCompleted({ now: day3 }), true);
  assert.equal(fixture.getReviewCalls(), 1);
  assert.equal(fixture.getState()?.promptCount, 1);
  assert.equal(fixture.getState()?.lastPromptAt, day3.toISOString());
  assert.deepEqual(fixture.analyticsEvents, [{ trigger: 'bubble_deleted', promptCount: 1 }]);

  assert.equal(await fixture.service.recordBubbleCompleted({ now: day3 }), false);
  assert.equal(fixture.getReviewCalls(), 1);
});

test('increments success count without prompting when eligibleToPrompt is false', async () => {
  const day0 = new Date('2026-11-17T00:00:00.000Z');
  const day3 = new Date('2026-11-20T00:00:00.000Z');
  const fixture = createFixture({
    initialState: {
      id: 'default',
      firstSeenAt: day0.toISOString(),
      successCount: 2,
      promptCount: 0,
      lastPromptAt: null,
    },
  });

  assert.equal(
    await fixture.service.recordQuickAddCompleted(1, { eligibleToPrompt: false, now: day3 }),
    false,
  );
  assert.equal(fixture.getState()?.successCount, 3);
  assert.equal(fixture.getReviewCalls(), 0);

  assert.equal(await fixture.service.recordQuickAddCompleted(1, { now: day3 }), true);
  assert.equal(fixture.getReviewCalls(), 1);
  assert.deepEqual(fixture.analyticsEvents, [{ trigger: 'quick_add_closed', promptCount: 1 }]);
});

test('does not increment promptCount when store review is unavailable', async () => {
  const fixture = createFixture({
    available: false,
    initialState: {
      id: 'default',
      firstSeenAt: '2026-11-10T00:00:00.000Z',
      successCount: 5,
      promptCount: 0,
      lastPromptAt: null,
    },
  });

  assert.equal(await fixture.service.recordBubbleCompleted(), false);
  assert.equal(fixture.getState()?.promptCount, 0);
  assert.equal(fixture.getReviewCalls(), 0);
});

test('swallows requestReview errors without throwing to callers', async () => {
  const fixture = createFixture({
    failRequest: true,
    initialState: {
      id: 'default',
      firstSeenAt: '2026-11-10T00:00:00.000Z',
      successCount: 5,
      promptCount: 0,
      lastPromptAt: null,
    },
  });

  assert.equal(await fixture.service.recordBubbleCompleted(), false);
  assert.equal(fixture.getState()?.promptCount, 1);
});
