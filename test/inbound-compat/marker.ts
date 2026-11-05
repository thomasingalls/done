/** Read-only authenticated metadata; never grants permission to an old reader. */
import { withPromotionSlot } from '../../src/crdt/writeSession';
import { readPromotion, storePromotion } from '../../src/crdt/promotionRecord';
export const authenticatedMarker = (slot: string, code: string) =>
  withPromotionSlot(slot, code, async (task) => {
    const state = await readPromotion(task, slot, code);
    if (!state.marker) throw Error('Expected original account marker');
    return storePromotion(state.marker);
  });
