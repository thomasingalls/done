/** One retained additional-device journey, executed inside the actual slot's exclusive permit. */
import { same } from '../../account-protocol/admission';
import { closed } from '../../account-protocol/preparation';
import {
  parseMembershipInvitation,
  parseMembershipChain,
  verifyMembershipChain,
} from '../../account-protocol/membershipLocator';
import { historyAuthority, historyMembership } from '../../account-protocol/admissionHistory';
import {
  membershipState,
  parseMembershipCancellationRequest,
  membershipCancellationRequestMessage,
  verifyMembershipCancellationRequest,
  verifyMembershipCancellation,
  parseMembershipCancellation,
  type MembershipCancellationRequest,
} from '../../account-protocol/membership';
import { unhex } from '../../account-protocol/recovery';
import { hex, random } from '../crdt/custodyCrypto';
import type { AuthorityPin } from '../../account-protocol/authority';
import type { SuccessorBase } from '../../account-protocol/successor';
import type { EnrollmentContext } from '../../account-protocol/enrollment';
import type { SessionIssued } from '../../account-protocol/session';
import type { MembershipVault } from './membershipVault';
import type { MembershipReading } from '../crdt/membershipReading';
import type { Bytes } from '../crdt/custodyCrypto';
import {
  prepareMembershipInvitation,
  bootstrapMembershipInvitation,
  heldMembershipSource,
} from './membershipInvitation';
import {
  beginMembershipPreparation,
  completeMembershipPreparation,
  type MembershipPreparation,
} from './membershipPreparation';
import {
  beginMembershipComparison,
  continueMembershipComparison,
  type MembershipComparison,
} from './membershipComparison';
import { continueMembershipHandoff } from './membershipHandoff';
import { loadMembershipWriting } from './membershipReader';

type Proofs = ReturnType<typeof parseMembershipChain>;
type Comparison = MembershipComparison & { reading?: MembershipReading };
export interface MembershipConnection {
  v: 2;
  kind: 'membership-connection';
  role: 'existing' | 'new';
  invitation: ReturnType<typeof parseMembershipInvitation>;
  base: SuccessorBase | null;
  latest: Proofs | null;
  preparation: { parent: Proofs; progress: MembershipPreparation } | null;
  comparison: Comparison | null;
  terminal: 'restart-required' | null;
  withdrawal?: MembershipCancellationRequest;
  /** Stable navigation attempt: not an authorization token. */
  begin?: string;
}
export interface MembershipConnectionIO {
  pin: AuthorityPin;
  signal: AbortSignal;
  now?(): number;
  /** Bootstrap is unauthenticated; all subsequent routes still require the actual scoped login. */
  request(path: string, body: unknown, base: SuccessorBase | null): Promise<unknown>;
  read(request: Bytes, base: SuccessorBase): Promise<Bytes>;
  assert(context: EnrollmentContext): Promise<unknown>;
  acknowledge(login: SessionIssued): Promise<unknown>;
  reconnect(base: SuccessorBase): Promise<void>;
}
export type MembershipConnectionView = {
  kind:
    | 'invite'
    | 'enroll'
    | 'waiting'
    | 'compare'
    | 'display'
    | 'approved'
    | 'certified'
    | 'loading'
    | 'installed'
    | 'mismatch'
    | 'expired'
    | 'restart-required'
    | 'cancelled'
    | 'removal-required'
    | 'comparison-cancelled';
  canCancel?: boolean;
  code?: string;
  invitation?: ReturnType<typeof parseMembershipInvitation>;
};

function capture(input: unknown): MembershipConnection {
  const p = closed(input, [
    'v',
    'kind',
    'role',
    'invitation',
    'base',
    'latest',
    'preparation',
    'comparison',
    'terminal',
    ...((input as { begin?: unknown } | null)?.begin !== undefined ? ['begin'] : []),
    ...((input as { withdrawal?: unknown } | null)?.withdrawal !== undefined ? ['withdrawal'] : []),
  ]);
  if (
    p['v'] !== 2 ||
    p['kind'] !== 'membership-connection' ||
    !['existing', 'new'].includes(p['role'] as string) ||
    (p['terminal'] !== null && p['terminal'] !== 'restart-required') ||
    (p['base'] === null) !== (p['latest'] === null)
  )
    throw Error('Invalid saved connection');
  if (p['begin'] !== undefined) unhex(p['begin'], 16);
  // The signed authority and component records are authenticated again before their next effect.
  return {
    ...p,
    invitation: parseMembershipInvitation(p['invitation']),
    ...(p['withdrawal'] !== undefined
      ? { withdrawal: parseMembershipCancellationRequest(p['withdrawal']) }
      : {}),
  } as unknown as MembershipConnection;
}

/** Only verified certification, cancellation or exclusion can finish an old connection. */
async function completedConnection(p: MembershipConnection, owner: MembershipVault) {
  if (!p.comparison || !p.base || !p.latest) return false;
  const held = await heldMembershipSource(owner);
  if (!same(p.base, held.base)) throw Error('Saved connection belongs to another account');
  const prior = await verifyMembershipChain(p.latest, held.base);
  if (prior.history.current.tip > held.history.current.tip) {
    historyAuthority(prior.history, held.history.current);
    return false; // Local adoption has not yet established a completed attempt.
  }
  historyAuthority(held.history, prior.history.current);
  const index = held.proofs.continuations.findIndex((proof) => proof.head === p.comparison!.parent);
  const admission = held.proofs.continuations[index];
  if (!admission || admission.kind !== 'membership-admission') return false;
  const candidate = admission.epoch.preparation.context.candidate.credentialId;
  return held.proofs.continuations
    .slice(index + 1)
    .some(
      (proof) =>
        (proof.kind === 'membership-certification' && proof.epoch.parent === admission.head) ||
        (proof.kind === 'membership-cancellation' && proof.epoch.parent === admission.head) ||
        (proof.kind === 'membership-rotation' &&
          proof.epoch.rotation.payload.excluded.includes(candidate)),
    );
}

/** Never holds an unlocked owner between calls; every operation begins by cold-reading its progress. */
export async function advanceMembershipConnection(
  owner: MembershipVault,
  role: MembershipConnection['role'],
  io: MembershipConnectionIO,
  input: {
    begin?: string;
    invitation?: unknown;
    workspaceId?: string;
    enroll?: boolean;
    typed?: string;
    read?: boolean;
    reconnect?: boolean;
    cancel?: boolean;
  } = {},
): Promise<MembershipConnectionView> {
  const guard = () => io.signal.throwIfAborted();
  guard();
  let loaded = await owner.load();
  if (input.begin !== undefined) unhex(input.begin, 16);
  guard();
  if ((role === 'existing') === (owner.source.kind === 'pending'))
    throw Error('Connection role differs from held custody');
  let p: MembershipConnection;
  const save = async (check?: () => void) => {
    guard();
    check?.();
    await owner.save(p, check);
    guard();
    check?.();
    if (!same(await owner.load(), p)) throw Error('Connection progress did not persist');
    guard();
  };
  const previous = loaded === null ? null : capture(loaded);
  const archive =
    role === 'existing' &&
    input.begin !== undefined &&
    previous !== null &&
    previous.begin !== input.begin &&
    (await completedConnection(previous, owner));
  if (archive) loaded = null;
  if (loaded === null) {
    const invitation =
      role === 'existing'
        ? (await prepareMembershipInvitation(owner)).invitation
        : parseMembershipInvitation(input.invitation);
    if (input.workspaceId && input.workspaceId !== invitation.workspaceId)
      throw Error('Invitation workspace changed');
    p = {
      v: 2,
      kind: 'membership-connection',
      role,
      invitation,
      base: null,
      latest: null,
      preparation: null,
      comparison: null,
      terminal: null,
      ...(input.begin ? { begin: input.begin } : {}),
    };
    if (archive) {
      await owner.archiveConnection(previous, p, guard);
      if (!same(await owner.load(), p)) throw Error('Connection archive did not persist');
    } else await save();
  } else {
    p = capture(loaded);
    if (role === 'existing' && p.role === role && input.begin && p.begin !== input.begin) {
      p.begin = input.begin; // An explicit revisit resumes unfinished progress.
      await save();
    }
  }
  if (
    p.role !== role ||
    (input.workspaceId && input.workspaceId !== p.invitation.workspaceId) ||
    (input.invitation !== undefined &&
      !same(parseMembershipInvitation(input.invitation), p.invitation))
  )
    throw Error('Saved connection route changed');
  if (p.terminal) return { kind: p.terminal };
  const boot = await bootstrapMembershipInvitation(
    io.pin,
    p.invitation,
    (path, body) => io.request(path, body, null),
    role === 'existing' ? owner : undefined,
  );
  guard();
  const base = boot.response.base;
  if (p.base && !same(p.base, base)) throw Error('Saved connection account changed');
  if (p.latest) {
    const held = await verifyMembershipChain(p.latest, base);
    historyAuthority(boot.history, held.history.current);
  }
  if (!same(p.latest, boot.response.proofs)) {
    p.base = base;
    p.latest = boot.response.proofs;
    await save();
  }
  if (input.reconnect) {
    await io.reconnect(base);
    guard();
  }
  const request = async (path: string, body: unknown) => {
    guard();
    const result = await io.request(path, body, base);
    guard();
    return result;
  };
  let proofs = p.latest!,
    current = boot.history,
    membership = historyMembership(current),
    state = membershipState(membership);
  const restart = async (): Promise<MembershipConnectionView> => {
    p.terminal = 'restart-required';
    await save();
    return { kind: 'restart-required' };
  };

  if (role === 'new' && !p.comparison) {
    if (!p.preparation) {
      if (state.preparations.length) throw Error('Resume the saved pending device connection');
      p.preparation = {
        parent: proofs,
        progress: beginMembershipPreparation(owner.participant, membership),
      };
      await save();
    }
    const preparation = p.preparation;
    const parent = historyMembership(
      (await verifyMembershipChain(preparation.parent, base)).history,
    );
    const parentState = membershipState(parent);
    // The only permitted advance while preparing is admission of this exact saved attempt.
    if (state.head !== parentState.head) {
      const last = proofs.continuations.at(-1);
      if (
        last?.kind !== 'membership-admission' ||
        last.epoch.parent !== parentState.head ||
        last.epoch.preparation.context.candidate.credentialId !== owner.participant.id ||
        !preparation.progress.proof ||
        last.epoch.preparation.context.attemptId !== preparation.progress.proof.attemptId
      )
        return restart();
    }
    if (!input.enroll && !preparation.progress.proof && !preparation.progress.receipt)
      return { kind: 'enroll' };
    membership = await completeMembershipPreparation(
      preparation.progress,
      { ...owner, load: async () => capture(await owner.load()).preparation?.progress ?? null },
      base,
      parent,
      { ...io, save, request },
    );
    const admission = preparation.progress.admission!;
    proofs = parseMembershipChain({
      ...preparation.parent,
      continuations: [...preparation.parent.continuations, admission],
    });
    current = (await verifyMembershipChain(proofs, base)).history;
    state = membershipState(membership);
    p.latest = proofs;
    p.comparison = { ...beginMembershipComparison(role, membership) };
    await save();
  }
  if (!p.comparison) {
    if (!state.preparations.length) return { kind: 'invite', invitation: p.invitation };
    p.comparison = beginMembershipComparison(role, membership);
    await save();
  }
  const comparison = p.comparison;
  // Completed certification is the expected successor of the comparison parent. Any other
  // advance requires a new human comparison, even if the same candidate appears in the roster.
  const i = proofs.continuations.findIndex((proof) => proof.head === comparison.parent);
  if (i < 0 || proofs.continuations[i]?.kind !== 'membership-admission') return restart();
  const following = proofs.continuations.slice(i + 1);
  if (following[0]?.kind === 'membership-cancellation' && following.length === 1) {
    if (comparison.content) return { kind: 'removal-required' };
    return { kind: 'cancelled' };
  }
  if (following.length > 1 || (following[0] && following[0].kind !== 'membership-certification'))
    return restart();
  const pendingProofs = { ...proofs, continuations: proofs.continuations.slice(0, i + 1) },
    pending = historyMembership((await verifyMembershipChain(pendingProofs, base)).history),
    childOwner = { ...owner, load: async () => capture(await owner.load()).comparison };
  if (input.cancel || p.withdrawal) {
    // An approved local decision may already have reached the service. Never reinterpret a lost
    // approval or a retained key-bearing handoff as evidence that no key was exposed.
    if (
      following.length ||
      comparison.content ||
      (comparison.decision?.payload as { outcome?: unknown } | null)?.outcome === 'approved'
    )
      return { kind: 'removal-required' };
    const state = membershipState(pending),
      candidate = state.preparations[0];
    if (!candidate || state.preparations.length !== 1)
      throw Error('Cancellation needs the exact pending connection');
    if (!p.withdrawal) {
      p.withdrawal = parseMembershipCancellationRequest({
        v: 2,
        kind: 'membership-cancellation-request',
        workspaceId: state.workspaceId,
        lineageId: state.lineageId,
        parent: state.head,
        epoch: state.epoch,
        preparationId: candidate.attemptId,
        candidateId: candidate.credentialId,
        actorId: owner.participant.id,
        nonce: hex(random(32)),
        signature: '00'.repeat(64),
      });
      p.withdrawal.signature = await owner.sign(
        await membershipCancellationRequestMessage(p.withdrawal),
      );
      await save();
    }
    const withdrawal = await verifyMembershipCancellationRequest(p.withdrawal, pending);
    if (
      withdrawal.actorId !== owner.participant.id ||
      !same(capture(await owner.load()).withdrawal, withdrawal)
    )
      throw Error('Cancellation intent did not persist');
    const result = (await request('/account/membership/v2/cancel', withdrawal)) as {
      ok?: unknown;
      refusal?: unknown;
      cancellation?: unknown;
    };
    if (result.ok !== true) {
      if (result.refusal === 'removal-required') return { kind: 'removal-required' };
      throw Error('Cancellation was not confirmed. Retry the saved connection.');
    }
    const cancellation = parseMembershipCancellation(result.cancellation);
    await verifyMembershipCancellation(cancellation, pending);
    if (!same(cancellation.epoch.cancellation, withdrawal))
      throw Error('Cancellation result changed');
    p.latest = parseMembershipChain({
      ...pendingProofs,
      continuations: [...pendingProofs.continuations, cancellation],
    });
    await save();
    return { kind: 'cancelled' };
  }
  const compared = await continueMembershipComparison(
    comparison,
    childOwner,
    pending,
    { ...io, save, request },
    input.typed,
  );
  if (compared.kind !== 'approved')
    return {
      ...compared,
      canCancel:
        !comparison.content &&
        (comparison.decision?.payload as { outcome?: unknown } | null)?.outcome !== 'approved',
    };
  const certification = following[0]?.kind === 'membership-certification' ? following[0] : null;
  const handoff = await continueMembershipHandoff(
    comparison,
    childOwner,
    { base, membership: pending, certification },
    save,
    request,
  );
  if (handoff !== 'certified') return { kind: handoff };
  const completed = comparison.content!.certification!;
  const certifiedProofs = parseMembershipChain({
    ...pendingProofs,
    continuations: [...pendingProofs.continuations, completed],
  });
  await verifyMembershipChain(certifiedProofs, base);
  if (!same(p.latest, certifiedProofs)) {
    p.latest = certifiedProofs;
    await save();
  }
  if (role === 'existing' || !input.read) return { kind: 'certified' };
  const result = await loadMembershipWriting(
    comparison,
    childOwner,
    { base, proofs: certifiedProofs },
    { signal: io.signal, save, request, read: (bytes) => io.read(bytes, base) },
  );
  guard();
  if (result.kind === 'loading') return { kind: 'loading' };
  await owner.installMembershipWriting(
    { base, ...certifiedProofs },
    comparison.reading!,
    comparison.content!.key!,
  );
  guard();
  return { kind: 'installed' };
}
