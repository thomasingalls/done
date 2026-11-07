import {
  cohortNames,
  captureTicket,
  inactive,
  cancelled,
  requireNativeLocks,
  type AccountWorkerTicket,
} from './nativeCoordination';

/** Internal dedicated-worker join strategy, not an Account verifier or an application API.
 * An exclusive per-incarnation member also refuses a replayed ticket in a second worker. */
export function createAccountWorkerJoin(input: AccountWorkerTicket) {
  if (typeof window !== 'undefined') throw inactive();
  const ticket = captureTicket(input),
    n = cohortNames(ticket.slotId, ticket.incarnation);
  const locks = requireNativeLocks();
  let used = false;
  const check = async (signal?: AbortSignal) => {
    if (signal?.aborted) throw cancelled();
    const held = (await locks.query()).held ?? [];
    for (const [name, mode] of [
      [n.reservation, 'exclusive'],
      [n.anchor, 'exclusive'],
      [n.slot, 'shared'],
    ] as const)
      if (
        !held.some((v) => v.name === name && v.mode === mode && v.clientId === ticket.windowClient)
      )
        throw inactive();
    if (signal?.aborted) throw cancelled();
  };
  return Object.freeze({
    async request<T>(
      name: string,
      options: { mode?: LockMode; signal?: AbortSignal },
      callback: (lock: Lock) => T | PromiseLike<T>,
    ): Promise<T> {
      if (used || name !== n.slot || options.mode !== 'shared') throw inactive();
      used = true;
      await check(options.signal);
      // ifAvailable cannot be combined with signal. Check cancellation explicitly before callback;
      // the original WriteSession owns abort/drain once its real native callback starts.
      return locks.request(n.member, { mode: 'exclusive', ifAvailable: true }, async (member) => {
        if (!member) throw inactive();
        return locks.request(n.slot, { mode: 'shared', ifAvailable: true }, async (slot) => {
          if (!slot) throw inactive();
          await check(options.signal);
          return callback(slot);
        });
      });
    },
  });
}
