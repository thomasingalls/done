/** One fresh combined passkey/enrollment proof, saved before finish/admission retries. */
import { same } from '../../account-protocol/admission';
import {
  parseEnrollmentCandidate,
  enrollmentPossessionMessage,
  verifyEnrollmentReceipt,
  type EnrollmentCandidate,
  type EnrollmentContext,
  type EnrollmentReceipt,
} from '../../account-protocol/enrollment';
import {
  membershipState,
  parseMembershipAdmission,
  verifyMembershipAdmission,
  type VerifiedMembership,
  type MembershipAdmission,
} from '../../account-protocol/membership';
import type { SuccessorBase } from '../../account-protocol/successor';
import type { SessionIssued } from '../../account-protocol/session';
import { freshEnrollmentChallenge } from './enrollmentChallenge';
import { checkEnrollmentLogin, completeEnrollmentLogin } from './enrollmentLogin';
import { random } from '../crdt/custodyCrypto';
import type { MembershipVault } from './membershipVault';

export interface MembershipPreparation {
  v: 2;
  candidate: EnrollmentCandidate;
  retryKey: string;
  loginRetryKey: string;
  challenge: EnrollmentContext | null;
  proof: {
    retryKey: string;
    loginRetryKey: string;
    attemptId: string;
    response: unknown;
    possession: string;
  } | null;
  receipt: EnrollmentReceipt | null;
  admission: MembershipAdmission | null;
}
const capability = () =>
  btoa(String.fromCharCode(...random(32)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
export function beginMembershipPreparation(
  participant: MembershipVault['participant'],
  parent: VerifiedMembership,
): MembershipPreparation {
  const state = membershipState(parent);
  if (state.preparations.length) throw Error('Resume or cancel the pending connection first');
  return {
    v: 2,
    candidate: parseEnrollmentCandidate({
      v: 1,
      workspaceId: state.workspaceId,
      lineageId: state.lineageId,
      head: state.head,
      credentialId: participant.id,
      wPub: participant.wPub,
      sPub: participant.sPub,
    }),
    retryKey: capability(),
    loginRetryKey: capability(),
    challenge: null,
    proof: null,
    receipt: null,
    admission: null,
  };
}
export async function completeMembershipPreparation(
  p: MembershipPreparation,
  owner: Pick<MembershipVault, 'participant' | 'load' | 'sign' | 'rememberLogin'>,
  base: SuccessorBase,
  parent: VerifiedMembership,
  io: {
    signal: AbortSignal;
    now?(): number;
    save(): Promise<void>;
    request(path: string, body: unknown): Promise<unknown>;
    assert(context: EnrollmentContext): Promise<unknown>;
    acknowledge(login: SessionIssued): Promise<unknown>;
  },
) {
  const state = membershipState(parent),
    now = io.now ?? Date.now,
    identity = {
      accountId: state.accountId,
      credentialId: base.receipt.activation.context.credentialId,
    },
    guard = () => io.signal.throwIfAborted();
  const durable = async () => {
    guard();
    const saved = await owner.load();
    guard();
    if (!same(saved, p)) throw Error('Enrollment progress did not persist');
  };
  const save = async () => {
    guard();
    await io.save();
    await durable();
  };
  await durable();
  const candidate = parseEnrollmentCandidate(p.candidate);
  if (
    p.v !== 2 ||
    candidate.head !== state.head ||
    candidate.workspaceId !== state.workspaceId ||
    candidate.lineageId !== state.lineageId ||
    !same(base.pin, state.pin) ||
    base.receipt.offer.epoch.accountId !== state.accountId ||
    !same(owner.participant, {
      id: candidate.credentialId,
      wPub: candidate.wPub,
      sPub: candidate.sPub,
    })
  )
    throw Error('Prepared device or parent changed');
  if (!p.receipt) {
    if (!p.proof) {
      const challenge = await freshEnrollmentChallenge({
        pin: state.pin,
        candidate,
        retryKey: p.retryKey,
        now,
        begin: async (retryKey) => {
          await durable();
          return io.request('/__account-setup/enrollment/begin', {
            retryKey,
            candidate,
            loginRetryKey: p.loginRetryKey,
          });
        },
        renew: async () => {
          p.retryKey = capability();
          p.loginRetryKey = capability();
          p.challenge = null;
          await save();
          return p.retryKey;
        },
      });
      if (
        challenge.context.v !== 2 ||
        challenge.context.epoch !== state.epoch ||
        challenge.context.certifiedSetDigest !== state.certifiedSetDigest ||
        challenge.context.recoveryStateDigest !== state.certificate.recoveryStateDigest
      )
        throw Error('Enrollment authority changed');
      await checkEnrollmentLogin(challenge.context, p.loginRetryKey, identity);
      p.challenge = challenge.context;
      await save();
      const response = await io.assert(challenge.context);
      guard();
      if (now() >= challenge.context.expiresAt)
        throw Error('The passkey step expired. Use the account passkey again to renew it.');
      p.proof = {
        retryKey: p.retryKey,
        loginRetryKey: p.loginRetryKey,
        attemptId: challenge.context.attemptId,
        response,
        possession: await owner.sign(enrollmentPossessionMessage(challenge.context)),
      };
      await save();
    }
    if (!p.challenge) throw Error('The saved enrollment login challenge is missing');
    p.receipt = await completeEnrollmentLogin({
      pin: state.pin,
      context: p.challenge,
      loginRetryKey: p.loginRetryKey,
      expected: identity,
      signal: io.signal,
      finish: async () => {
        await durable();
        return io.request('/__account-setup/enrollment/finish', p.proof);
      },
      remember: (result) => owner.rememberLogin(state.pin, identity, result),
      persistReceipt: async (receipt) => {
        p.receipt = receipt;
        await save();
      },
      acknowledge: io.acknowledge,
    });
  }
  const receipt = await verifyEnrollmentReceipt(p.receipt, state.pin, candidate);
  if (receipt.context.v !== 2 || receipt.context.epoch !== state.epoch)
    throw Error('Enrollment parent changed');
  if (!p.admission) {
    await durable();
    const admission = parseMembershipAdmission(
      await io.request('/account/membership/v2/admit', {
        retryKey: p.retryKey,
        attemptId: receipt.context.attemptId,
        receiptId: receipt.receiptId,
      }),
    );
    await verifyMembershipAdmission(admission, parent);
    if (!same(admission.epoch.preparation, receipt))
      throw Error('A different preparation was admitted');
    p.admission = admission;
    await save();
  }
  const admission = parseMembershipAdmission(p.admission);
  const verified = await verifyMembershipAdmission(admission, parent);
  if (!same(admission.epoch.preparation, receipt)) throw Error('Saved preparation changed');
  await durable();
  return verified;
}
