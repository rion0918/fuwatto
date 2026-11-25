import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isEligibleForStoreReview,
  STORE_REVIEW_COOLDOWN_MS,
  STORE_REVIEW_MAX_PROMPTS,
  STORE_REVIEW_MIN_AGE_MS,
  STORE_REVIEW_MIN_SUCCESS_COUNT,
  type StoreReviewState,
} from './storeReviewPolicy';

const BASE_TIME = Date.parse('2026-11-17T00:00:00.000Z');

function makeState(overrides: Partial<StoreReviewState> = {}): StoreReviewState {
  return {
    id: 'default',
    firstSeenAt: new Date(BASE_TIME - STORE_REVIEW_MIN_AGE_MS).toISOString(),
    successCount: STORE_REVIEW_MIN_SUCCESS_COUNT,
    promptCount: 0,
    lastPromptAt: null,
    ...overrides,
  };
}

test('requires firstSeenAt to be at least 48 hours in the past', () => {
  const now = new Date(BASE_TIME);
  assert.equal(isEligibleForStoreReview(makeState({ firstSeenAt: null }), now), false);
  assert.equal(
    isEligibleForStoreReview(
      makeState({ firstSeenAt: new Date(BASE_TIME - STORE_REVIEW_MIN_AGE_MS + 1).toISOString() }),
      now,
    ),
    false,
  );
  assert.equal(isEligibleForStoreReview(makeState(), now), true);
});

test('requires at least 3 positive outcomes before prompting', () => {
  const now = new Date(BASE_TIME);
  assert.equal(
    isEligibleForStoreReview(makeState({ successCount: STORE_REVIEW_MIN_SUCCESS_COUNT - 1 }), now),
    false,
  );
  assert.equal(isEligibleForStoreReview(makeState(), now), true);
});

test('enforces maximum prompt count and 90-day cooldown', () => {
  const now = new Date(BASE_TIME);
  assert.equal(
    isEligibleForStoreReview(makeState({ promptCount: STORE_REVIEW_MAX_PROMPTS }), now),
    false,
  );
  assert.equal(
    isEligibleForStoreReview(
      makeState({
        promptCount: 1,
        lastPromptAt: new Date(BASE_TIME - STORE_REVIEW_COOLDOWN_MS + 1).toISOString(),
      }),
      now,
    ),
    false,
  );
  assert.equal(
    isEligibleForStoreReview(
      makeState({
        promptCount: 1,
        lastPromptAt: new Date(BASE_TIME - STORE_REVIEW_COOLDOWN_MS).toISOString(),
      }),
      now,
    ),
    true,
  );
});
