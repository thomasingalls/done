import { approvalProgress } from './approvalProgress';
import { createApprovalVault, type InstalledContentKey } from './approvalVault';
export type { InstalledContentKey } from './approvalVault';
import {
  installJoinedAccount,
  installMembershipAccount,
  type JoinedAuthority,
} from '../crdt/joinedAccount';
import type { MembershipReading } from '../crdt/membershipReading';
import { openSessionVault } from './sessionVault';
import type { NetworkLogin } from './networkLogin';
import { rememberEnrollmentLogin } from './enrollmentLogin';
import type { AuthorityPin } from '../../account-protocol/authority';
import type { SessionIssued, SessionIssuanceResult } from '../../account-protocol/session';
import type { ContentReaderState } from './contentReader';
/** Small exclusive operation on the existing mandatory-factor lifecycle, for the private preview. */
import { withPromotionSlot } from '../crdt/writeSession';
import {
  readPromotion,
  withPromotionRoot,
  writePromotion,
  signPromotion,
  signRecord,
} from '../crdt/promotionRecord';
import { claimScope } from '../crdt/localGenesisRecord';
import { openEnvelope, hex } from '../crdt/custodyCrypto';
import { sealGeneration, type GenerationWrap } from './generationWrap';
import { unhex } from '../../account-protocol/recovery';
import { prepareAccountCatchup } from '../crdt/accountCatchup';
import { requireAccountAccess, type LocalPasskey } from '../crdt/accountAccess';
import type { BindingProof } from '../../account-protocol/slot';
import type {
  CheckpointAuthority,
  ContentCheckpoint,
} from '../../account-protocol/contentCheckpoint';
export interface CeremonyVault {
  activateRemoval(): Promise<{ generation: number; head: string }>;
  rotation: Awaited<ReturnType<typeof createApprovalVault>>;
  installMembershipWriting(
    authority: JoinedAuthority,
    reading: MembershipReading,
    key: InstalledContentKey,
  ): Promise<void>;
  withLogin<T>(
    login: NetworkLogin,
    expected: { accountId: string; credentialId: string },
    work: () => Promise<T>,
  ): Promise<T>;
  rememberLogin(
    pin: AuthorityPin,
    expected: { accountId: string; credentialId: string },
    result: SessionIssuanceResult,
  ): Promise<SessionIssued>;
  load(): Promise<unknown>;
  save(value: unknown, check?: () => void): Promise<void>;
  sign(message: Uint8Array<ArrayBuffer>): Promise<string>;
  wrapContent(
    recipient: string,
    info: Uint8Array<ArrayBuffer>,
    workspace: string,
  ): Promise<GenerationWrap>;
  sealIncoming(
    wrap: GenerationWrap,
    info: Uint8Array<ArrayBuffer>,
    deliveryHash: string,
  ): Promise<InstalledContentKey>;
  checkInstalled(seal: InstalledContentKey, deliveryHash: string): Promise<void>;
  withInstalledKey<T>(
    seal: InstalledContentKey,
    deliveryHash: string,
    work: (key: Uint8Array<ArrayBuffer>) => Promise<T>,
  ): Promise<T>;
  authorize(
    binding: BindingProof,
    authority: CheckpointAuthority,
    assert: LocalPasskey,
  ): Promise<void>;
  prepareCheckpoint(
    authority: CheckpointAuthority,
    assert: LocalPasskey,
  ): Promise<ContentCheckpoint>;
  installWriting(
    authority: CheckpointAuthority,
    reading: ContentReaderState,
    key: InstalledContentKey,
  ): Promise<void>;
  participant: { id: string; wPub: string; sPub: string };
  marker: Awaited<ReturnType<typeof readPromotion>>['marker'];
}
export async function withCeremonyVault<T>(
  slotId: string,
  code: string,
  signal: AbortSignal,
  work: (owner: CeremonyVault) => Promise<T>,
  progress: 'legacy' | 'membership' = 'legacy',
) {
  return withPromotionSlot(
    slotId,
    code,
    async (task) => {
      let { claim, record, marker } = await readPromotion(task, slotId, code);
      return withPromotionRoot(task, claim, record, code, async (root, subtle) => {
        const scope = claimScope(claim),
          credentials = marker?.credentials ?? record.credentials!;
        const commit = async (next: typeof record, check?: () => void) => {
          next = await signRecord(root, next, subtle);
          const nextMarker = marker
            ? await signPromotion(
                root,
                { ...marker, custodyMac: hex(next.mac), sealReserved: next.seal_reserved },
                subtle,
              )
            : null;
          await writePromotion(task, claim, record, next, marker, nextMarker, check);
          record = next;
          marker = nextMarker;
        };
        const approval = await createApprovalVault({
          slotId,
          scope,
          root,
          subtle,
          credentials,
          record: () => record,
          commit,
        });
        const rotation = await createApprovalVault({
          slotId,
          scope,
          root,
          subtle,
          credentials,
          record: () => record,
          commit,
          channel: 'rotation',
        });
        return work({
          rotation,
          activateRemoval: async () =>
            (await import('../crdt/accountRotation')).activateAccountRotation(
              task,
              'promotion',
              slotId,
              code,
            ),
          ...approval,
          ...approvalProgress(approval, progress),
          withLogin: (login, expected, work) =>
            login.withEnrollmentOwner(task, root, record.root_id, expected, work),
          rememberLogin: async (pin, expected, result) => {
            const vault = await openSessionVault(task, root, {
              pin,
              slotId,
              rootId: record.root_id,
              accountId: expected.accountId,
            });
            try {
              return await rememberEnrollmentLogin(vault, task, result, expected);
            } finally {
              vault.close();
            }
          },
          installWriting: (authority, reading, key) =>
            installJoinedAccount(task, slotId, code, { authority, reading, key }),
          installMembershipWriting: (authority, reading, key) =>
            installMembershipAccount(task, slotId, code, { authority, reading, key }),
          get marker() {
            return marker;
          },
          authorize: (binding, a, assert) =>
            requireAccountAccess(task, binding, a.base.pin, assert),
          prepareCheckpoint: async (a, assert) => {
            const checkpoint = await prepareAccountCatchup(
              task,
              { slotId, code, pin: a.base.pin, assertPasskey: assert, signal },
              a,
            );
            ({ claim, record, marker } = await readPromotion(task, slotId, code));
            return checkpoint;
          },
          wrapContent: async (recipient, info, workspace) => {
            if (
              !marker?.admission?.receipt ||
              marker.source.workspaceId !== workspace ||
              !record.envelope ||
              record.envelope.gen !== 1
            )
              throw Error('Content source changed');
            const key = await openEnvelope(scope, root, record.envelope, subtle);
            try {
              return await sealGeneration(unhex(recipient, 32), info, key, subtle);
            } finally {
              key.fill(0);
            }
          },
        });
      });
    },
    signal,
  );
}
