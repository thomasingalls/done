/** Durable comparison for a verified continuation admission. Relay labels never authorize keys. */
import { same, verifySignature } from '../../account-protocol/admission';
import { closed } from '../../account-protocol/preparation';
import { unhex } from '../../account-protocol/recovery';
import { membershipState, type VerifiedMembership } from '../../account-protocol/membership';
import {
  parseCeremonyRequest,
  ceremonyRequestMessage,
  type CeremonyAction,
  type CeremonyRequest,
} from '../../account-protocol/ceremonyRelay';
import {
  parseCeremonyCommit,
  verifyMembershipCeremonyContext,
  verifyCeremonyCommit,
  verifyCeremonyPair,
  verifyCeremonyReveal,
  prepareCeremonyReveal,
  deriveCeremonyExchange,
  ceremonyCommitMessage,
  ceremonyRevealMessage,
  ceremonyContextHash,
  type CeremonyContext,
} from '../../account-protocol/ceremonyExchange';
import {
  ceremonyCommitment,
  normalizeCeremonyCode,
  type CeremonyRole,
} from '../../account-protocol/ceremony';
import { hex, random } from '../crdt/custodyCrypto';
import type { MembershipVault } from './membershipVault';
import type { ApprovedMembershipProgress } from './membershipHandoff';

export interface MembershipComparison extends ApprovedMembershipProgress {
  v: 2;
  parent: string;
  nonce: string;
  attemptId: string;
  context: CeremonyContext | null;
  cancellation: CeremonyRequest | null;
  terminal: 'expired' | 'restart-required' | 'comparison-cancelled' | null;
}
export function beginMembershipComparison(
  role: CeremonyRole,
  parent: VerifiedMembership,
): MembershipComparison {
  const state = membershipState(parent);
  if (state.preparations.length !== 1) throw Error('One pending connection is required');
  return {
    v: 2,
    role,
    parent: state.head,
    nonce: hex(random(32)),
    attemptId: hex(random(32)),
    context: null,
    own: null,
    peer: null,
    reveal: null,
    peerReveal: null,
    decision: null,
    cancellation: null,
    terminal: null,
  };
}
type Owner = Pick<MembershipVault, 'participant' | 'load' | 'sign'>;
export interface MembershipComparisonIO {
  signal: AbortSignal;
  now?(): number;
  save(check?: () => void): Promise<void>;
  request(path: string, request: CeremonyRequest): Promise<unknown>;
}
const heldFields = (p: MembershipComparison) => [
  p.v,
  p.role,
  p.parent,
  p.nonce,
  p.attemptId,
  p.context,
  p.own,
  p.peer,
  p.reveal,
  p.peerReveal,
  p.decision,
  p.cancellation,
  p.terminal,
];
export async function continueMembershipComparison(
  p: MembershipComparison,
  owner: Owner,
  parent: VerifiedMembership,
  io: MembershipComparisonIO,
  typed?: string,
): Promise<{
  kind:
    | 'waiting'
    | 'compare'
    | 'display'
    | 'approved'
    | 'mismatch'
    | 'expired'
    | 'restart-required'
    | 'comparison-cancelled';
  code?: string;
}> {
  const state = membershipState(parent),
    now = io.now ?? Date.now,
    guard = () => io.signal.throwIfAborted();
  const durable = async () => {
    guard();
    const retained = (await owner.load()) as MembershipComparison | null;
    guard();
    if (!retained || !same(heldFields(retained), heldFields(p)))
      throw Error('Comparison progress did not persist');
  };
  await durable();
  if (p.v !== 2 || !['existing', 'new'].includes(p.role))
    throw Error('Invalid comparison progress');
  unhex(p.nonce, 32);
  unhex(p.attemptId, 32);
  if (p.terminal === 'restart-required' || p.terminal === 'comparison-cancelled')
    return { kind: p.terminal };
  const save = async (check?: () => void) => {
    guard();
    check?.();
    await io.save(check);
    await durable();
    check?.();
  };
  if (p.parent !== state.head) {
    p.terminal = 'restart-required';
    await save();
    return { kind: 'restart-required' };
  }
  const pending = state.roster.filter((m) => m.state === 'pending'),
    preparation = state.preparations[0];
  if (
    pending.length !== 1 ||
    state.preparations.length !== 1 ||
    !preparation ||
    preparation.credentialId !== pending[0]!.id
  )
    throw Error('One pending membership is required');
  const candidate = pending[0]!;
  const participant =
    p.role === 'new'
      ? candidate
      : state.certificate.members.find((m) => m.id === owner.participant.id);
  if (
    !participant ||
    !same(owner.participant, { id: participant.id, wPub: participant.wPub, sPub: participant.sPub })
  )
    throw Error('Comparison custody differs from membership');
  const signed = async (action: CeremonyAction, payload: unknown) => {
    const request = parseCeremonyRequest({
      v: 2,
      kind: 'ceremony-relay',
      workspaceId: state.workspaceId,
      head: state.head,
      preparationId: preparation.attemptId,
      credentialId: owner.participant.id,
      action,
      payload,
      signature: '00'.repeat(64),
    });
    request.signature = await owner.sign(await ceremonyRequestMessage(request));
    guard();
    return request;
  };
  const request = async (r: CeremonyRequest) => {
    await durable();
    const response = closed(await io.request('/account/membership/v2/ceremony', r), [
      'ok',
      'stage',
      'existing',
      'candidate',
      'existingReveal',
      'newReveal',
      'decision',
      'cancellation',
    ]);
    guard();
    if (response['ok'] !== true) throw Error('Comparison relay refused');
    if (response['decision'] && response['cancellation']) throw Error('Conflicting relay outcomes');
    return response;
  };
  const send = async (action: CeremonyAction, payload: unknown) =>
    request(await signed(action, payload));
  let remote = await send('read', null);
  if (!p.context) {
    if (p.role === 'existing') {
      if (remote['existing']) throw Error('Matching approver state is missing');
      const createdAt = now();
      p.context = {
        v: 2,
        pin: state.pin,
        accountId: state.accountId,
        principalId: state.principalId,
        workspaceId: state.workspaceId,
        lineageId: state.lineageId,
        epoch: state.epoch,
        head: state.head,
        certifiedSetDigest: state.certifiedSetDigest,
        recoveryStateDigest: state.certificate.recoveryStateDigest,
        existing: owner.participant,
        candidate: { id: candidate.id, wPub: candidate.wPub, sPub: candidate.sPub },
        attemptId: p.attemptId,
        createdAt,
        expiresAt: createdAt + 600000,
      };
    } else {
      if (!remote['existing']) return { kind: 'waiting' };
      if (remote['candidate']) throw Error('Matching candidate state is missing');
      const proposed = parseCeremonyCommit(remote['existing']);
      const authority = verifyMembershipCeremonyContext(
        proposed.context,
        parent,
        { role: p.role, ...owner.participant },
        now(),
      );
      await verifyCeremonyCommit(authority, proposed, 'existing', now());
      p.context = proposed.context;
    }
    verifyMembershipCeremonyContext(
      p.context,
      parent,
      { role: p.role, ...owner.participant },
      now(),
    );
    await save();
  }
  const context = p.context,
    authority = verifyMembershipCeremonyContext(
      context,
      parent,
      { role: p.role, ...owner.participant },
      Math.min(now(), context.expiresAt - 1),
    ),
    peerRole = p.role === 'existing' ? 'new' : 'existing';
  const live = () => {
    guard();
    if (now() < context.createdAt || now() >= context.expiresAt) throw Error('Comparison expired');
  };
  const checkRequest = async (input: unknown) => {
    const r = parseCeremonyRequest(input),
      member =
        r.credentialId === context.existing.id
          ? context.existing
          : r.credentialId === context.candidate.id
            ? context.candidate
            : null;
    if (
      !member ||
      r.v !== 2 ||
      r.head !== state.head ||
      r.preparationId !== preparation.attemptId ||
      r.workspaceId !== state.workspaceId
    )
      throw Error('Comparison outcome scope changed');
    await verifySignature(member.sPub, r.signature, await ceremonyRequestMessage(r));
    return r;
  };
  const cancellation = async () => {
    if (!remote['cancellation']) return false;
    const r = await checkRequest(remote['cancellation']);
    if (
      p.decision ||
      r.action !== 'cancel' ||
      (r.payload as { contextHash: string }).contextHash !== (await ceremonyContextHash(context))
    )
      throw Error('Invalid comparison cancellation');
    p.cancellation = r;
    p.terminal = 'comparison-cancelled';
    await save();
    return true;
  };
  const decision = async (input: unknown) => {
    if (!p.own || !p.peer || !p.reveal || !p.peerReveal)
      throw Error('Saved comparison is incomplete');
    const pair = await verifyCeremonyPair(
        authority,
        p.role === 'existing' ? p.own : p.peer,
        p.role === 'new' ? p.own : p.peer,
        context.createdAt,
      ),
      opening = await deriveCeremonyExchange(
        pair,
        p.role === 'existing' ? p.reveal : p.peerReveal,
        p.role === 'new' ? p.reveal : p.peerReveal,
        context.createdAt,
      ),
      r = await checkRequest(input),
      b = r.payload as {
        contextHash: string;
        transcriptHash: string;
        outcome: 'approved' | 'mismatch';
      };
    if (
      r.action !== 'decide' ||
      r.credentialId !== context.existing.id ||
      b.contextHash !== pair.contextHash ||
      b.transcriptHash !== opening.transcriptHash ||
      (p.decision && !same(p.decision, r))
    )
      throw Error('Invalid comparison approval');
    return { request: r, outcome: b.outcome };
  };
  // A saved decision or peer-signed outcome can finish after a lost response, even after expiry.
  if (remote['decision']) {
    if (!p.own || !p.peer || !p.reveal) throw Error('Approved comparison state is missing');
    const pair = await verifyCeremonyPair(
        authority,
        p.role === 'existing' ? p.own : p.peer,
        p.role === 'new' ? p.own : p.peer,
        context.createdAt,
      ),
      reveal = await verifyCeremonyReveal(
        pair,
        remote[p.role === 'existing' ? 'newReveal' : 'existingReveal'],
        peerRole,
        context.createdAt,
      );
    if (p.peerReveal && !same(p.peerReveal, reveal)) throw Error('Peer reveal changed');
    // Do not persist a terminal outcome until its exact transcript has authenticated.
    const previous = p.peerReveal;
    p.peerReveal = reveal;
    let d;
    try {
      d = await decision(remote['decision']);
    } catch (cause) {
      p.peerReveal = previous;
      throw cause;
    }
    const changed = !same(p.decision, d.request) || !same(previous, reveal) || p.terminal !== null;
    p.decision = d.request;
    p.terminal = null;
    if (changed) await save();
    return { kind: d.outcome };
  }
  if (await cancellation()) return { kind: 'comparison-cancelled' };
  if (p.decision) {
    const d = await decision(p.decision);
    await request(d.request);
    return { kind: d.outcome };
  }
  if (p.terminal) return { kind: p.terminal };
  if (now() >= context.expiresAt) {
    p.terminal = 'expired';
    await save();
    return { kind: 'expired' };
  }
  if (!p.own) {
    live();
    const commit = {
      v: 2 as const,
      kind: 'ceremony-commitment' as const,
      context,
      role: p.role,
      commitment: await ceremonyCommitment(p.role, p.nonce),
      signature: '00'.repeat(64),
    };
    commit.signature = await owner.sign(await ceremonyCommitMessage(commit));
    p.own = commit;
    await save(live);
  }
  await verifyCeremonyCommit(authority, p.own, p.role, now());
  live();
  const acknowledgedCommit = remote[p.role === 'existing' ? 'existing' : 'candidate'];
  if (acknowledgedCommit && !same(acknowledgedCommit, p.own))
    throw Error('The retained commitment changed');
  if (!acknowledgedCommit) remote = await send('commit', p.own);
  const peer = remote[p.role === 'existing' ? 'candidate' : 'existing'];
  if (peer) {
    const checked = await verifyCeremonyCommit(authority, peer, peerRole, now());
    if (p.peer && !same(p.peer, checked)) throw Error('Peer commitment changed');
    if (!p.peer) {
      p.peer = checked;
      await save(live);
    }
  }
  if (!p.peer) return { kind: 'waiting' };
  const pair = await verifyCeremonyPair(
    authority,
    p.role === 'existing' ? p.own : p.peer,
    p.role === 'new' ? p.own : p.peer,
    now(),
  );
  if (!p.reveal) {
    const reveal = await prepareCeremonyReveal(pair, p.nonce, now());
    p.reveal = { ...reveal, signature: await owner.sign(await ceremonyRevealMessage(reveal)) };
    await save(live);
  }
  live();
  const acknowledgedReveal = remote[p.role === 'existing' ? 'existingReveal' : 'newReveal'];
  if (acknowledgedReveal && !same(acknowledgedReveal, p.reveal))
    throw Error('The retained reveal changed');
  if (!acknowledgedReveal) remote = await send('reveal', p.reveal);
  const peerReveal = remote[p.role === 'existing' ? 'newReveal' : 'existingReveal'];
  if (peerReveal) {
    const checked = await verifyCeremonyReveal(pair, peerReveal, peerRole, now());
    if (p.peerReveal && !same(p.peerReveal, checked)) throw Error('Peer reveal changed');
    if (!p.peerReveal) {
      p.peerReveal = checked;
      await save(live);
    }
  }
  if (!p.peerReveal) return { kind: 'waiting' };
  const opening = await deriveCeremonyExchange(
    pair,
    p.role === 'existing' ? p.reveal : p.peerReveal,
    p.role === 'new' ? p.reveal : p.peerReveal,
    now(),
  );
  if (await cancellation()) return { kind: 'comparison-cancelled' };
  if (remote['decision']) {
    const d = await decision(remote['decision']);
    p.decision = d.request;
    await save(live);
    return { kind: d.outcome };
  }
  if (p.role === 'existing' && typed !== undefined) {
    const value = normalizeCeremonyCode(typed);
    if (!value) throw Error('Enter the five characters shown on the new device.');
    const outcome = value === opening.sas ? 'approved' : 'mismatch';
    p.decision = await signed('decide', {
      contextHash: pair.contextHash,
      transcriptHash: opening.transcriptHash,
      outcome,
    });
    await save(live);
    await request(p.decision);
    return { kind: outcome };
  }
  return p.role === 'new' ? { kind: 'display', code: opening.sas } : { kind: 'compare' };
}
