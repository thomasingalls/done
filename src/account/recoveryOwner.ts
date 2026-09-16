import { withPromotionSlot } from '../crdt/writeSession';
import { readPromotion } from '../crdt/promotionRecord';
import { promotionLineage } from '../crdt/promotionPreparation';
import { type AuthorityPin, parseAuthorityPin } from '../../account-protocol/authority';
import { verifyPendingProof } from '../../account-protocol/preparation';
import { random, hex } from '../crdt/custodyCrypto';
import {
  context,
  parseDraft,
  draftDigest,
  recoveryStateDigest,
  type RecoveryContext,
  type RecoveryDraft,
} from '../../account-protocol/recovery.ts';
import { generateRecovery, confirmRecovery } from './recovery.ts';

export const RECOVERY_PREPARATION_DB = 'done.account-recovery-preparation.v1';
export interface RecoveryTransport {
  begin(input: { retryKey: string; draft: RecoveryDraft }): Promise<unknown>;
  finish(input: Finalization): Promise<unknown>;
  abandon?(input: { retryKey: string; accountId: string; nonce: string }): Promise<unknown>;
}
interface Finalization {
  retryKey: string;
  recoveryId: string;
  response: unknown;
  recoveryProof: string;
}
interface Retained {
  v: 1;
  accountId: string;
  retryKey: string;
  draft: RecoveryDraft;
  finalization: Finalization | null;
}
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Malformed recovery progress');
  return value as Record<string, unknown>;
};
const identifier = (value: string) => {
  if (!/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value))
    throw Error('Invalid attempt capability or account');
};

/** One profile owner. The future promotion owner supplies/revalidates this trusted context.
 * The transport is already bound to the selected service; replies cannot choose a new target.
 */
export async function withRecoveryOwner<T>(
  options: {
    context: RecoveryContext;
    pin?: AuthorityPin;
    local?: { slotId: string; code: string };
    /** Opt in for newly allocated slots; existing callers keep their retained `pending` record. */
    perSlotProgress?: true;
    accountId: string;
    retryKey: string;
    transport: RecoveryTransport;
    signal?: AbortSignal;
  },
  work: (owner: {
    generate(): Promise<{ code: string }>;
    status(): Promise<'empty' | 'awaiting-code' | 'finalization-pending'>;
    confirm(code: string, assertion: (options: unknown) => Promise<unknown>): Promise<unknown>;
    resume(): Promise<unknown>;
    abandon(): Promise<void>;
    draft(): Promise<RecoveryDraft>;
  }) => Promise<T>,
): Promise<T> {
  const scope = context(options.context),
    accountId = options.accountId,
    retryKey = options.retryKey,
    pin = options.pin ? parseAuthorityPin(options.pin) : undefined;
  identifier(accountId);
  identifier(retryKey);
  const local = options.local ? { ...options.local } : undefined;
  if (options.perSlotProgress && !local) throw Error('Local recovery slot required');
  const progressKey = options.perSlotProgress ? `slot:${local!.slotId}` : 'pending';
  const transport = options.transport,
    signal = options.signal;
  return navigator.locks.request(
    RECOVERY_PREPARATION_DB,
    { mode: 'exclusive', ifAvailable: true },
    async (lock) => {
      if (!lock) throw Error('Recovery preparation is open in another tab');
      let alive = true,
        busy = false;
      const guard = () => {
        if (!alive || signal?.aborted) throw Error('Recovery preparation closed');
      };
      guard();
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(RECOVERY_PREPARATION_DB, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('progress');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      db.onversionchange = () => {
        alive = false;
        db.close();
      };
      const access = (value?: Retained | null) =>
        new Promise<unknown>((resolve, reject) => {
          guard();
          const tx = db.transaction('progress', value !== undefined ? 'readwrite' : 'readonly', {
            durability: 'strict',
          });
          const store = tx.objectStore('progress'),
            request =
              value === null
                ? store.delete(progressKey)
                : value
                  ? store.put(value, progressKey)
                  : store.get(progressKey);
          tx.oncomplete = () => resolve(request.result);
          tx.onabort = () => reject(tx.error ?? Error('Recovery progress write aborted'));
          tx.onerror = () => {};
        });
      const load = async (): Promise<Retained | undefined> => {
        const input = await access();
        guard();
        if (input === undefined) return;
        const saved = record(input);
        if (
          Object.keys(saved).sort().join() !== 'accountId,draft,finalization,retryKey,v' ||
          saved['v'] !== 1 ||
          saved['accountId'] !== accountId ||
          saved['retryKey'] !== retryKey
        )
          throw Error('Recovery owner mismatch');
        const draft = parseDraft(saved['draft']);
        for (const key of ['principalId', 'workspaceId', 'lineageId', 'authRoot'] as const)
          if (draft[key] !== scope[key]) throw Error('Recovery target changed');
        if (saved['finalization'] !== null) {
          const proof = record(saved['finalization']);
          if (
            Object.keys(proof).sort().join() !== 'recoveryId,recoveryProof,response,retryKey' ||
            proof['retryKey'] !== retryKey ||
            typeof proof['recoveryId'] !== 'string' ||
            typeof proof['recoveryProof'] !== 'string' ||
            !/^[0-9a-f]{128}$/.test(proof['recoveryProof'])
          )
            throw Error('Malformed retained proof');
          identifier(proof['recoveryId']);
        }
        return {
          v: 1,
          accountId,
          retryKey,
          draft,
          finalization: saved['finalization'] as Finalization | null,
        };
      };
      // Hold the lock until the in-flight work settles, even if a caller forgets to await it.
      let pending: Promise<unknown> = Promise.resolve();
      const owned = <R>(action: () => Promise<R>): Promise<R> => {
        guard();
        if (busy) return Promise.reject(Error('Recovery operation in progress'));
        busy = true;
        const operation = action().finally(() => {
          busy = false;
        });
        pending = operation.catch(() => {});
        return operation;
      };
      const checkedResult = async (saved: Retained, input: unknown) => {
        guard();
        const result = record(input);
        if (result['ok'] !== true) return input;
        if (
          result['accountId'] !== accountId ||
          result['draftDigest'] !== (await draftDigest(saved.draft))
        )
          throw Error('Recovery service binding mismatch');
        guard();
        if (result['stage'] === 'recovery-confirmed') {
          if (
            result['recoveryStateDigest'] !== (await recoveryStateDigest(saved.draft)) ||
            (saved.finalization && result['recoveryId'] !== saved.finalization.recoveryId)
          )
            throw Error('Recovery receipt mismatch');
          guard();
        } else if (result['stage'] !== 'recovery-ceremony')
          throw Error('Unexpected recovery stage');
        return input;
      };
      const send = async (saved: Retained) => {
        if (!saved.finalization) throw Error('Re-enter the saved recovery code');
        const input = await checkedResult(
          saved,
          await transport.finish(structuredClone(saved.finalization)),
        );
        const result = record(input);
        if (result['ok'] === true && result['stage'] !== 'recovery-confirmed')
          throw Error('Unexpected finalization result');
        return input;
      };
      try {
        return await work({
          draft: () =>
            owned(async () => {
              const saved = await load();
              if (!saved) throw Error('No retained recovery draft');
              return structuredClone(saved.draft);
            }),
          abandon: () =>
            owned(async () => {
              const saved = await load();
              if (!saved) return;
              if (!pin || pin.authRoot !== scope.authRoot || !transport.abandon)
                throw Error('Pinned abandonment transport required');
              if (!local) throw Error('Local owner is required to release recovery preparation');
              await withPromotionSlot(
                local.slotId,
                local.code,
                async (task) => {
                  const source = await readPromotion(task, local.slotId, local.code);
                  if (source.marker) throw Error('Abandon retained Local promotion first');
                  const { localCensus } = await task.wait(
                    () => import('../crdt/localGenesisStorage'),
                  );
                  await localCensus(task, source.claim);
                  const c = source.claim.initial;
                  if (
                    c.principal_id !== scope.principalId ||
                    c.workspace_id !== scope.workspaceId ||
                    (await promotionLineage(pin, accountId, {
                      slotId: local.slotId,
                      principalId: c.principal_id,
                      workspaceId: c.workspace_id,
                      storeId: c.store_id,
                      rootId: c.root_id,
                      genesisIntentId: c.creation_intent!.id,
                      generation: 1,
                    })) !== scope.lineageId
                  )
                    throw Error('Recovery Local target changed');
                  const nonce = hex(random(32));
                  const state = await task.wait(async () =>
                    verifyPendingProof(
                      pin,
                      nonce,
                      await transport.abandon!({ retryKey, accountId, nonce }),
                    ),
                  );
                  guard();
                  if (
                    state.status !== 'abandoned' ||
                    state.accountId !== accountId ||
                    (state.draft &&
                      (await draftDigest(state.draft)) !== (await draftDigest(saved.draft)))
                  )
                    throw Error('Recovery abandonment mismatch');
                  guard();
                  await task.wait(() => access(null));
                  guard();
                },
                signal,
              );
            }),
          generate: () =>
            owned(async () => {
              if (await load())
                throw Error('A recovery code was already generated; re-enter the saved code');
              const generated = await generateRecovery(scope);
              guard();
              await access({
                v: 1,
                accountId,
                retryKey,
                draft: generated.draft,
                finalization: null,
              });
              guard();
              return { code: generated.code };
            }),
          status: () =>
            owned(async () => {
              const saved = await load();
              return !saved
                ? 'empty'
                : saved.finalization
                  ? 'finalization-pending'
                  : 'awaiting-code';
            }),
          resume: () =>
            owned(async () => {
              const saved = await load();
              if (!saved) throw Error('Generate and save a recovery code first');
              return send(saved);
            }),
          confirm: (code, assertion) =>
            owned(async () => {
              const saved = await load();
              if (!saved) throw Error('Generate and save a recovery code first');
              if (saved.finalization) return send(saved);
              const input = await transport.begin({
                retryKey,
                draft: structuredClone(saved.draft),
              });
              const result = record(await checkedResult(saved, input));
              if (result['ok'] !== true) return input;
              // A server receipt alone cannot skip the local re-entry gate.
              if (result['stage'] !== 'recovery-ceremony')
                throw Error('No locally retained confirmation proof');
              const request = record(result['options']);
              const challenge = request['challenge'];
              if (typeof challenge !== 'string' || typeof result['recoveryId'] !== 'string')
                throw Error('Malformed ceremony');
              identifier(result['recoveryId']);
              const recoveryProof = await confirmRecovery(
                saved.draft,
                code,
                challenge,
                result['draftDigest'] as string,
              );
              guard();
              const response = structuredClone(await assertion(structuredClone(request)));
              guard();
              saved.finalization = {
                retryKey,
                recoveryId: result['recoveryId'],
                recoveryProof,
                response,
              };
              // Exact proofs survive a lost response; neither code nor private keys are retained.
              await access(saved);
              guard();
              return send(saved);
            }),
        });
      } finally {
        alive = false;
        await pending;
        db.close();
      }
    },
  );
}
