import { prepareAccountCustody, attachJournal, type ContentInput } from './custody';
import { openAccountWriteSession } from './writeSession';
import { verifyAccountUnderPermit, type AccountStartupOptions } from './accountStartup';
import { withPromotionRoot, signPromotion, writePromotion } from './promotionRecord';
import { identity } from './custodyRecord';
/** Private Account composition: verification, activation, carrier and cleanup share one permit. */
export const openAccountJournalSession = async (
  input: AccountStartupOptions,
  principalId: string,
) => {
  const options = { ...input, pin: structuredClone(input.pin) };
  identity(principalId);
  let owner: ReturnType<typeof prepareAccountCustody> | undefined;
  const cleanups = new Set<() => void | Promise<void>>();
  let account!: Awaited<
    ReturnType<(typeof import('./accountStartup'))['verifyAccountUnderPermit']>
  >['account'];
  const live = await openAccountWriteSession(options.slotId, options.code, {
    ...(options.signal ? { signal: options.signal } : {}),
    initialize: async (task) => {
      const verified = await verifyAccountUnderPermit(task, options);
      if (verified.marker.v >= 6) throw Error('Account requires the source-capture owner');
      if (verified.account.principalId !== principalId)
        throw Error('Account actor identity changed');
      account = verified.account;
      owner = prepareAccountCustody(
        {
          slotId: options.slotId,
          workspaceId: account.workspaceId,
          resolvePrincipal: () => account.principalId,
        },
        options.code,
      );
      await owner.initialize(task);
      if (verified.marker.v === 4) {
        await withPromotionRoot(
          task,
          verified.claim,
          verified.record,
          options.code,
          async (root, subtle) => {
            const next = await signPromotion(
              root,
              { ...verified.marker, v: 5, stage: 'account-active' },
              subtle,
            );
            await writePromotion(
              task,
              verified.claim,
              verified.record,
              verified.record,
              verified.marker,
              next,
            );
          },
        );
      }
    },
    dispose: async () => {
      try {
        for (const cleanup of cleanups) await cleanup();
        cleanups.clear();
      } finally {
        owner?.dispose();
      }
    },
  });
  const carrier = attachJournal(owner!, live);
  // A native generation fence is a lifetime invalidation, not retryable admission pressure.
  const checked = <T>(operation: () => Promise<T>) =>
    operation().catch(async (cause: unknown) => {
      if (
        cause &&
        typeof cause === 'object' &&
        'code' in cause &&
        cause.code === 'generation-changed'
      )
        void carrier.close().catch(() => {});
      throw cause;
    });
  return {
    account,
    carrier: Object.freeze({
      ...carrier,
      beforeRelease(cleanup: () => void | Promise<void>) {
        live.write(() => cleanups.add(cleanup));
      },
      get state() {
        return carrier.state;
      },
      get observedJournalCharacters() {
        return carrier.observedJournalCharacters;
      },
      appendBatch: (input: readonly ContentInput[]) => checked(() => carrier.appendBatch(input)),
      loadRecords: () => checked(() => carrier.loadRecords()),
      loadRecovery: () => checked(() => carrier.loadRecovery()),
      flushJournal: () => checked(() => carrier.flushJournal()),
      compactContent: () => checked(() => carrier.compactContent()),
    }),
  };
};
