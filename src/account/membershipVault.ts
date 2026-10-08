/** Additional-device custody for the original account, a joined account or a fresh pending slot. */
import { withCeremonyVault, type CeremonyVault } from './ceremonyVault';
import { createApprovalVault } from './approvalVault';
import { approvalProgress } from './approvalProgress';
import { withJoinedSlot } from '../crdt/writeSession';
import {
  readJoinedAccount,
  writeJoinedApproval,
  joinedKeys,
  type JoinedAuthority,
} from '../crdt/joinedAccount';
import { withPromotionRoot } from '../crdt/promotionRecord';
import { claimScope } from '../crdt/localGenesisRecord';
import { sealGeneration } from './generationWrap';
import { unhex } from '../../account-protocol/recovery';
import { openSessionVault } from './sessionVault';
import { rememberEnrollmentLogin } from './enrollmentLogin';
import type { SuccessorBase } from '../../account-protocol/successor';
import type { CheckpointAuthority } from '../../account-protocol/contentCheckpoint';
import type { parseMembershipChain } from '../../account-protocol/membershipLocator';
type MembershipProofs = ReturnType<typeof parseMembershipChain>;
export interface MembershipVault extends Pick<
  CeremonyVault,
  | 'rotation'
  | 'participant'
  | 'load'
  | 'save'
  | 'sign'
  | 'wrapContent'
  | 'sealIncoming'
  | 'checkInstalled'
  | 'withInstalledKey'
  | 'withLogin'
  | 'rememberLogin'
  | 'installMembershipWriting'
> {
  source:
    | { kind: 'pending' }
    | { kind: 'original'; base: SuccessorBase; proofs: MembershipProofs | null }
    | {
        kind: 'joined';
        authority: CheckpointAuthority | JoinedAuthority;
        proofs: MembershipProofs;
      };
}
export function withMembershipVault<T>(
  ownerKind: 'promotion' | 'joined',
  slotId: string,
  code: string,
  signal: AbortSignal,
  work: (owner: MembershipVault) => Promise<T>,
): Promise<T> {
  if (ownerKind === 'promotion')
    return withCeremonyVault(
      slotId,
      code,
      signal,
      (owner) => {
        const marker = owner.marker;
        if (marker && !marker.admission?.receipt) throw Error('Account admission is incomplete');
        return work({
          ...owner,
          source: marker?.admission?.receipt
            ? {
                kind: 'original',
                base: {
                  pin: marker.pin,
                  request: marker.admission.request,
                  receipt: marker.admission.receipt,
                },
                proofs:
                  marker.membership?.proofs ??
                  (marker.successor?.certification
                    ? {
                        successor: marker.successor.artifact,
                        certification: marker.successor.certification,
                        continuations: [],
                      }
                    : null),
              }
            : { kind: 'pending' },
        });
      },
      'membership',
    );
  return withJoinedSlot(
    slotId,
    code,
    async (task) => {
      const state = await readJoinedAccount(task, slotId, code);
      if (!state.marker || state.marker.phase !== 'active' || !state.record.credentials)
        throw Error('Joined account installation is incomplete');
      const marker = state.marker;
      return withPromotionRoot(task, state.claim, state.record, code, async (root, subtle) => {
        const approval = await createApprovalVault({
          slotId,
          scope: claimScope(state.claim),
          root,
          subtle,
          credentials: state.record.credentials!,
          record: () => state.record,
          commit: (next, check) => writeJoinedApproval(task, state, code, next, check),
        });
        const rotation = await createApprovalVault({
          slotId,
          scope: claimScope(state.claim),
          root,
          subtle,
          credentials: state.record.credentials!,
          record: () => state.record,
          commit: (next, check) => writeJoinedApproval(task, state, code, next, check, 'rotation'),
          channel: 'rotation',
        });
        return work({
          rotation,
          ...approval,
          ...approvalProgress(approval, 'membership'),
          source: {
            kind: 'joined',
            authority: marker.authority,
            proofs: marker.membership?.proofs ?? {
              successor: marker.authority.successor,
              certification: marker.authority.certification,
              continuations: marker.v === 2 ? marker.authority.continuations : [],
            },
          },
          installMembershipWriting: async () => {
            throw Error('This device already has an installed workspace');
          },
          withLogin: (login, identity, operation) =>
            login.withEnrollmentOwner(task, root, state.record.root_id, identity, operation),
          rememberLogin: async (pin, identity, result) => {
            const vault = await openSessionVault(task, root, {
              pin,
              slotId,
              rootId: state.record.root_id,
              accountId: identity.accountId,
            });
            try {
              return await rememberEnrollmentLogin(vault, task, result, identity);
            } finally {
              vault.close();
            }
          },
          wrapContent: async (recipient, info, workspace) => {
            if (
              workspace !== marker.authority.base.request.candidate.workspaceId ||
              marker.authority.certification.epoch.delivery.generation !== 1
            )
              throw Error('Content source changed');
            return joinedKeys(task, state, code, (key) =>
              sealGeneration(unhex(recipient, 32), info, key, subtle),
            );
          },
        });
      });
    },
    signal,
  );
}
