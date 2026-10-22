/** Continuation of the already durable comparison. No passkey, new code or second guess. */
import { same } from '../../account-protocol/admission';
import { ceremonyWrapInfo } from '../../account-protocol/ceremony';
import {
  contentDeliveryHash,
  contentDeliveryMessage,
  recipientCertificateMessage,
  verifyContentDelivery,
  contentInstallationMessage,
  contentTransferMessage,
  verifyCertificationSuccessor,
  type ContentDelivery,
  type ContentInstallation,
  type CertificationSuccessor,
  type ContentTransferRequest,
} from '../../account-protocol/contentDelivery';
import type { CeremonyCommit, CeremonyReveal } from '../../account-protocol/ceremonyExchange';
import type { CeremonyRequest } from '../../account-protocol/ceremonyRelay';
import type { SuccessorBase, AdmissionSuccessor } from '../../account-protocol/successor';
import type { CeremonyVault, InstalledContentKey } from './ceremonyVault';
import { closed } from '../../account-protocol/preparation';
export interface ContentHandoffState {
  delivery: ContentDelivery;
  key: InstalledContentKey | null;
  installation: ContentInstallation | null;
  certification: CertificationSuccessor | null;
}
export interface ApprovedProgress {
  role: 'existing' | 'new';
  own: CeremonyCommit | null;
  peer: CeremonyCommit | null;
  reveal: CeremonyReveal | null;
  peerReveal: CeremonyReveal | null;
  decision: CeremonyRequest | null;
  content?: ContentHandoffState;
}
export async function continueContentHandoff(
  p: ApprovedProgress,
  owner: CeremonyVault,
  boot: {
    base: SuccessorBase;
    successor: AdmissionSuccessor;
    certification: CertificationSuccessor | null;
  },
  save: () => Promise<void>,
  request: (route: string, body: unknown) => Promise<unknown>,
) {
  if (!p.own || !p.peer || !p.reveal || !p.peerReveal || !p.decision)
    throw Error('Saved comparison is incomplete');
  const existing = p.role === 'existing' ? p.own : p.peer,
    candidate = p.role === 'new' ? p.own : p.peer;
  const existingReveal = p.role === 'existing' ? p.reveal : p.peerReveal,
    newReveal = p.role === 'new' ? p.reveal : p.peerReveal;
  const context = existing.context;
  const transfer = async (
    action: ContentTransferRequest['action'],
    payload: ContentTransferRequest['payload'],
  ) => {
    const r: ContentTransferRequest = {
      v: 1,
      workspaceId: context.workspaceId,
      credentialId: owner.participant.id,
      parent: boot.successor.head,
      action,
      payload,
      signature: '00'.repeat(64),
    };
    r.signature = await owner.sign(await contentTransferMessage(r));
    return closed(await request('ceremony/transfer', r), ['ok', 'delivery', 'certification']);
  };
  const checkDelivery = async (input: unknown) => {
    const { delivery } = await verifyContentDelivery(input, boot.base, boot.successor);
    if (
      !same(delivery.existing, existing) ||
      !same(delivery.candidate, candidate) ||
      !same(delivery.existingReveal, existingReveal) ||
      !same(delivery.newReveal, newReveal) ||
      !same(delivery.decision, p.decision)
    )
      throw Error('Delivery does not match this saved approval');
    return delivery;
  };
  if (
    p.content?.certification &&
    (!boot.certification || !same(p.content.certification, boot.certification))
  )
    throw Error('Certified authority changed');
  if (p.content) await checkDelivery(p.content.delivery);
  if (p.role === 'existing' && !p.content) {
    if (boot.certification)
      throw Error('Saved delivery is missing; refusing to release another key');
    const transcriptHash = (p.decision.payload as { transcriptHash: string }).transcriptHash;
    const certificate = {
      members: [context.existing, context.candidate].sort((a, b) =>
        a.id < b.id ? -1 : 1,
      ) as ContentDelivery['certificate']['members'],
      recoveryStateDigest: context.recoveryStateDigest,
      approver: context.existing.id,
      signature: '00'.repeat(64),
    };
    certificate.signature = await owner.sign(
      await recipientCertificateMessage(certificate, context.workspaceId, context.lineageId),
    );
    // Verify every approval predicate before even opening the local content key.
    const proposal: ContentDelivery = {
      v: 1,
      kind: 'content-key-delivery',
      parent: boot.successor.head,
      generation: 1,
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
    proposal.signature = await owner.sign(await contentDeliveryMessage(proposal));
    await checkDelivery(proposal);
    proposal.wrap = await owner.wrapContent(
      context.candidate.wPub,
      ceremonyWrapInfo(transcriptHash),
      context.workspaceId,
    );
    proposal.signature = await owner.sign(await contentDeliveryMessage(proposal));
    p.content = { delivery: proposal, key: null, installation: null, certification: null };
    // Pending certificate and exact HPKE bytes commit before any key-bearing request.
    await save();
  }
  let remote = await transfer(
    p.role === 'existing' ? 'deliver' : 'read',
    p.role === 'existing' ? p.content!.delivery : null,
  );
  if (remote['ok'] !== true) throw Error('Content transfer unavailable');
  if (!remote['delivery']) return 'approved' as const;
  const delivery = await checkDelivery(remote['delivery']);
  if (p.content && !same(p.content.delivery, delivery)) throw Error('Retained delivery changed');
  if (!p.content) {
    p.content = { delivery, key: null, installation: null, certification: null };
    await save();
  }
  const content = p.content;
  const deliveryHash = await contentDeliveryHash(delivery);
  if (boot.certification)
    await verifyCertificationSuccessor(boot.certification, boot.base, boot.successor, delivery);
  if (p.role === 'new') {
    if (!content.key) {
      if (content.installation) throw Error('Installed content key is missing');
      content.key = await owner.sealIncoming(
        delivery.wrap,
        ceremonyWrapInfo(delivery.transcriptHash),
        deliveryHash,
      );
      await save();
    }
    // Verify the durable installation before countersigning. Never sign from an in-flight HPKE open.
    const retained = (await owner.load()) as ApprovedProgress;
    if (
      !retained.content?.key ||
      !same(retained.content.delivery, delivery) ||
      !same(retained.content.key, content.key)
    )
      throw Error('Content installation did not persist');
    await owner.checkInstalled(retained.content.key, deliveryHash);
    if (!content.installation) {
      const installation: ContentInstallation = {
        v: 1,
        kind: 'content-key-installed',
        deliveryHash,
        credentialId: owner.participant.id,
        signature: '00'.repeat(64),
      };
      installation.signature = await owner.sign(await contentInstallationMessage(installation));
      content.installation = installation;
      await save();
    }
    remote = await transfer('install', content.installation);
  }
  if (remote['certification']) {
    const certification = await verifyCertificationSuccessor(
      remote['certification'],
      boot.base,
      boot.successor,
      delivery,
    );
    if (
      (boot.certification && !same(boot.certification, certification)) ||
      (content.certification && !same(content.certification, certification))
    )
      throw Error('Certification changed');
    if (p.role === 'new' && !same(certification.epoch.installation, content.installation))
      throw Error('Installation acknowledgment changed');
    if (!content.certification) {
      content.certification = certification;
      await save();
    }
    return 'certified' as const;
  }
  if (boot.certification || content.certification) throw Error('Certified delivery disappeared');
  return 'approved' as const;
}
