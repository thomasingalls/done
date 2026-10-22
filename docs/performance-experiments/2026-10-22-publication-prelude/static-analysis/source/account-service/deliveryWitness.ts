/** Service-only completeness witness; never an acceptance or refusal signature. */
import { lp, unhex } from '../account-protocol/recovery.ts';
import { closed } from '../account-protocol/preparation.ts';
export interface DeliveryWitness {
  events: number;
  hash: string;
  signature: string;
}
export interface WitnessScope {
  workspace: string;
  credential: string;
  lineage: string;
  head: string;
  request: string;
}
export const ZERO_LEDGER = '00'.repeat(32);
export function witnessMessage(s: WitnessScope, w: Omit<DeliveryWitness, 'signature'>) {
  if (!Number.isSafeInteger(w.events) || w.events < 1) throw Error('Invalid delivery count');
  unhex(s.workspace, 16);
  unhex(s.credential, 16);
  for (const h of [s.lineage, s.head, s.request, w.hash]) unhex(h, 32);
  return lp(
    'done/service-delivery-witness/v1',
    s.workspace,
    s.credential,
    s.lineage,
    s.head,
    s.request,
    String(w.events),
    w.hash,
  );
}
export function parseWitness(input: unknown): DeliveryWitness {
  const w = closed(input, ['events', 'hash', 'signature']);
  unhex(w['hash'], 32);
  unhex(w['signature'], 64);
  if (!Number.isSafeInteger(w['events']) || (w['events'] as number) < 1)
    throw Error('Invalid delivery witness');
  return {
    events: w['events'] as number,
    hash: w['hash'] as string,
    signature: w['signature'] as string,
  };
}
