/** Slot-owned encrypted progress. Does not alter content, account authority, or selected keys. */
import type { MembershipVault } from '../account/membershipVault';
import type { NetworkLogin } from '../account/networkLogin';
import {
  readPromotion,
  withPromotionRoot,
  signRecord,
  signPromotion,
  writePromotion,
} from './promotionRecord';
import { readJoinedAccount, writeJoinedApproval, joinedInitialGeneration } from './joinedAccount';
import { claimScope } from './localGenesisRecord';
import { createApprovalVault } from '../account/approvalVault';
import type {
  verifyMembershipChain,
  parseMembershipChain,
} from '../../account-protocol/membershipLocator';
import { hex } from './custodyCrypto';
import type { SessionTask } from './writeSession';
type Kind = 'promotion' | 'joined';
export async function withAccountProgressCustody<T>(
  task: SessionTask,
  kind: Kind,
  slotId: string,
  code: string,
  channel: 'approval' | 'rotation' | 'history',
  work: (v: {
    vault: Awaited<ReturnType<typeof createApprovalVault>>;
    state:
      | Awaited<ReturnType<typeof readPromotion>>
      | Awaited<ReturnType<typeof readJoinedAccount>>;
    base: Parameters<typeof verifyMembershipChain>[1];
    source: Exclude<MembershipVault['source'], { kind: 'pending' }>;
    credential: string;
    withLogin<T>(login: NetworkLogin, work: () => Promise<T>): Promise<T>;
    proofs: ReturnType<typeof parseMembershipChain> | null;
  }) => Promise<T>,
) {
  const original = kind === 'promotion' ? await readPromotion(task, slotId, code) : null;
  const joined = kind === 'joined' ? await readJoinedAccount(task, slotId, code) : null;
  const state = (original ?? joined)!;
  let record = state.record,
    marker = original?.marker;
  if ((original && marker?.v !== 9) || (joined && joined.marker?.phase !== 'active'))
    throw Error('Installed account required');
  const base = original
    ? {
        pin: marker!.pin,
        request: marker!.admission!.request,
        receipt: marker!.admission!.receipt!,
      }
    : joined!.marker!.authority.base;
  const proofs = original
    ? (marker!.membership?.proofs ??
      (marker!.successor?.certification
        ? {
            successor: marker!.successor.artifact,
            certification: marker!.successor.certification,
            continuations: [],
          }
        : null))
    : (joined!.marker!.membership?.proofs ?? {
        successor: joined!.marker!.authority.successor,
        certification: joined!.marker!.authority.certification,
        continuations: joined!.marker!.v !== 1 ? joined!.marker!.authority.continuations : [],
      });
  const credentials = original ? marker!.credentials! : record.credentials!;
  return withPromotionRoot(task, state.claim, record, code, async (root, subtle) => {
    const vault = await createApprovalVault({
      channel,
      slotId,
      scope: claimScope(state.claim),
      root,
      subtle,
      credentials,
      record: () => record,
      commit: async (next, check) => {
        if (original) {
          next = await signRecord(root, next, subtle);
          const nextMarker = await signPromotion(
            root,
            { ...marker!, custodyMac: hex(next.mac), sealReserved: next.seal_reserved },
            subtle,
          );
          await writePromotion(task, state.claim, record, next, marker!, nextMarker, check);
          record = next;
          marker = nextMarker;
        } else {
          await writeJoinedApproval(task, joined!, code, next, check, channel);
          record = joined!.record;
        }
      },
    });
    return work({
      vault,
      state,
      base,
      source: joined
        ? {
            kind: 'joined',
            authority: joined.marker!.authority,
            proofs: proofs!,
            initialGeneration: joinedInitialGeneration(joined.marker!),
          }
        : { kind: 'original', base, proofs },
      credential: credentials[1].id,
      proofs,
      withLogin: (login, run) =>
        login.withEnrollmentOwner(
          task,
          root,
          record.root_id,
          {
            accountId: base.receipt.offer.epoch.accountId,
            credentialId: base.receipt.activation.context.credentialId,
          },
          run,
        ),
    });
  });
}
