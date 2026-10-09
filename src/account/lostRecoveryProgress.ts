/** Factor-sealed recovery intent. All target/proof bytes are reverified on every cold resumption. */
import { closed } from '../../account-protocol/preparation';
import {
  parseLostRecoveryBegin,
  parseLostRecoveryPrepared,
  verifyLostRecoveryPrepared,
} from '../../account-protocol/lostDeviceRecovery';
import {
  parseRecoveryCommit,
  recoveryCheckpointDigest,
} from '../../account-protocol/recoveryCommit';
import {
  parseRecoverySuccessor,
  verifyRecoveryIntent,
} from '../../account-protocol/recoveryTransition';
import { verifyEarlyHistory, historyMembership } from '../../account-protocol/admissionHistory';
import { verifyMembershipChain } from '../../account-protocol/membershipLocator';
import { parseSessionIssuance } from '../../account-protocol/session';
import { same } from '../../account-protocol/admission';
import { unhex } from '../../account-protocol/recovery';
import type { AuthorityPin } from '../../account-protocol/authority';
export function parseLostRecoveryProgress(input: unknown) {
  const r = closed(input, [
    'v',
    'kind',
    'begin',
    'prepared',
    'request',
    'login',
    'successor',
    'key',
  ]);
  if (r['v'] !== 1 || r['kind'] !== 'lost-device-recovery')
    throw Error('Invalid saved recovery progress');
  let key: { sequence: number; ct: string } | null = null;
  if (r['key'] !== null) {
    const k = closed(r['key'], ['sequence', 'ct']);
    if (!Number.isSafeInteger(k['sequence']) || (k['sequence'] as number) < 1)
      throw Error('Invalid recovery key reservation');
    unhex(k['ct'], 48);
    key = { sequence: k['sequence'] as number, ct: k['ct'] as string };
  }
  return {
    v: 1 as const,
    kind: 'lost-device-recovery' as const,
    begin: parseLostRecoveryBegin(r['begin']),
    prepared: parseLostRecoveryPrepared(r['prepared']),
    request: parseRecoveryCommit(r['request']),
    login: r['login'] === null ? null : parseSessionIssuance(r['login']),
    successor: r['successor'] === null ? null : parseRecoverySuccessor(r['successor']),
    key,
  };
}
export type LostRecoveryProgress = ReturnType<typeof parseLostRecoveryProgress>;
export async function verifyLostRecoveryProgress(input: unknown, pin: AuthorityPin) {
  const p = parseLostRecoveryProgress(input),
    checked = await verifyLostRecoveryPrepared(p.prepared, p.begin, pin);
  if (
    !p.prepared.binding ||
    !p.begin.login ||
    !p.prepared.challenge.context.login ||
    p.request.retryKey !== p.begin.retryKey ||
    p.request.intent.attemptId !== p.prepared.challenge.context.attemptId ||
    !same(p.request.intent.head, p.prepared.head) ||
    p.request.intent.bootstrap.newCredentialId !== p.begin.candidate.credentialId ||
    p.request.intent.bootstrap.newWPub !== p.begin.candidate.wPub ||
    p.request.intent.bootstrap.newSPub !== p.begin.candidate.sPub ||
    p.request.intent.checkpointDigest !== (await recoveryCheckpointDigest(p.request.checkpoint))
  )
    throw Error('Saved recovery target changed');
  const before =
    checked.history && (p.prepared.proofs?.certification || p.prepared.proofs?.continuations.length)
      ? checked.history
      : await verifyEarlyHistory(p.prepared.base, p.prepared.proofs?.successor ?? null);
  await verifyRecoveryIntent(p.request.intent, historyMembership(before), checked.context.recovery);
  if (
    p.login?.ok &&
    (p.login.accountId !== p.prepared.accountId || p.login.credentialId !== p.prepared.passkeyId)
  )
    throw Error('Saved recovery login changed');
  if (p.key && !p.successor) throw Error('Recovery key has no committed successor');
  let authority = null;
  if (p.successor) {
    if (!same(p.successor.epoch.intent, p.request.intent))
      throw Error('Recovery outcome differs from saved intent');
    const proofs = {
      successor: p.prepared.proofs?.successor ?? null,
      certification: p.prepared.proofs?.certification ?? null,
      continuations: [...(p.prepared.proofs?.continuations ?? []), p.successor],
    };
    const verified = await verifyMembershipChain(proofs, p.prepared.base);
    authority = { base: p.prepared.base, ...verified.proofs };
  }
  return { progress: p, authority };
}
