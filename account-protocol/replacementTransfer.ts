/** Snapshot transport remains separate from the small signed membership proof chain. */
import { closed, accountIdentifier } from './preparation.ts';
import { domainMessage, json } from './admission.ts';
import { digest, unhex } from './recovery.ts';
import {
  parseReplacementCheckpoint,
  REPLACEMENT_CHECKPOINT_LIMIT,
  type ReplacementCheckpoint,
} from './replacementCheckpoint.ts';
export const REPLACEMENT_TRANSFER_LIMIT = REPLACEMENT_CHECKPOINT_LIMIT + 4096;
export interface ReplacementTransferRequest {
  v: 1;
  workspaceId: string;
  parent: string;
  preparationId: string;
  credentialId: string;
  action: 'publish' | 'read';
  payload: ReplacementCheckpoint | null;
  signature: string;
}
const hex = (v: unknown, bytes = 32) => {
  unhex(v, bytes);
  return v as string;
};
export function parseReplacementTransfer(input: unknown): ReplacementTransferRequest {
  if (json(input).length > REPLACEMENT_TRANSFER_LIMIT)
    throw Error('Replacement transfer too large');
  const r = closed(input, [
    'v',
    'workspaceId',
    'parent',
    'preparationId',
    'credentialId',
    'action',
    'payload',
    'signature',
  ]);
  if (
    r['v'] !== 1 ||
    !['publish', 'read'].includes(String(r['action'])) ||
    (r['action'] === 'read' && r['payload'] !== null)
  )
    throw Error('Invalid replacement transfer');
  return {
    v: 1,
    workspaceId: hex(r['workspaceId'], 16),
    parent: hex(r['parent']),
    preparationId: accountIdentifier(r['preparationId']),
    credentialId: hex(r['credentialId'], 16),
    action: r['action'] as 'publish' | 'read',
    payload: r['action'] === 'publish' ? parseReplacementCheckpoint(r['payload']) : null,
    signature: hex(r['signature'], 64),
  };
}
export async function replacementTransferMessage(input: unknown) {
  const { signature: _, payload, ...body } = parseReplacementTransfer(input);
  return domainMessage('done/replacement-checkpoint-transfer/v1', {
    ...body,
    payloadHash: await digest(json(payload)),
  });
}
