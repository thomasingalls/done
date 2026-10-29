import { openOwnedLocalWorkerJournal } from './localWorkerStore';
import type { StartupAuthority } from './startupClassification';
import { captureCreationSeed, eraseCreationSeed, type CreationSeed } from './creationSeed';
/** Verified fresh Local creation. No account binding, caller-supplied principal, or implicit replacement. */
import { generateDeviceCode, normalizeDeviceCode, random, hex } from './custodyCrypto';
import { identity, type CustodyScope } from './custodyRecord';
import { createCustodyUnderPermit, checkContentUnderPermit, CustodyError } from './custody';
import { withExclusiveSlot, openWriteSession, type SessionTask } from './writeSession';
import {
  claimScope,
  readLocalClaim,
  verifyLocalClaim,
  type LocalClaim,
  signLocalClaim,
} from './localGenesisRecord';
import {
  requireFreshLocalSlot,
  installLocalClaim,
  localCensus,
  installLocalIndex,
  readLocalSlot,
  matchLocalRoute,
  advanceLocalClaim,
} from './localGenesisStorage';
import { contentCensus } from './startupClassification';
import { deriveStoreName } from './storeName';
import { journalCount } from './startupStorage';
import { journalPrefix } from './journalCodec';
import { openOwnedWorkspace, startupRefusal, type WorkspaceStartupResult } from './ownedStartup';
import { stopStartup, type StartupDisposition } from './startupState';
import type { WorkspaceOptions } from './admittedWorkspace';
import { createAutomaticOpening } from './automaticOpening';

export interface LocalGenesisReceipt {
  readonly kind: 'created';
  readonly scope: Readonly<CustodyScope>;
  readonly storeId: string;
}
const authority = (scope: CustodyScope) => ({
  ...scope,
  resolvePrincipal: () => scope.principalId,
});
const finishLocal = async (
  task: SessionTask,
  claim: LocalClaim,
  code: string,
): Promise<LocalGenesisReceipt> => {
  await verifyLocalClaim(task, claim, code);
  const scope = claimScope(claim),
    a = authority(scope);
  let census = await localCensus(task, claim);
  if (census.record.state === 'creating') {
    await createCustodyUnderPermit(
      task,
      a,
      code,
      {
        checkCreation: async () => {
          await localCensus(task, claim);
        },
      },
      'resume',
    );
    census = await localCensus(task, claim);
  }
  if (claim.stage === 'custody') claim = await advanceLocalClaim(task, claim, code, 'content');
  // The immutable signed intent is also the expected content initialization id.
  await checkContentUnderPermit(
    task,
    a,
    code,
    census.content?.state === 'ready'
      ? undefined
      : {
          intent: claim.initial.creation_intent!.id,
          checkCreation: async () => {
            await localCensus(task, claim);
          },
        },
  );
  if (claim.stage !== 'ready') claim = await advanceLocalClaim(task, claim, code, 'ready');
  census = await localCensus(task, claim);
  if (!census.slot) await installLocalIndex(task, claim);
  return Object.freeze({
    kind: 'created',
    scope: Object.freeze(scope),
    storeId: claim.initial.store_id,
  });
};

export interface LocalGenesisEnrollment {
  /** Keep outside application persistence. Losing this last Local factor can mean final loss. */
  readonly displayCode: string | null;
  confirm(code: string): Promise<LocalGenesisReceipt>;
  cancel(): void;
}
export const beginLocalGenesis = (
  slotId: string,
  options: { signal?: AbortSignal; seed?: CreationSeed; automatic?: boolean } = {},
): LocalGenesisEnrollment => {
  identity(slotId);
  const seed = options.seed ? captureCreationSeed(options.seed) : undefined;
  const externalSignal = options.signal,
    controller = new AbortController();
  let display: string | null = generateDeviceCode(),
    expected: string | null = normalizeDeviceCode(display),
    used = false;
  const detach = () => externalSignal?.removeEventListener('abort', cancel);
  const erase = () => {
    display = null;
    expected = null;
    used = true;
  };
  const cancel = () => {
    erase();
    controller.abort();
    if (seed) eraseCreationSeed(seed);
    detach();
  };
  externalSignal?.addEventListener('abort', cancel, { once: true });
  if (externalSignal?.aborted) cancel();
  return {
    get displayCode() {
      return display;
    },
    cancel,
    async confirm(code) {
      if (used || !expected)
        throw new CustodyError(
          'enrollment-closed',
          'Start a new ceremony or resume the winning creation.',
        );
      let typed: string;
      try {
        typed = normalizeDeviceCode(code);
      } catch {
        throw new CustodyError('confirmation-required', 'Confirm the generated device-lock code.');
      }
      if (typed !== expected)
        throw new CustodyError(
          'confirmation-required',
          'Confirmation differs from the generated code.',
        );
      erase();
      try {
        return await withExclusiveSlot(
          slotId,
          async (task) => {
            await requireFreshLocalSlot(task, slotId);
            const scope = { slotId, principalId: hex(random(16)), workspaceId: hex(random(16)) };
            let claim!: LocalClaim;
            await createCustodyUnderPermit(
              task,
              authority(scope),
              typed,
              {
                ...(seed ? { seed } : {}),
                checkCreation: async () => {
                  await requireFreshLocalSlot(task, slotId);
                  const name = await task.wait(() =>
                    deriveStoreName(scope.principalId, scope.workspaceId),
                  );
                  if ((await contentCensus(task, name)) || journalCount(task, journalPrefix(name)))
                    stopStartup('repair-required', 'fresh-name-retains-content');
                },
              },
              'fresh',
              async (task, db, _scope, initial) => {
                claim = await signLocalClaim(
                  task,
                  {
                    v: 1,
                    initial,
                    stage: 'custody',
                    mac: new Uint8Array(32),
                    ...(options.automatic ? { automatic: true as const } : {}),
                  },
                  typed,
                );
                const automatic = options.automatic
                  ? await createAutomaticOpening(task, claim, typed)
                  : undefined;
                await installLocalClaim(task, db, claim, automatic);
              },
            );
            return finishLocal(task, claim, typed);
          },
          { signal: controller.signal },
        );
      } finally {
        typed = '';
        if (seed) eraseCreationSeed(seed);
        detach();
      }
    },
  };
};
export const resumeLocalGenesis = (
  slotId: string,
  code: string,
  options: { signal?: AbortSignal } = {},
): Promise<LocalGenesisReceipt> => {
  identity(slotId);
  return withExclusiveSlot(
    slotId,
    async (task) => {
      const claim = await readLocalClaim(task, slotId);
      if (!claim) stopStartup('repair-required', 'local-creation-claim-missing');
      return finishLocal(task, claim, code);
    },
    { ...options },
  );
};

/** Presentation only. No key access or permission to create is returned. */
export const inspectLocalStartup = async (
  slotId: string,
  options: { signal?: AbortSignal } = {},
): Promise<StartupDisposition> => {
  let session;
  try {
    identity(slotId);
    session = await openWriteSession(slotId, { ...options });
    return await session.run(async (task) => {
      const claim = await readLocalClaim(task, slotId);
      if (!claim) {
        await requireFreshLocalSlot(task, slotId);
        return { kind: 'fresh', reason: 'local-slot-carriers-absent' };
      }
      const census = await localCensus(task, claim);
      return census.slot
        ? { kind: 'unlock-required', reason: 'local-claim-needs-factor-and-replay' }
        : { kind: 'creation-pending', reason: 'local-claim-needs-verified-resumption' };
    });
  } catch (cause) {
    return startupRefusal(cause, options.signal);
  } finally {
    await session?.close();
  }
};

const openLocalWith = async <T>(
  slotId: string,
  code: string,
  options: WorkspaceOptions,
  open: (authority: StartupAuthority, code: string, options: WorkspaceOptions) => Promise<T>,
): Promise<T | StartupDisposition> => {
  let session;
  try {
    // Discovery cannot authorize the later open. The final resolver rereads and verifies under its own lifetime.
    identity(slotId);
    session = await openWriteSession(slotId, options.signal ? { signal: options.signal } : {});
    const claim = await session.run((task) => readLocalClaim(task, slotId));
    await session.close();
    session = undefined;
    if (!claim) return { kind: 'identity-required', reason: 'local-claim-missing' };
    const scope = claimScope(claim);
    return await open(
      {
        slotId,
        workspaceId: scope.workspaceId,
        resolveIdentity: async (task) => {
          const current = await readLocalClaim(task, slotId);
          if (
            !current ||
            current.initial.store_id !== claim.initial.store_id ||
            current.initial.principal_id !== scope.principalId ||
            current.initial.workspace_id !== scope.workspaceId
          )
            stopStartup('repair-required', 'local-claim-changed-before-open');
          await verifyLocalClaim(task, current, code);
          const census = await localCensus(task, current);
          if (!census.slot)
            stopStartup('creation-pending', 'local-index-needs-verified-resumption');
          return { kind: 'local', principalId: scope.principalId };
        },
      },
      code,
      options,
    );
  } catch (cause) {
    return startupRefusal(cause, options.signal);
  } finally {
    await session?.close();
  }
};

export const openLocalWorkspace = (
  slotId: string,
  code: string,
  options: WorkspaceOptions,
): Promise<WorkspaceStartupResult> => openLocalWith(slotId, code, options, openOwnedWorkspace);

/** Same original discovery, factor verification and in-permit census, with native Worker carriers. */
export const openLocalWorkerStore = (slotId: string, code: string, options: WorkspaceOptions) =>
  openLocalWith(slotId, code, options, openOwnedLocalWorkerJournal);

/** Authenticated, slot-scoped picker. Discovery never enumerates native database names. */
export const listLocalWorkspaces = async (
  slotId: string,
  code: string,
  options: { signal?: AbortSignal } = {},
) => {
  const session = await openWriteSession(slotId, { ...options });
  try {
    return await session.run(async (task) => {
      const claim = await readLocalClaim(task, slotId);
      if (!claim) stopStartup('identity-required', 'local-claim-missing');
      await verifyLocalClaim(task, claim, code);
      const slot = await readLocalSlot(task, slotId);
      if (!slot) stopStartup('creation-pending', 'local-index-missing');
      await matchLocalRoute(task, claim, slot);
      return structuredClone(slot.stores);
    });
  } finally {
    await session.close();
  }
};
