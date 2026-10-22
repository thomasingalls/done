/** A private pre-effect refusal: a receive committed before history reached the storage tail. */
export class HistoryReceivePending extends Error {
  constructor() {
    super('Receiving is still settling. Retry history maintenance.');
  }
}

/** Wait outside admission/storage so an existing handoff can finish. The operation must recheck
 * pending promotions under its serialized storage task, before any history effect. Only that
 * pre-effect refusal may retry; authority, storage and ambiguous mutation failures propagate. */
export async function afterReceivedHandoffs<T>(
  whenDurable: () => Promise<void>,
  operation: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await whenDurable();
    try {
      return await operation();
    } catch (cause) {
      if (!(cause instanceof HistoryReceivePending) || attempt === 2) throw cause;
    }
  }
}
