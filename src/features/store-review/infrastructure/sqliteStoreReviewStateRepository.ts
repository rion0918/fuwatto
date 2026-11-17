import { eq } from 'drizzle-orm';

import { db } from '../../../db/client';
import { storeReviewState, type StoreReviewStateRow } from '../../../db/schema';
import type { StoreReviewStateRepository } from '../application/storeReviewService';
import type { StoreReviewState } from '../domain/storeReviewPolicy';

const DEFAULT_STORE_REVIEW_STATE_ID = 'default';

function toDomain(row: StoreReviewStateRow): StoreReviewState {
  return {
    id: row.id,
    firstSeenAt: row.firstSeenAt,
    successCount: row.successCount,
    promptCount: row.promptCount,
    lastPromptAt: row.lastPromptAt,
  };
}

export const sqliteStoreReviewStateRepository: StoreReviewStateRepository = {
  async getOrCreate(nowIso: string) {
    const rows = await db
      .select()
      .from(storeReviewState)
      .where(eq(storeReviewState.id, DEFAULT_STORE_REVIEW_STATE_ID))
      .limit(1);

    if (rows[0]) {
      if (rows[0].firstSeenAt) {
        return toDomain(rows[0]);
      }

      await db
        .update(storeReviewState)
        .set({ firstSeenAt: nowIso })
        .where(eq(storeReviewState.id, DEFAULT_STORE_REVIEW_STATE_ID));
      return toDomain({ ...rows[0], firstSeenAt: nowIso });
    }

    const initial: StoreReviewStateRow = {
      id: DEFAULT_STORE_REVIEW_STATE_ID,
      firstSeenAt: nowIso,
      successCount: 0,
      promptCount: 0,
      lastPromptAt: null,
    };
    await db.insert(storeReviewState).values(initial).onConflictDoNothing();

    const persisted = await db
      .select()
      .from(storeReviewState)
      .where(eq(storeReviewState.id, DEFAULT_STORE_REVIEW_STATE_ID))
      .limit(1);

    return toDomain(persisted[0] ?? initial);
  },

  async save(state) {
    await db
      .update(storeReviewState)
      .set({
        firstSeenAt: state.firstSeenAt,
        successCount: state.successCount,
        promptCount: state.promptCount,
        lastPromptAt: state.lastPromptAt,
      })
      .where(eq(storeReviewState.id, state.id));
  },
};
