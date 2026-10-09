/** Private development relay requests. A relay view is never a content-access grant. */
import { closed, accountIdentifier } from './preparation.ts';
import { domainMessage, json } from './admission.ts';
import { unhex } from './recovery.ts';
import { parseCeremonyCommit, parseCeremonyReveal } from './ceremonyExchange.ts';
export const CEREMONY_RELAY_LIMIT = 16 * 1024;
export type CeremonyAction = 'read' | 'commit' | 'reveal' | 'decide' | 'cancel';
interface CeremonyRequestBody {
  kind: 'ceremony-relay';
  workspaceId: string;
  credentialId: string;
  action: CeremonyAction;
  payload: unknown;
  signature: string;
}
export type CeremonyRequest = CeremonyRequestBody &
  ({ v: 1 } | { v: 2; head: string; preparationId: string });
const hex = (v: unknown, n = 32) => {
  unhex(v, n);
  return v as string;
};
export function parseCeremonyRequest(input: unknown): CeremonyRequest {
  if (json(input).length > CEREMONY_RELAY_LIMIT) throw Error('Relay request too large');
  const version = (input as { v?: unknown } | null)?.v;
  const r = closed(input, [
    'v',
    'kind',
    'workspaceId',
    'credentialId',
    'action',
    'payload',
    'signature',
    ...(version === 2 ? ['head', 'preparationId'] : []),
  ]);
  if ((r['v'] !== 1 && r['v'] !== 2) || r['kind'] !== 'ceremony-relay')
    throw Error('Invalid relay request');
  const action = r['action'] as CeremonyAction;
  let payload: unknown;
  if (action === 'read') {
    if (r['payload'] !== null) throw Error('Invalid read');
    payload = null;
  } else if (action === 'commit') payload = parseCeremonyCommit(r['payload']);
  else if (action === 'reveal') payload = parseCeremonyReveal(r['payload']);
  else if (action === 'cancel') {
    const p = closed(r['payload'], ['contextHash']);
    payload = { contextHash: hex(p['contextHash']) };
  } else if (action === 'decide') {
    const p = closed(r['payload'], ['contextHash', 'transcriptHash', 'outcome']);
    if (p['outcome'] !== 'approved' && p['outcome'] !== 'mismatch') throw Error('Invalid decision');
    payload = {
      contextHash: hex(p['contextHash']),
      transcriptHash: hex(p['transcriptHash']),
      outcome: p['outcome'],
    };
  } else throw Error('Invalid relay action');
  const body = {
    credentialId: hex(r['credentialId'], 16),
    action,
    payload,
    signature: hex(r['signature'], 64),
  };
  const scope = { kind: 'ceremony-relay' as const, workspaceId: hex(r['workspaceId'], 16) };
  return version === 2
    ? {
        v: 2,
        ...scope,
        head: hex(r['head']),
        preparationId: accountIdentifier(r['preparationId']),
        ...body,
      }
    : { v: 1, ...scope, ...body };
}
export const ceremonyRequestMessage = (input: unknown) => {
  const { signature: _signature, ...body } = parseCeremonyRequest(input);
  return domainMessage(`done/enrollment-ceremony-relay/v${body.v}`, body);
};

export const ceremonyBootstrapMessage = (body: unknown) =>
  domainMessage('done/enrollment-ceremony-bootstrap/v1', body);

/** Existing device authorizes sharing the historical admission proof, which includes encrypted genesis. */
export function parseCeremonyInvitation(input: unknown) {
  const r = closed(input, ['v', 'workspaceId', 'credentialId', 'nonce', 'signature']);
  if (r['v'] !== 1) throw Error('Invalid invitation');
  return {
    v: 1 as const,
    workspaceId: hex(r['workspaceId'], 16),
    credentialId: hex(r['credentialId'], 16),
    nonce: hex(r['nonce']),
    signature: hex(r['signature'], 64),
  };
}
export const ceremonyInvitationMessage = (input: unknown) => {
  const { signature: _signature, ...body } = parseCeremonyInvitation(input);
  return domainMessage('done/enrollment-ceremony-invitation/v1', body);
};
