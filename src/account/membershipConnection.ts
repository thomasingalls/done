/** One retained additional-device journey, executed inside the actual slot's exclusive permit. */
import { same } from '../../account-protocol/admission';
import { closed } from '../../account-protocol/preparation';
import {
  parseMembershipInvitation,
  parseMembershipChain,
  verifyMembershipChain,
} from '../../account-protocol/membershipLocator';
import { historyAuthority, historyMembership } from '../../account-protocol/admissionHistory';
import { membershipState } from '../../account-protocol/membership';
import type { AuthorityPin } from '../../account-protocol/authority';
import type { SuccessorBase } from '../../account-protocol/successor';
import type { EnrollmentContext } from '../../account-protocol/enrollment';
import type { SessionIssued } from '../../account-protocol/session';
import type { MembershipVault } from './membershipVault';
import type { MembershipReading } from '../crdt/membershipReading';
import type { Bytes } from '../crdt/custodyCrypto';
import { prepareMembershipInvitation, bootstrapMembershipInvitation } from './membershipInvitation';
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
    | 'comparison-cancelled';
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
  ]);
  if (
    p['v'] !== 2 ||
    p['kind'] !== 'membership-connection' ||
    !['existing', 'new'].includes(p['role'] as string) ||
    (p['terminal'] !== null && p['terminal'] !== 'restart-required') ||
    (p['base'] === null) !== (p['latest'] === null)
  )
    throw Error('Invalid saved connection');
  // The signed authority and component records are authenticated again before their next effect.
  return {
    ...p,
    invitation: parseMembershipInvitation(p['invitation']),
  } as unknown as MembershipConnection;
}

/** Never holds an unlocked owner between calls; every operation begins by cold-reading its progress. */
export async function advanceMembershipConnection(
  owner: MembershipVault,
  role: MembershipConnection['role'],
  io: MembershipConnectionIO,
  input: {
    invitation?: unknown;
    workspaceId?: string;
    enroll?: boolean;
    typed?: string;
    read?: boolean;
    reconnect?: boolean;
  } = {},
): Promise<MembershipConnectionView> {
  const guard = () => io.signal.throwIfAborted();
  guard();
  const loaded = await owner.load();
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
    };
    await save();
  } else p = capture(loaded);
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
  if (following.length > 1 || (following[0] && following[0].kind !== 'membership-certification'))
    return restart();
  const pendingProofs = { ...proofs, continuations: proofs.continuations.slice(0, i + 1) },
    pending = historyMembership((await verifyMembershipChain(pendingProofs, base)).history),
    childOwner = { ...owner, load: async () => capture(await owner.load()).comparison };
  const compared = await continueMembershipComparison(
    comparison,
    childOwner,
    pending,
    { ...io, save, request },
    input.typed,
  );
  if (compared.kind !== 'approved') return compared;
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
