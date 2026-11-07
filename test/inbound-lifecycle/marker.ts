/** Fresh native/MAC-authenticated metadata only; never returns keys or a permission. */
import { withPromotionSlot, withJoinedSlot } from '../../src/crdt/writeSession';
import { readPromotion } from '../../src/crdt/promotionRecord';
import { readJoinedAccount } from '../../src/crdt/joinedAccount';
import { captureInboundReceiptVersion } from '../../src/crdt/inboundReceiptVersion';
export async function floor(kind: 'promotion' | 'joined', slot: string, code: string) {
  if (kind === 'joined')
    return withJoinedSlot(slot, code, async (task) => {
      const { marker } = await readJoinedAccount(task, slot, code);
      if (!marker) throw Error('Expected authenticated joined marker');
      return {
        floor: marker.inboundReceiptVersion ?? null,
        reading: captureInboundReceiptVersion(marker.reading).inboundReceiptVersion ?? null,
      };
    });
  return withPromotionSlot(slot, code, async (task) => {
    const { marker } = await readPromotion(task, slot, code);
    if (!marker) throw Error('Expected authenticated original marker');
    return { floor: marker.inboundReceiptVersion ?? null, reading: null };
  });
}
