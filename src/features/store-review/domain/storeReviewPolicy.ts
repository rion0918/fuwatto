export type StoreReviewState = {
  id: string;
  firstSeenAt: string | null;
  successCount: number;
  promptCount: number;
  lastPromptAt: string | null;
};

export const STORE_REVIEW_MIN_SUCCESS_COUNT = 3;
export const STORE_REVIEW_MIN_AGE_MS = 48 * 60 * 60 * 1000;
export const STORE_REVIEW_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;
export const STORE_REVIEW_MAX_PROMPTS = 3;

export function isEligibleForStoreReview(state: StoreReviewState, now: Date): boolean {
  if (!state.firstSeenAt) return false;

  const firstSeenMs = Date.parse(state.firstSeenAt);
  if (!Number.isFinite(firstSeenMs)) return false;

  const nowMs = now.getTime();
  if (nowMs - firstSeenMs < STORE_REVIEW_MIN_AGE_MS) return false;
  if (state.successCount < STORE_REVIEW_MIN_SUCCESS_COUNT) return false;
  if (state.promptCount >= STORE_REVIEW_MAX_PROMPTS) return false;

  if (state.lastPromptAt) {
    const lastPromptMs = Date.parse(state.lastPromptAt);
    if (Number.isFinite(lastPromptMs) && nowMs - lastPromptMs < STORE_REVIEW_COOLDOWN_MS) {
      return false;
    }
  }

  return true;
}
