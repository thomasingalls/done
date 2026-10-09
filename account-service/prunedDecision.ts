/** Ciphertext-free accepted decision evidence. Signed conversion preserves the original ledger hash. */
import { closed } from '../account-protocol/preparation.ts';
import { domainMessage, verifySignature } from '../account-protocol/admission.ts';
import { digest, hex, lp, unhex } from '../account-protocol/recovery.ts';
import { decodeSubmission } from '../account-protocol/submission.ts';
import { decodeNetworkEnvelope, envelopeSignatureMessage } from '../account-protocol/envelope.ts';
import { refusalId, ZERO_REFUSAL } from '../account-protocol/positionDecision.ts';
import type { DeliveryAuthority, DecisionRow } from './delivery.ts';

export const isPrunedDecision = (bytes: Uint8Array) => bytes[0] === 123;
const h = (value: unknown, size = 32): string => {
  unhex(value, size);
  return value as string;
};
const n = (value: unknown) => {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) >= Number.MAX_SAFE_INTEGER
  )
    throw Error('Invalid pruned decision integer');
  return value as number;
};
export function parsePrunedDecision(input: unknown) {
  const r = closed(input, [
    'v',
    'kind',
    'workspace',
    'credential',
    'lineage',
    'request',
    'ordinal',
    'position',
    'epoch',
    'generation',
    'nonce',
    'digest',
    'envelopeSignature',
    'envelopeHash',
    'submissionSignature',
    'parent',
    'submissionHash',
    'responseHash',
    'latest',
    'previous',
    'signature',
  ]);
  if (r['v'] !== 1 || r['kind'] !== 'pruned-accepted-decision' || n(r['generation']) > 0xffffffff)
    throw Error('Invalid pruned decision');
  return {
    v: 1 as const,
    kind: 'pruned-accepted-decision' as const,
    workspace: h(r['workspace'], 16),
    credential: h(r['credential'], 16),
    lineage: h(r['lineage']),
    request: h(r['request']),
    ordinal: n(r['ordinal']),
    position: n(r['position']),
    epoch: n(r['epoch']),
    generation: n(r['generation']),
    nonce: h(r['nonce'], 12),
    digest: h(r['digest']),
    envelopeSignature: h(r['envelopeSignature'], 64),
    envelopeHash: h(r['envelopeHash']),
    submissionSignature: h(r['submissionSignature'], 64),
    parent: h(r['parent']),
    submissionHash: h(r['submissionHash']),
    responseHash: h(r['responseHash']),
    latest: h(r['latest']),
    previous: h(r['previous']),
    signature: h(r['signature'], 64),
  };
}
export type PrunedDecision = ReturnType<typeof parsePrunedDecision>;
export function prunedDecisionMessage(input: unknown) {
  const { signature: _, ...body } = parsePrunedDecision(input);
  return domainMessage('done/service-pruned-accepted-decision/v1', body);
}
/** Called only after the complete, witnessed ledger and both admitted coverage cuts verify. */
export async function preparePrunedDecision(
  row: DecisionRow,
  auth: DeliveryAuthority,
  retained: { latest: string; previous: string },
  sign: (bytes: Uint8Array) => Promise<string>,
) {
  if (row.kind !== 'accepted' || isPrunedDecision(row.submission))
    throw Error('Decision is not removable ciphertext');
  const s = decodeSubmission(new Uint8Array(row.submission)),
    e = decodeNetworkEnvelope(s.envelope);
  const value = parsePrunedDecision({
    v: 1,
    kind: 'pruned-accepted-decision',
    ...retained,
    workspace: auth.a.workspace,
    credential: auth.credential,
    lineage: auth.a.lineage,
    request: auth.scope.request,
    ordinal: row.ordinal,
    position: e.seq,
    epoch: e.epoch,
    generation: e.gen,
    nonce: hex(e.nonce),
    digest: hex(e.digest),
    envelopeSignature: hex(e.sig),
    envelopeHash: await digest(s.envelope),
    submissionSignature: hex(s.signature),
    parent: s.parent ? await refusalId(s.parent) : ZERO_REFUSAL,
    submissionHash: await digest(new Uint8Array(row.submission)),
    responseHash: await digest(new Uint8Array(row.response)),
    signature: '00'.repeat(64),
  });
  value.signature = await sign(await prunedDecisionMessage(value));
  return new TextEncoder().encode(JSON.stringify(value));
}
export async function verifyPrunedDecision(
  bytes: Uint8Array,
  response: Uint8Array,
  auth: DeliveryAuthority,
  ordinal: number,
  maxEpoch: number,
) {
  if (bytes.length > 4096) throw Error('Pruned decision exceeds its bound');
  const p = parsePrunedDecision(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
  );
  if (
    p.workspace !== auth.a.workspace ||
    p.credential !== auth.credential ||
    p.lineage !== auth.a.lineage ||
    p.request !== auth.scope.request ||
    p.ordinal !== ordinal ||
    p.responseHash !== (await digest(new Uint8Array(response))) ||
    p.epoch < (auth.history?.first.tip ?? (auth.joinedPublisher ? 3 : 1)) ||
    p.epoch > maxEpoch ||
    p.latest === ZERO_REFUSAL ||
    p.previous === ZERO_REFUSAL ||
    p.latest === p.previous
  )
    throw Error('Pruned decision scope changed');
  await verifySignature(auth.pin.authRoot, p.signature, await prunedDecisionMessage(p));
  const e = {
    v: 2 as const,
    workspace_id: p.workspace,
    credential_id: p.credential,
    epoch: p.epoch,
    gen: p.generation,
    seq: p.position,
    nonce: unhex(p.nonce, 12),
    digest: unhex(p.digest, 32),
  };
  if (
    !(await crypto.subtle.verify(
      'Ed25519',
      auth.key,
      unhex(p.envelopeSignature, 64),
      envelopeSignatureMessage(e, e.nonce, e.digest),
    )) ||
    !(await crypto.subtle.verify(
      'Ed25519',
      auth.key,
      unhex(p.submissionSignature, 64),
      lp('done/envelope-submission/v1', '1', p.lineage, p.envelopeHash, p.parent),
    ))
  )
    throw Error('Pruned publisher signature changed');
  return {
    e,
    submission: { parentId: p.parent },
    originalHash: p.submissionHash,
    subject: {
      workspace: p.workspace,
      credential: p.credential,
      position: p.position,
      epoch: p.epoch,
      digest: p.digest,
    },
  };
}
