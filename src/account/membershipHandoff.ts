/** Durable continuation of an approved additional-device comparison. No new user ceremony. */
import { same } from '../../account-protocol/admission';
import { closed } from '../../account-protocol/preparation';
import { ceremonyWrapInfo } from '../../account-protocol/ceremony';
import {
  membershipState,
  parseMembershipCertification,
  verifyMembershipCertification,
  type VerifiedMembership,
  type MembershipCertification,
} from '../../account-protocol/membership';
import {
  membershipCertificateMessage,
  membershipDeliveryMessage,
  membershipDeliveryHash,
  membershipInstallationMessage,
  membershipTransferMessage,
  verifyMembershipDelivery,
  verifyMembershipInstallation,
  type MembershipDelivery,
  type MembershipInstallation,
  type MembershipTransferRequest,
} from '../../account-protocol/membershipDelivery';
import type { SuccessorBase } from '../../account-protocol/successor';
import type { CeremonyVault, InstalledContentKey } from './ceremonyVault';
import type { ApprovedProgress } from './contentHandoff';
import {
  replacementCheckpointHash,
  replacementCheckpointAdmissionBody,
  replacementCheckpointAdmissionMessage,
  verifyReplacementCheckpoint,
  verifyReplacementCheckpointAdmission,
  type ReplacementCheckpoint,
} from '../../account-protocol/replacementCheckpoint';
import {
  replacementTransferMessage,
  type ReplacementTransferRequest,
} from '../../account-protocol/replacementTransfer';
import { openReplacementCheckpoint } from '../crdt/replacementCheckpoint';
import { verifyBindingProof, type BindingProof } from '../../account-protocol/slot';

export interface MembershipHandoffState {
  delivery: MembershipDelivery;
  key: InstalledContentKey | null;
  installation: MembershipInstallation | null;
  certification: MembershipCertification | null;
}
export interface ApprovedMembershipProgress extends Omit<ApprovedProgress, 'content'> {
  content?: MembershipHandoffState;
  replacement?: ReplacementCheckpoint;
  replacementBinding?: BindingProof;
}
type Owner = Pick<
  CeremonyVault,
  | 'participant'
  | 'load'
  | 'sign'
  | 'wrapContent'
  | 'sealIncoming'
  | 'checkInstalled'
  | 'withInstalledKey'
>;
export async function continueMembershipHandoff(
  progress: ApprovedMembershipProgress,
  owner: Owner,
  boot: {
    base: SuccessorBase;
    membership: VerifiedMembership;
    certification: MembershipCertification | null;
    /** The native source owner proves accepted coverage and captures journal-inclusive writing. */
    prepareReplacement?: () => Promise<ReplacementCheckpoint>;
  },
  save: () => Promise<void>,
  request: (path: string, body: unknown) => Promise<unknown>,
) {
  const p = progress,
    parent = boot.membership,
    state = membershipState(parent);
  if (!p.own || !p.peer || !p.reveal || !p.peerReveal || !p.decision)
    throw Error('Saved comparison is incomplete');
  // Fresh admissions use a snapshot at the admission cuts in every generation. Retained
  // version-two deliveries keep their exact transcript and remain resumable.
  const retainedDelivery = p.content?.delivery ?? boot.certification?.epoch.delivery;
  const replacement = retainedDelivery ? retainedDelivery.v === 3 : true;
  const existing = p.role === 'existing' ? p.own : p.peer,
    candidate = p.role === 'new' ? p.own : p.peer,
    existingReveal = p.role === 'existing' ? p.reveal : p.peerReveal,
    newReveal = p.role === 'new' ? p.reveal : p.peerReveal,
    context = existing.context;
  if (!same(owner.participant, p.role === 'existing' ? context.existing : context.candidate))
    throw Error('Content handoff belongs to another device');
  const preparation = state.preparations.find((r) => r.credentialId === context.candidate.id);
  if (!preparation) throw Error('Pending membership preparation is missing');
  const certification = boot.certification
    ? parseMembershipCertification(boot.certification)
    : null;
  if (certification) await verifyMembershipCertification(certification, parent);
  const checkDelivery = async (input: unknown) => {
    const { delivery } = await verifyMembershipDelivery(input, parent);
    if (
      ((replacement ? delivery.v !== 3 : delivery.v !== 2) &&
        !(p.role === 'new' && !retainedDelivery && state.generation === 1 && delivery.v === 2)) ||
      !same(delivery.existing, existing) ||
      !same(delivery.candidate, candidate) ||
      !same(delivery.existingReveal, existingReveal) ||
      !same(delivery.newReveal, newReveal) ||
      !same(delivery.decision, p.decision)
    )
      throw Error('Delivery differs from saved approval');
    return delivery;
  };
  const durableContent = async () => {
    const retained = (await owner.load()) as ApprovedMembershipProgress | null;
    if (
      !retained ||
      retained.role !== p.role ||
      !same(retained.content, p.content) ||
      !same(retained.replacement, p.replacement) ||
      !same(retained.replacementBinding, p.replacementBinding) ||
      !same(retained.decision, p.decision)
    )
      throw Error('Content handoff did not persist');
    return retained.content!;
  };
  const checkCheckpoint = async (input: unknown, hash?: string) => {
    const c = await verifyReplacementCheckpoint(input, parent);
    if (
      c.manifest.producer !== context.existing.id ||
      (hash && (await replacementCheckpointHash(c)) !== hash)
    )
      throw Error('Replacement snapshot differs from approved delivery');
    return c;
  };
  const exchangeCheckpoint = async (action: 'publish' | 'read') => {
    await durableContent();
    const body: ReplacementTransferRequest = {
      v: 1,
      workspaceId: state.workspaceId,
      parent: state.head,
      preparationId: preparation.attemptId,
      credentialId: owner.participant.id,
      action,
      payload: action === 'publish' ? p.replacement! : null,
      signature: '00'.repeat(64),
    };
    body.signature = await owner.sign(await replacementTransferMessage(body));
    const raw = await request('/account/membership/v3/checkpoint', body);
    if ((raw as { ok?: unknown } | null)?.ok === false) {
      const refused = closed(raw, ['ok', 'refusal']);
      if (refused['refusal'] === 'history-changed' && action === 'publish' && !p.content) {
        // Only an explicit refusal before publication permits reconstruction. Uncertain replies
        // retain the exact snapshot; a saved delivery can never be rebound to different content.
        delete p.replacement;
        delete p.replacementBinding;
        await save();
        await durableContent();
        throw Error('History changed before publication. Retry to rebuild the saved snapshot.');
      }
      throw Error('Replacement snapshot unavailable');
    }
    const result = closed(raw, ['ok', 'checkpoint', 'binding']);
    if (result['ok'] !== true || !result['checkpoint'])
      throw Error('Replacement snapshot unavailable');
    const binding = await verifyBindingProof(
      result['binding'],
      boot.base.request,
      boot.base.receipt,
      boot.base.pin,
    );
    if (p.replacementBinding && !same(p.replacementBinding, binding))
      throw Error('Retained account binding changed');
    return { checkpoint: await checkCheckpoint(result['checkpoint']), binding };
  };
  const transfer = async (
    action: MembershipTransferRequest['action'],
    payload: MembershipTransferRequest['payload'],
  ) => {
    const body: MembershipTransferRequest = {
      v: 2,
      workspaceId: state.workspaceId,
      credentialId: owner.participant.id,
      parent: state.head,
      preparationId: preparation.attemptId,
      action,
      payload,
      signature: '00'.repeat(64),
    };
    body.signature = await owner.sign(await membershipTransferMessage(body));
    return closed(await request('/account/membership/v2/transfer', body), [
      'ok',
      'delivery',
      'certification',
    ]);
  };
  if (p.content?.certification && (!certification || !same(p.content.certification, certification)))
    throw Error('Certified authority changed');
  if (p.content) await checkDelivery(p.content.delivery);
  if (p.replacement) {
    if (!replacement) throw Error('Unexpected replacement snapshot');
    await checkCheckpoint(
      p.replacement,
      p.content?.delivery.v === 3 ? p.content.delivery.checkpointHash : undefined,
    );
  } else if (replacement && ((p.role === 'existing' && p.content) || p.content?.installation))
    throw Error('Saved replacement snapshot is missing');
  if (p.replacementBinding) {
    if (!replacement) throw Error('Unexpected replacement binding');
    await verifyBindingProof(
      p.replacementBinding,
      boot.base.request,
      boot.base.receipt,
      boot.base.pin,
    );
  } else if (replacement && p.content?.installation)
    throw Error('Saved account binding is missing');
  if (p.role === 'existing' && !p.content) {
    if (certification) throw Error('Saved delivery is missing');
    const transcriptHash = (p.decision.payload as { transcriptHash: string }).transcriptHash;
    const certificate: MembershipDelivery['certificate'] = {
      v: 2,
      workspaceId: state.workspaceId,
      lineageId: state.lineageId,
      parent: state.head,
      epoch: state.epoch + 1,
      generation: state.generation,
      members: [...state.certificate.members, context.candidate].sort((a, b) =>
        a.id < b.id ? -1 : 1,
      ),
      recoveryStateDigest: state.certificate.recoveryStateDigest,
      approver: context.existing.id,
      signature: '00'.repeat(64),
    };
    certificate.signature = await owner.sign(await membershipCertificateMessage(certificate));
    const proposal: MembershipDelivery = {
      ...(replacement ? { v: 3 as const, checkpointHash: '00'.repeat(32) } : { v: 2 as const }),
      kind: 'membership-key-delivery',
      parent: state.head,
      preparationId: preparation.attemptId,
      generation: state.generation,
      transcriptHash,
      existing,
      candidate,
      existingReveal,
      newReveal,
      decision: p.decision,
      certificate,
      recovery: boot.base.request.recovery,
      wrap: { enc: '00'.repeat(32), ct: '00'.repeat(48) },
      signature: '00'.repeat(64),
    };
    proposal.signature = await owner.sign(await membershipDeliveryMessage(proposal));
    await checkDelivery(proposal); // Verify approval before opening the content key.
    if (proposal.v === 3) {
      if (!p.replacement) {
        if (!boot.prepareReplacement) throw Error('Replacement source owner is unavailable');
        p.replacement = await checkCheckpoint(await boot.prepareReplacement());
        await save();
      }
      await durableContent();
      const remote = await exchangeCheckpoint('publish');
      if (!same(remote.checkpoint, p.replacement))
        throw Error('Retained replacement snapshot changed');
      if (!p.replacementBinding) {
        p.replacementBinding = remote.binding;
        await save();
        await durableContent();
      }
      proposal.checkpointHash = await replacementCheckpointHash(p.replacement);
    }
    proposal.wrap = await owner.wrapContent(
      context.candidate.wPub,
      ceremonyWrapInfo(transcriptHash),
      state.workspaceId,
      parent,
    );
    proposal.signature = await owner.sign(await membershipDeliveryMessage(proposal));
    p.content = { delivery: proposal, key: null, installation: null, certification: null };
    await save();
  }
  if (p.role === 'existing') await durableContent();
  let remote = await transfer(
    p.role === 'existing' ? 'deliver' : 'read',
    p.role === 'existing' ? p.content!.delivery : null,
  );
  if (remote['ok'] !== true) throw Error('Content transfer unavailable');
  if (!remote['delivery']) {
    if (p.content || certification || remote['certification'])
      throw Error('Retained delivery disappeared');
    return 'approved' as const;
  }
  const delivery = await checkDelivery(remote['delivery']);
  if (p.content && !same(p.content.delivery, delivery)) throw Error('Retained delivery changed');
  if (certification && !same(certification.epoch.delivery, delivery))
    throw Error('Certified delivery changed');
  if (!p.content) {
    p.content = { delivery, key: null, installation: null, certification: null };
    await save();
  }
  const content = p.content,
    deliveryHash = await membershipDeliveryHash(delivery);
  if (p.role === 'new') {
    if (delivery.v === 3) {
      if (!p.replacement || !p.replacementBinding) {
        const remote = await exchangeCheckpoint('read');
        p.replacement = await checkCheckpoint(remote.checkpoint, delivery.checkpointHash);
        p.replacementBinding = remote.binding;
        await save();
      }
      await checkCheckpoint(p.replacement, delivery.checkpointHash);
      await durableContent();
    }
    if (!content.key) {
      if (content.installation) throw Error('Installed content key is missing');
      content.key = await owner.sealIncoming(
        delivery.wrap,
        ceremonyWrapInfo(delivery.transcriptHash),
        deliveryHash,
      );
      await save();
    }
    const retained = await durableContent();
    if (!retained.key) throw Error('Content installation did not persist');
    await owner.checkInstalled(retained.key, deliveryHash);
    if (delivery.v === 3) {
      // A saved signature is not a substitute for reopening the durable snapshot and key.
      await owner.withInstalledKey(retained.key, deliveryHash, async (key) => {
        const doc = await openReplacementCheckpoint(p.replacement, key, parent);
        doc.destroy();
      });
    }
    if (!content.installation) {
      const checkpoint =
        delivery.v === 3 ? await replacementCheckpointAdmissionBody(p.replacement!) : undefined;
      if (checkpoint)
        checkpoint.signature = await owner.sign(
          await replacementCheckpointAdmissionMessage(checkpoint),
        );
      const installation: MembershipInstallation = {
        ...(checkpoint ? { v: 3 as const, checkpoint } : { v: 2 as const }),
        kind: 'membership-key-installed',
        deliveryHash,
        credentialId: owner.participant.id,
        signature: '00'.repeat(64),
      };
      installation.signature = await owner.sign(await membershipInstallationMessage(installation));
      content.installation = installation;
      await save();
    }
    await verifyMembershipInstallation(content.installation, delivery);
    if (content.installation.v === 3)
      await verifyReplacementCheckpointAdmission(
        content.installation.checkpoint,
        p.replacement,
        parent,
      );
    await durableContent();
    remote = await transfer('install', content.installation);
  }
  if (remote['certification']) {
    const result = parseMembershipCertification(remote['certification']);
    await verifyMembershipCertification(result, parent);
    if (
      !same(result.epoch.delivery, delivery) ||
      (certification && !same(certification, result)) ||
      (content.certification && !same(content.certification, result)) ||
      (p.role === 'new' && !same(result.epoch.installation, content.installation))
    )
      throw Error('Installation certification changed');
    if (!content.certification) {
      content.certification = result;
      await save();
    }
    return 'certified' as const;
  }
  if (certification || content.certification) throw Error('Certified delivery disappeared');
  return 'approved' as const;
}
