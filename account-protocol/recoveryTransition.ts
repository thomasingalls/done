import { proofWork, type ProofCheckpoint } from './proofWork.ts';
/** Exact recovery intent and signed membership successor. Neither installs local keys. */
import { closed, accountIdentifier } from './preparation.ts';
import { json, same, domainMessage, verifySignature } from './admission.ts';
import { digest, unhex, parseDraft, type RecoveryDraft } from './recovery.ts';
import {
  parseRecoveryBootstrap,
  parseRecoveryHeadAssertion,
  verifyRecoveryHeadAssertion,
  verifyRecoveryBootstrap,
} from './recoveryBootstrap.ts';
import { parseRemovalFinalization, removalFinalizationMessage } from './rotation.ts';
import {
  membershipState,
  MEMBERSHIP_CREDENTIAL_LIMIT,
  MEMBERSHIP_PROOF_LIMIT,
  type VerifiedMembership,
  type MembershipState,
} from './membership.ts';
import { EMPTY_LINK, type StreamHead } from './successor.ts';
import { parseHistorySources } from './historySourceRefs.ts';

const fixed = (v: unknown, n = 32): string => {
  unhex(v, n);
  return v as string;
};
const integer = (v: unknown, min: number): number => {
  if (
    !Number.isSafeInteger(v) ||
    Object.is(v, -0) ||
    (v as number) < min ||
    (v as number) >= Number.MAX_SAFE_INTEGER
  )
    throw Error('Invalid recovery transition integer');
  return v as number;
};
const bound = (v: unknown) => {
  if (json(v).length > MEMBERSHIP_PROOF_LIMIT) throw Error('Oversized recovery transition');
};
function vector<T>(v: unknown, parse: (v: unknown) => T, id: (v: T) => string): T[] {
  if (!Array.isArray(v) || !v.length || v.length > MEMBERSHIP_CREDENTIAL_LIMIT)
    throw Error('Invalid recovery transition vector');
  const result = v.map(parse);
  for (let i = 1; i < result.length; i++)
    if (id(result[i - 1]!) >= id(result[i]!)) throw Error('Unordered recovery transition vector');
  return result;
}
const stream = (v: unknown): StreamHead => {
  const h = closed(v, ['credentialId', 'position', 'link']);
  const position = integer(h['position'], 0),
    link = fixed(h['link']);
  if ((position === 0) !== (link === EMPTY_LINK)) throw Error('Invalid recovery empty stream');
  return { credentialId: fixed(h['credentialId'], 16), position, link };
};
const wrap = (v: unknown) => {
  const w = closed(v, ['enc', 'ct']);
  return { enc: fixed(w['enc']), ct: fixed(w['ct'], 48) };
};
export function parseRecoveryIntent(input: unknown) {
  bound(input);
  const r = closed(input, [
    ...(Object.hasOwn(input as object, 'historyCheckpoint') ? ['historyCheckpoint'] : []),
    ...(Object.hasOwn(input as object, 'sources') ? ['sources'] : []),
    'v',
    'kind',
    'attemptId',
    'head',
    'bootstrap',
    'generation',
    'heads',
    'checkpointDigest',
    'deviceWrap',
    'recoveryWrap',
    'signature',
  ]);
  if (r['v'] !== 1 || r['kind'] !== 'recovery-transition-intent')
    throw Error('Invalid recovery intent');
  return {
    v: 1 as const,
    kind: 'recovery-transition-intent' as const,
    attemptId: accountIdentifier(r['attemptId']),
    head: parseRecoveryHeadAssertion(r['head']),
    bootstrap: parseRecoveryBootstrap(r['bootstrap']),
    generation: integer(r['generation'], 2),
    heads: vector(r['heads'], stream, (h) => h.credentialId),
    checkpointDigest: fixed(r['checkpointDigest']),
    deviceWrap: wrap(r['deviceWrap']),
    recoveryWrap: wrap(r['recoveryWrap']),
    signature: fixed(r['signature'], 64),
    ...(Object.hasOwn(r, 'historyCheckpoint')
      ? { historyCheckpoint: fixed(r['historyCheckpoint']) }
      : {}),
    ...(Object.hasOwn(r, 'sources') ? { sources: parseHistorySources(r['sources']) } : {}),
  };
}
export type RecoveryIntent = ReturnType<typeof parseRecoveryIntent>;
export const recoveryIntentMessage = (input: unknown) => {
  const { signature: _, ...body } = parseRecoveryIntent(input);
  return domainMessage('done/recovery-transition-intent/v1', body);
};
export async function verifyRecoveryIntent(
  input: unknown,
  parent: VerifiedMembership,
  recoveryInput: RecoveryDraft,
  checkpoint?: ProofCheckpoint,
) {
  const intent = parseRecoveryIntent(input),
    p = membershipState(parent),
    recovery = parseDraft(recoveryInput),
    b = intent.bootstrap;
  if (
    intent.head.head !== p.head ||
    intent.head.epoch !== p.epoch ||
    intent.generation !== p.generation + 1 ||
    p.roster.some((m) => m.id === b.newCredentialId) ||
    p.finalized.some((m) => m.credential === b.newCredentialId)
  )
    throw Error('Recovery parent changed');
  const head = await proofWork(
    checkpoint,
    verifyRecoveryHeadAssertion(intent.head, p.pin, {
      workspaceId: p.workspaceId,
      clientNonce: b.clientNonce,
    }),
  );
  await proofWork(
    checkpoint,
    verifyRecoveryBootstrap(b, {
      head,
      recovery,
      currentRecoveryStateDigest: p.certificate.recoveryStateDigest,
      candidate: { credentialId: b.newCredentialId, wPub: b.newWPub, sPub: b.newSPub },
      conflictParent: p.head,
    }),
  );
  // Include finalized historical publishers as well as all currently certified writers.
  const expected = [
    ...p.certificate.members.map((m) => m.id),
    ...p.finalized.map((m) => m.credential),
  ].sort();
  if (intent.sources?.some((s) => s.epoch > p.epoch))
    throw Error('Recovery source exceeds its parent membership');
  if (
    !same(
      intent.heads.map((h) => h.credentialId),
      expected,
    )
  )
    throw Error('Recovery coverage changed');
  for (const h of intent.heads) {
    const final = p.finalized.find((f) => f.credential === h.credentialId),
      before = final ?? p.heads.find((s) => s.credentialId === h.credentialId)!;
    if (
      h.position < before.position ||
      (h.position === before.position && h.link !== before.link) ||
      (final && h.position !== final.position)
    )
      throw Error('Recovery accepted boundary changed');
  }
  await proofWork(
    checkpoint,
    verifySignature(
      b.newSPub,
      intent.signature,
      await proofWork(checkpoint, recoveryIntentMessage(intent)),
    ),
  );
  return intent;
}
export function parseRecoverySuccessor(input: unknown) {
  bound(input);
  const r = closed(input, ['v', 'kind', 'epoch', 'head', 'signature']);
  if (r['v'] !== 1 || r['kind'] !== 'recovery-successor') throw Error('Invalid recovery successor');
  const e = closed(r['epoch'], [
    'v',
    'kind',
    'workspaceId',
    'lineageId',
    'epoch',
    'parent',
    'generation',
    'acceptancePublicKey',
    'intent',
    'recovery',
    'heads',
    'finalizations',
  ]);
  if (e['v'] !== 1 || e['kind'] !== 'recovery-epoch') throw Error('Invalid recovery epoch');
  return {
    v: 1 as const,
    kind: 'recovery-successor' as const,
    epoch: {
      v: 1 as const,
      kind: 'recovery-epoch' as const,
      workspaceId: fixed(e['workspaceId'], 16),
      lineageId: fixed(e['lineageId']),
      epoch: integer(e['epoch'], 2),
      parent: fixed(e['parent']),
      generation: integer(e['generation'], 2),
      acceptancePublicKey: fixed(e['acceptancePublicKey']),
      intent: parseRecoveryIntent(e['intent']),
      recovery: parseDraft(e['recovery']),
      heads: vector(e['heads'], stream, (h) => h.credentialId),
      finalizations: vector(e['finalizations'], parseRemovalFinalization, (h) => h.credential),
    },
    head: fixed(r['head']),
    signature: fixed(r['signature'], 64),
  };
}
export type RecoverySuccessor = ReturnType<typeof parseRecoverySuccessor>;
export const recoverySuccessorMessage = (input: unknown) => {
  const proof = parseRecoverySuccessor(input);
  return domainMessage('done/recovery-successor/v1', proof.epoch);
};
/** Only membership.ts brands the resulting state; callers cannot mint a trusted parent. */
export async function verifyRecoverySuccessorState(
  input: unknown,
  parent: VerifiedMembership,
  checkpoint?: ProofCheckpoint,
): Promise<MembershipState> {
  const proof = parseRecoverySuccessor(input),
    p = membershipState(parent),
    e = proof.epoch;
  if (
    e.workspaceId !== p.workspaceId ||
    e.lineageId !== p.lineageId ||
    e.parent !== p.head ||
    e.epoch !== p.epoch + 1 ||
    e.generation !== p.generation + 1 ||
    e.acceptancePublicKey !== p.acceptancePublicKey
  )
    throw Error('Recovery continuity changed');
  const intent = await proofWork(
      checkpoint,
      verifyRecoveryIntent(e.intent, parent, e.recovery, checkpoint),
    ),
    b = intent.bootstrap;
  const member = { id: b.newCredentialId, wPub: b.newWPub, sPub: b.newSPub };
  const own = { credentialId: member.id, position: 0, link: EMPTY_LINK };
  const expectedHeads = [
    ...intent.heads,
    ...p.roster
      .filter((m) => m.state === 'pending')
      .map((m) => ({ credentialId: m.id, position: 0, link: EMPTY_LINK })),
    own,
  ].sort((a, b) => a.credentialId.localeCompare(b.credentialId));
  if (
    !same(e.heads, expectedHeads) ||
    !same(
      e.finalizations.map((h) => h.credential),
      p.certificate.members.map((m) => m.id),
    )
  )
    throw Error('Recovery finalization coverage changed');
  for (const final of e.finalizations) {
    const cut = intent.heads.find((h) => h.credentialId === final.credential)!;
    if (
      final.workspace !== p.workspaceId ||
      final.epoch !== e.epoch ||
      final.position !== cut.position ||
      final.link !== cut.link
    )
      throw Error('Recovery finalization changed');
    await proofWork(
      checkpoint,
      verifySignature(p.acceptancePublicKey, final.signature, removalFinalizationMessage(final)),
    );
  }
  const message = await proofWork(checkpoint, recoverySuccessorMessage(proof));
  if (proof.head !== (await proofWork(checkpoint, digest(message))))
    throw Error('Recovery head changed');
  await proofWork(checkpoint, verifySignature(p.pin.authRoot, proof.signature, message));
  const certificate = {
    v: 1 as const,
    kind: 'recovery-recipient-certificate' as const,
    members: [member],
    recoveryStateDigest: b.newRecoveryStateDigest,
    approver: member.id,
    intentId: await proofWork(
      checkpoint,
      digest(await proofWork(checkpoint, recoveryIntentMessage(intent))),
    ),
  };
  return {
    ...structuredClone(p),
    epoch: e.epoch,
    head: proof.head,
    generation: e.generation,
    certificate,
    certifiedSetDigest: await proofWork(checkpoint, digest(json(certificate))),
    roster: [
      {
        ...member,
        principalId: p.principalId,
        state: 'certified',
        capabilities: ['read', 'write', 'admit', 'manage'],
      },
    ],
    heads: [own],
    finalized: [...p.finalized, ...e.finalizations],
    preparations: [],
  } as MembershipState;
}
