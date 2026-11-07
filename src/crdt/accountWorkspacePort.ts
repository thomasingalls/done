/** Internal composition port; native Account ownership and all verification stay outside the UI. */
import { createAdmittedWorkspace, type AdmittedWorkspace } from './admittedWorkspace';
import {
  createAdmissionOwner,
  type AdmissionCarrier,
  type OwnedReceiveQueue,
  type OwnedPreparedReceiveQueue,
  type OwnedJournalFenceQueue,
} from './admissionQueue';
import { accountBatchPolicy } from './accountBatchPolicy';
import { accountLedgerMode } from './accountLedgerMode';
import { accountTextMode } from './accountTextMode';
import type { AccountWorkspaceOptions } from './accountWorkspace';

export type AccountWorkspacePort = Pick<
  AdmittedWorkspace,
  'status' | 'whenDurable' | 'subscribe' | 'onStatus' | 'close'
> & {
  /** Original Page surface, with owned bytes. Worker scheduling uses data-free localChanges. */
  outgoing?: AdmittedWorkspace['outgoing'];
  localChanges?: (listener: () => void) => () => void;
};
type NativeAccountOwner = Awaited<
  ReturnType<(typeof import('./accountReceive'))['openAccountWorkerStore']>
>;
/** Only the trusted composition factory receives these real, already-authenticated owner closures. */
export type AccountWorkspaceOwnerContext = NativeAccountOwner;
export function listenToLocalWorkspaceChanges(
  workspace: AccountWorkspacePort,
  listener: () => void,
): () => void {
  if (workspace.localChanges) return workspace.localChanges(listener);
  if (!workspace.outgoing) throw Error('Workspace local-change subscription is unavailable');
  return workspace.outgoing((bytes) => {
    bytes.fill(0);
    listener();
  });
}
export interface AccountWorkspaceQueues<W extends AccountWorkspacePort> {
  readonly workspace: W;
  readonly enqueue: OwnedReceiveQueue;
  readonly prepare: OwnedPreparedReceiveQueue;
  readonly journalFence?: OwnedJournalFenceQueue;
}
export type AccountWorkspaceFactoryOptions = Pick<
  AccountWorkspaceOptions,
  'identity' | 'today' | 'signal'
>;
export type AccountWorkspaceFactory<W extends AccountWorkspacePort> = (
  carrier: AdmissionCarrier,
  deviceId: string,
  options: AccountWorkspaceFactoryOptions,
  owner?: AccountWorkspaceOwnerContext,
) => Promise<AccountWorkspaceQueues<W>>;

/** Existing page composition. No dummy workspace, alternative canonical document or queue. */
export const createPageAccountWorkspace: AccountWorkspaceFactory<AdmittedWorkspace> = async (
  carrier,
  deviceId,
  options,
) => {
  let enqueue!: OwnedReceiveQueue,
    prepare!: OwnedPreparedReceiveQueue,
    journalFence!: OwnedJournalFenceQueue;
  const ledgerMode = accountLedgerMode(import.meta.env?.['VITE_ACCOUNT_LEDGER']);
  const batching = accountBatchPolicy(import.meta.env?.['VITE_ACCOUNT_BATCH']);
  const workspace = await createAdmittedWorkspace(
    (config) =>
      createAdmissionOwner(
        carrier,
        {
          ...config,
          ...(batching.localFlush ? { flushBatch: batching.localFlush } : {}),
          ...(import.meta.env?.['VITE_ACCOUNT_BACKGROUND_FLUSH'] !== '0'
            ? { backgroundFlush: true as const }
            : {}),
          ...(batching.publication ? { publishReceivePage: true } : {}),
        },
        (receive, prepared, fenced) => {
          enqueue = receive;
          prepare = prepared;
          journalFence = fenced;
        },
      ),
    {
      identity: options.identity,
      deviceLabelId: deviceId,
      captureSources: true,
      suppressEmptySources: true,
      validateReceive: () => {
        throw Error('Use the owned signed-page receiver');
      },
      ...(options.today ? { today: options.today } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    },
    ledgerMode === 'incremental'
      ? accountTextMode(import.meta.env?.['VITE_ACCOUNT_TEXT_ADMISSION'])
      : 'reference',
  );
  return { workspace, enqueue, prepare, journalFence };
};
