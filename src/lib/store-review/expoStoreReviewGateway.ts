import * as StoreReview from 'expo-store-review';

import type { StoreReviewGateway } from '../../features/store-review/application/storeReviewService';

export const expoStoreReviewGateway: StoreReviewGateway = {
  async isAvailable() {
    try {
      return await StoreReview.isAvailableAsync();
    } catch {
      return false;
    }
  },

  async requestReview() {
    await StoreReview.requestReview();
  },
};
