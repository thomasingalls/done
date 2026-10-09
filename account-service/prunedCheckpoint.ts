/** A service-authenticated completion receipt replaces only an older admitted snapshot's ciphertext. */
import { closed } from '../account-protocol/preparation.ts';
import { domainMessage, verifySignature, same } from '../account-protocol/admission.ts';
import { unhex } from '../account-protocol/recovery.ts';
import {
  parseHistoryCheckpointAdmission,
  type HistoryCheckpoint,
  type HistoryCheckpointAdmission,
} from '../account-protocol/historyCheckpoint.ts';
import type { AuthorityPin } from '../account-protocol/authority.ts';

export const isPrunedCheckpoint = (input: unknown) =>
  (input as { kind?: unknown } | null)?.kind === 'pruned-history-checkpoint';
export function parsePrunedCheckpoint(input: unknown) {
  const r = closed(input, [
    'v',
    'kind',
    'workspace',
    'lineage',
    'hash',
    'sequence',
    'parent',
    'admission',
    'signature',
  ]);
  if (
    r['v'] !== 1 ||
    r['kind'] !== 'pruned-history-checkpoint' ||
    !Number.isSafeInteger(r['sequence']) ||
    (r['sequence'] as number) < 1 ||
    (r['sequence'] as number) >= Number.MAX_SAFE_INTEGER
  )
    throw Error('Invalid retired snapshot');
  for (const key of ['lineage', 'hash', 'parent']) unhex(r[key], 32);
  unhex(r['workspace'], 16);
  unhex(r['signature'], 64);
  const admission = parseHistoryCheckpointAdmission(r['admission']);
  if (admission.checkpointHash !== r['hash']) throw Error('Retired admission differs');
  return {
    v: 1 as const,
    kind: 'pruned-history-checkpoint' as const,
    workspace: r['workspace'] as string,
    lineage: r['lineage'] as string,
    hash: r['hash'] as string,
    sequence: r['sequence'] as number,
    parent: r['parent'] as string,
    admission,
    signature: r['signature'] as string,
  };
}
export function prunedCheckpointMessage(input: unknown) {
  const { signature: _, ...body } = parsePrunedCheckpoint(input);
  return domainMessage('done/service-pruned-history-checkpoint/v1', body);
}
export async function preparePrunedCheckpoint(
  checkpoint: HistoryCheckpoint,
  admission: HistoryCheckpointAdmission,
  sign: (bytes: Uint8Array) => Promise<string>,
) {
  const p = parsePrunedCheckpoint({
    v: 1,
    kind: 'pruned-history-checkpoint',
    workspace: checkpoint.manifest.workspaceId,
    lineage: checkpoint.manifest.lineageId,
    hash: admission.checkpointHash,
    sequence: checkpoint.manifest.sequence,
    parent: checkpoint.manifest.parent,
    admission,
    signature: '00'.repeat(64),
  });
  p.signature = await sign(await prunedCheckpointMessage(p));
  return JSON.stringify(p);
}
export async function verifyPrunedCheckpoint(
  input: unknown,
  pin: AuthorityPin,
  expected: {
    workspace: string;
    lineage: string;
    hash: string;
    sequence: number;
    admission: unknown;
  },
) {
  const p = parsePrunedCheckpoint(input);
  if (
    p.workspace !== expected.workspace ||
    p.lineage !== expected.lineage ||
    p.hash !== expected.hash ||
    p.sequence !== expected.sequence ||
    !same(p.admission, expected.admission)
  )
    throw Error('Retired snapshot scope changed');
  await verifySignature(pin.authRoot, p.signature, await prunedCheckpointMessage(p));
  return p;
}
