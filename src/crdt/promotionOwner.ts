/** Private, bounded Local preparation. No account activation, genesis checkpoint or index handoff. */
import { parseAuthorityPin, pinBytes, type AuthorityPin } from '../../account-protocol/authority';
import {
  accountIdentifier,
  verifyPendingProof,
  pendingBytes,
  type PendingState,
} from '../../account-protocol/preparation';
import {
  parseDraft,
  draftDigest,
  digest,
  lp,
  type RecoveryDraft,
} from '../../account-protocol/recovery';
import {
  inspectPromotionUnderPermit,
  type PromotionInspectionOptions,
} from './promotionPreparation';
import { withPromotionSlot } from './writeSession';
import {
  readPromotion,
  withPromotionRoot,
  writePromotion,
  signPromotion,
  signRecord,
  type PromotionRecord,
} from './promotionRecord';
import { createCredential, openCredential, random, hex } from './custodyCrypto';
import { claimScope } from './localGenesisRecord';
import { SEAL_LIMIT } from './custodyRecord';
export interface PendingTransport {
  inspect(input: { retryKey: string; accountId: string; nonce: string }): Promise<unknown>;
  abandon(input: { retryKey: string; accountId: string; nonce: string }): Promise<unknown>;
}
export interface PreparePromotionOptions extends PromotionInspectionOptions {
  retryKey: string;
  /** Exact saved, confirmed recovery draft; never inferred from an unverified service reply. */
  draft: RecoveryDraft;
  transport: PendingTransport;
}
const retryDigest = (retryKey: string) => digest(lp('done/promotion-attempt/v1', retryKey));
const requireSame = (
  pin: AuthorityPin,
  accountId: string,
  retryHash: string,
  r: PromotionRecord,
) => {
  if (
    hex(pinBytes(pin)) !== hex(pinBytes(r.pin)) ||
    r.account.accountId !== accountId ||
    r.retryHash !== retryHash
  )
    throw Error('Promotion owner changed');
};
const result = (r: PromotionRecord) =>
  Object.freeze({
    kind: 'promotion-prepared' as const,
    id: r.id,
    source: Object.freeze({ ...r.source }),
    accountId: r.account.accountId,
    credentials: Object.freeze(
      r.credentials!.map((c) =>
        Object.freeze({ role: c.role, id: c.id, publicKey: hex(c.publicKey) }),
      ),
    ),
  });
export async function prepareLocalPromotion(input: PreparePromotionOptions) {
  const options = {
    ...input,
    pin: parseAuthorityPin(input.pin),
    draft: parseDraft(input.draft),
    accountId: accountIdentifier(input.accountId),
    retryKey: accountIdentifier(input.retryKey),
    transport: { ...input.transport },
  };
  return withPromotionSlot(
    options.slotId,
    options.code,
    async (task) => {
      const inspected = await inspectPromotionUnderPermit(task, options, options.code),
        expectedDraft = await task.wait(() => draftDigest(options.draft));
      for (const k of ['principalId', 'workspaceId', 'lineageId', 'authRoot'] as const)
        if (options.draft[k] !== inspected.context[k])
          throw Error('Recovery draft differs from Local target');
      const retryHash = await task.wait(() => retryDigest(options.retryKey));
      let { claim, record, marker } = await readPromotion(task, options.slotId, options.code);
      if (marker) requireSame(options.pin, options.accountId, retryHash, marker);
      const current = async (): Promise<PendingState> => {
        const nonce = hex(random(32)),
          proof = await task.wait(() =>
            options.transport.inspect({
              retryKey: options.retryKey,
              accountId: options.accountId,
              nonce,
            }),
          );
        const state = await task.wait(() => verifyPendingProof(options.pin, nonce, proof));
        if (
          state.status !== 'eligible' ||
          state.accountId !== options.accountId ||
          state.confirmation!.draftDigest !== expectedDraft
        )
          throw Error('Account or recovery is not currently eligible');
        if (marker && pendingBytes(state) !== pendingBytes(marker.account))
          throw Error('Retained recovery changed');
        return state;
      };
      const account = await current();
      return withPromotionRoot(task, claim, record, options.code, async (root, subtle) => {
        if (marker?.stage === 'prepared') {
          for (const credential of marker.credentials!)
            await openCredential(claimScope(claim), root, credential, subtle);
          return result(marker);
        }
        // An unfinished reservation may already have invoked encryption. Burn another pair on retry.
        if (record.seal_reserved + 2 >= SEAL_LIMIT) throw Error('Promotion seal budget exhausted');
        const reserved = await signRecord(
          root,
          { ...record, seal_reserved: record.seal_reserved + 2 },
          subtle,
        );
        const next = await signPromotion(
          root,
          {
            v: 1,
            kind: 'local-promotion',
            id: marker?.id ?? hex(random(16)),
            source: { ...inspected.source },
            claimMac: hex(claim.mac),
            pin: options.pin,
            account,
            retryHash,
            custodyMac: hex(reserved.mac),
            sealReserved: reserved.seal_reserved,
            credentialIds: marker?.credentialIds ?? [hex(random(16)), hex(random(16))],
            stage: 'reserved',
            credentials: null,
            mac: new Uint8Array(32),
          },
          subtle,
        );
        await writePromotion(task, claim, record, reserved, marker, next);
        record = reserved;
        marker = next;
        const wrapping = await createCredential(
            claimScope(claim),
            root,
            'wrapping',
            marker.credentialIds[0],
            subtle,
          ),
          signing = await createCredential(
            claimScope(claim),
            root,
            'signing',
            marker.credentialIds[1],
            subtle,
          );
        for (const credential of [wrapping, signing])
          await openCredential(claimScope(claim), root, credential, subtle);
        await current();
        const prepared = await signPromotion(
          root,
          { ...marker, stage: 'prepared', credentials: [wrapping, signing] },
          subtle,
        );
        await writePromotion(task, claim, record, record, marker, prepared);
        return result(prepared);
      });
    },
    options.signal,
  );
}
/** Explicit abandonment first retires the pending registration at the service, then removes only
 * the authenticated promotion carrier. Lost replies retry; seal budgets and accepted writing stay. */
export async function abandonLocalPromotion(input: {
  slotId: string;
  code: string;
  pin: AuthorityPin;
  accountId: string;
  retryKey: string;
  transport: PendingTransport;
  signal?: AbortSignal;
}) {
  const options = {
    ...input,
    pin: parseAuthorityPin(input.pin),
    accountId: accountIdentifier(input.accountId),
    retryKey: accountIdentifier(input.retryKey),
    transport: { ...input.transport },
  };
  return withPromotionSlot(
    options.slotId,
    options.code,
    async (task) => {
      const { claim, record, marker } = await readPromotion(task, options.slotId, options.code);
      if (!marker) return { kind: 'no-promotion' as const };
      requireSame(
        options.pin,
        options.accountId,
        await task.wait(() => retryDigest(options.retryKey)),
        marker,
      );
      // Recheck the scoped carrier inventory before restoring ordinary Local admission. No live service
      // liveness proof is needed here: the fixed-purpose abandonment proof below supplies it.
      const { localCensus } = await import('./localGenesisStorage');
      await localCensus(task, claim, options.code);
      const nonce = hex(random(32));
      const proof = await task.wait(() =>
        options.transport.abandon({
          retryKey: options.retryKey,
          accountId: options.accountId,
          nonce,
        }),
      );
      const state = await task.wait(() => verifyPendingProof(options.pin, nonce, proof));
      if (
        state.status !== 'abandoned' ||
        pendingBytes({ ...state, status: 'eligible' }) !== pendingBytes(marker.account)
      )
        throw Error('Abandonment does not match retained preparation');
      await writePromotion(task, claim, record, record, marker, null);
      return { kind: 'promotion-abandoned' as const };
    },
    options.signal,
  );
}
