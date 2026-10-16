/** Read-only promotion preflight. No index/custody change, recipient grant or service admission. */
import {
  parseAuthorityPin,
  verifyPinnedAuthority,
  type AuthorityPin,
} from '../../account-protocol/authority.ts';
import { digest, lp, type RecoveryContext } from '../../account-protocol/recovery.ts';
import { claimScope, readLocalClaim, verifyLocalClaim } from './localGenesisRecord';
import { localCensus } from './localGenesisStorage';
import { withRecoveryUnderPermit } from './custody';
import { withExclusiveSlot, type SessionTask } from './writeSession';
import { random, hex } from './custodyCrypto';
import { deriveStoreName } from './storeName';
import { probeDatabase } from './startupStorage';
import { contentTransaction } from './contentDatabase';
import { replayRecovery } from './admissionDocument';
import { Y, hasPendingUpdates } from './yjs';
import { stopStartup } from './startupState';
import { automaticCode } from './automaticOpening';

export interface PromotionSource {
  readonly slotId: string;
  readonly principalId: string;
  readonly workspaceId: string;
  readonly storeId: string;
  readonly rootId: string;
  readonly genesisIntentId: string;
  readonly generation: number;
}
export interface PromotionPreparation {
  readonly kind: 'promotion-preflight';
  readonly source: Readonly<PromotionSource>;
  readonly pin: Readonly<AuthorityPin>;
  readonly context: Readonly<RecoveryContext>;
  /** Observations at this read-only boundary, not snapshot coverage or durable authority. */
  readonly recovered: Readonly<{ records: number; journalEntries: number }>;
}
const noAdmissionRows = async (task: SessionTask, name: string) => {
  await probeDatabase(task, name, async (db) =>
    contentTransaction<void>(db, task, ['heads', 'outbound'], 'readonly', (tx, _result, guard) => {
      for (const store of ['heads', 'outbound']) {
        const request = tx.objectStore(store).count();
        request.onsuccess = () =>
          guard(() => {
            if (request.result !== 0)
              stopStartup('repair-required', 'promotion-has-admission-material');
          });
      }
    }),
  );
};
/** Deterministic proposal name. This reserves nothing at the service and is not an epoch. */
export const promotionLineage = (
  pin: AuthorityPin,
  accountId: string,
  source: PromotionSource,
): Promise<string> =>
  digest(
    lp(
      'done/promotion-lineage/v1',
      pin.serviceId,
      pin.authRoot,
      accountId,
      source.slotId,
      source.principalId,
      source.workspaceId,
      source.storeId,
      source.rootId,
      source.genesisIntentId,
    ),
  );

export interface PromotionInspectionOptions {
  slotId: string;
  code: string;
  accountId: string;
  /** Supplied by trusted app/operator configuration, independently of the response below. */
  pin: AuthorityPin;
  proveAuthority(input: { nonce: string }): Promise<unknown>;
  signal?: AbortSignal;
}
export async function inspectLocalPromotion(
  options: PromotionInspectionOptions,
): Promise<PromotionPreparation> {
  // Capture before the lock request yields; the acquired permit must match the inspected source.
  const owned = { ...options, pin: parseAuthorityPin(options.pin) };
  return withExclusiveSlot(
    owned.slotId,
    (task) => inspectPromotionUnderPermit(task, owned),
    owned.signal ? { signal: owned.signal } : {},
  );
}
/** Internal: caller owns exclusive acquisition; promotionCode permits only an authenticated known marker. */
export async function inspectPromotionUnderPermit(
  task: SessionTask,
  options: PromotionInspectionOptions,
  promotionCode?: string,
): Promise<PromotionPreparation> {
  const slotId = options.slotId,
    code = options.code,
    accountId = options.accountId,
    pin = parseAuthorityPin(options.pin),
    prove = options.proveAuthority;
  if (!/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(accountId))
    throw Error('Malformed pending account');

  const claim = await readLocalClaim(task, slotId);
  if (claim && (await automaticCode(task, claim)))
    throw Error('Protect this Local workspace before enabling sync');
  if (!claim || claim.stage !== 'ready')
    stopStartup('identity-required', 'promotion-needs-ready-local');
  await verifyLocalClaim(task, claim, code);
  const census = await localCensus(task, claim, promotionCode);
  if (!census.slot || census.record.state !== 'protected' || census.content?.state !== 'ready')
    stopStartup('repair-required', 'promotion-local-incomplete');
  const scope = claimScope(claim),
    name = await task.wait(() => deriveStoreName(scope.principalId, scope.workspaceId));
  await noAdmissionRows(task, name);
  let recovered: PromotionPreparation['recovered'] | undefined;
  await withRecoveryUnderPermit(
    task,
    { ...scope, resolvePrincipal: () => scope.principalId },
    code,
    async (recovery) => {
      const doc = new Y.Doc({ gc: false });
      try {
        task.step(() => replayRecovery(doc, recovery));
        if (hasPendingUpdates(doc))
          stopStartup('repair-required', 'promotion-local-pending-dependencies');
        recovered = Object.freeze({
          records: recovery.records.length,
          journalEntries: recovery.journal.length,
        });
      } finally {
        doc.destroy();
      }
    },
  );
  // A wrong device factor or unreadable local state never starts a network request.
  const nonce = hex(random(32));
  const proof = await task.wait(() => prove({ nonce }));
  const verified = await task.wait(() => verifyPinnedAuthority(pin, nonce, proof));
  // Reread and authenticate the Local identity/routing after the network wait.
  const current = await readLocalClaim(task, slotId);
  if (!current || hex(current.mac) !== hex(claim.mac))
    stopStartup('repair-required', 'promotion-claim-changed');
  await verifyLocalClaim(task, current, code);
  const finalCensus = await localCensus(task, current, promotionCode);
  await noAdmissionRows(task, name);
  if (hex(finalCensus.record.mac) !== hex(census.record.mac))
    stopStartup('repair-required', 'promotion-custody-changed');
  const source = Object.freeze({
    ...scope,
    storeId: census.record.store_id,
    rootId: census.record.root_id,
    genesisIntentId: claim.initial.creation_intent!.id,
    generation: census.record.envelope!.gen,
  });
  const context = Object.freeze({
    principalId: source.principalId,
    workspaceId: source.workspaceId,
    lineageId: await task.wait(() => promotionLineage(verified, accountId, source)),
    authRoot: verified.authRoot,
  });
  return Object.freeze({
    kind: 'promotion-preflight',
    source,
    pin: verified,
    context,
    recovered: recovered!,
  });
}
