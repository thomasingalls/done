/** Request-bound history maintenance exchange. A catalog is service evidence, not local activation. */
import { closed } from './preparation.ts';
import { domainMessage, json, same, verifySignature } from './admission.ts';
import { digest, unhex } from './recovery.ts';
import { membershipState, type VerifiedMembership } from './membership.ts';
import type { AuthorityPin } from './authority.ts';
import {
  HISTORY_CHECKPOINT_LIMIT,
  HISTORY_ADMISSION_LIMIT,
  EMPTY_HISTORY_CHECKPOINT,
  parseHistoryCheckpoint,
  historyCheckpointHash,
  parseHistoryCheckpointAdmission,
  parseHistoryHeads,
  type HistoryCheckpoint,
  type HistoryCheckpointAdmission,
} from './historyCheckpoint.ts';
export const HISTORY_EXCHANGE_LIMIT = HISTORY_CHECKPOINT_LIMIT + 8192;
export const HISTORY_PAGE_LIMIT = HISTORY_CHECKPOINT_LIMIT + HISTORY_ADMISSION_LIMIT + 64 * 1024;
export const HISTORY_EXCHANGE_LIFETIME_MS = 60_000;
const h = (v: unknown, n = 32): string => {
  unhex(v, n);
  return v as string;
};
const integer = (v: unknown, min = 0): number => {
  if (
    !Number.isSafeInteger(v) ||
    Object.is(v, -0) ||
    (v as number) < min ||
    (v as number) >= Number.MAX_SAFE_INTEGER
  )
    throw Error('Invalid history exchange integer');
  return v as number;
};
export function parseHistoryExchange(input: unknown) {
  if (json(input).length > HISTORY_EXCHANGE_LIMIT) throw Error('History exchange too large');
  const r = closed(input, [
    'v',
    'kind',
    'workspaceId',
    'lineageId',
    'epoch',
    'head',
    'credentialId',
    'nonce',
    'expiresAt',
    'action',
    'payload',
    'signature',
  ]);
  if (
    r['v'] !== 1 ||
    r['kind'] !== 'history-checkpoint-request' ||
    !['read', 'publish', 'admit', 'discard'].includes(r['action'] as string)
  )
    throw Error('Invalid history exchange');
  const action = r['action'] as 'read' | 'publish' | 'admit' | 'discard';
  let payload: unknown;
  if (action === 'publish') payload = parseHistoryCheckpoint(r['payload']);
  else if (action === 'admit') payload = parseHistoryCheckpointAdmission(r['payload']);
  else if (action === 'discard') payload = h(r['payload']);
  else {
    if (!['latest', 'previous', 'pending'].includes(r['payload'] as string))
      throw Error('Invalid checkpoint selector');
    payload = r['payload'];
  }
  return {
    v: 1 as const,
    kind: 'history-checkpoint-request' as const,
    workspaceId: h(r['workspaceId'], 16),
    lineageId: h(r['lineageId']),
    epoch: integer(r['epoch'], 1),
    head: h(r['head']),
    credentialId: h(r['credentialId'], 16),
    nonce: h(r['nonce']),
    expiresAt: integer(r['expiresAt']),
    action,
    payload,
    signature: h(r['signature'], 64),
  };
}
export type HistoryExchange = ReturnType<typeof parseHistoryExchange>;
export function historyExchangeMessage(input: unknown) {
  const { signature: _, ...body } = parseHistoryExchange(input);
  return domainMessage('done/history-checkpoint-request/v1', body);
}
export const historyExchangeHash = (input: unknown) => digest(json(parseHistoryExchange(input)));
export function checkHistoryExchangeLifetime(expiresAt: number, now: number) {
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    expiresAt <= now ||
    expiresAt - now > HISTORY_EXCHANGE_LIFETIME_MS
  )
    throw Error('History exchange expired');
}
export async function verifyHistoryExchange(
  input: unknown,
  authority: VerifiedMembership,
  now: number,
) {
  const r = parseHistoryExchange(input),
    p = membershipState(authority),
    member = p.certificate.members.find((m) => m.id === r.credentialId);
  checkHistoryExchangeLifetime(r.expiresAt, now);
  if (
    !member ||
    r.workspaceId !== p.workspaceId ||
    r.lineageId !== p.lineageId ||
    r.epoch !== p.epoch ||
    r.head !== p.head
  )
    throw Error('History exchange authority changed');
  await verifySignature(member.sPub, r.signature, await historyExchangeMessage(r));
  return r;
}
export interface HistoryCatalog {
  v: 1;
  kind: 'history-checkpoint-catalog';
  workspaceId: string;
  lineageId: string;
  sequence: number;
  latest: string;
  previous: string;
  pending: string;
  signature: string;
}
export function parseHistoryCatalog(input: unknown): HistoryCatalog {
  const r = closed(input, [
    'v',
    'kind',
    'workspaceId',
    'lineageId',
    'sequence',
    'latest',
    'previous',
    'pending',
    'signature',
  ]);
  if (r['v'] !== 1 || r['kind'] !== 'history-checkpoint-catalog')
    throw Error('Invalid history catalog');
  const sequence = integer(r['sequence']),
    latest = h(r['latest']),
    previous = h(r['previous']);
  if (
    (sequence === 0) !== (latest === EMPTY_HISTORY_CHECKPOINT) ||
    sequence < 2 !== (previous === EMPTY_HISTORY_CHECKPOINT)
  )
    throw Error('Invalid history catalog ancestry');
  return {
    v: 1,
    kind: 'history-checkpoint-catalog',
    workspaceId: h(r['workspaceId'], 16),
    lineageId: h(r['lineageId']),
    sequence,
    latest,
    previous,
    pending: h(r['pending']),
    signature: h(r['signature'], 64),
  };
}
export function historyCatalogMessage(input: unknown) {
  const { signature: _, ...body } = parseHistoryCatalog(input);
  return domainMessage('done/history-checkpoint-catalog/v1', body);
}
export async function verifyHistoryCatalog(
  input: unknown,
  pin: AuthorityPin,
  workspaceId: string,
  lineageId: string,
) {
  const c = parseHistoryCatalog(input);
  if (c.workspaceId !== workspaceId || c.lineageId !== lineageId)
    throw Error('History catalog scope changed');
  await verifySignature(pin.authRoot, c.signature, await historyCatalogMessage(c));
  return c;
}
export interface HistoryCheckpointPage {
  v: 1;
  kind: 'history-checkpoint-page';
  requestHash: string;
  catalog: HistoryCatalog;
  checkpoint: HistoryCheckpoint | null;
  admission: HistoryCheckpointAdmission | null;
  heads: ReturnType<typeof parseHistoryHeads>;
  signature: string;
}
export function parseHistoryCheckpointPage(input: unknown): HistoryCheckpointPage {
  if (json(input).length > HISTORY_PAGE_LIMIT) throw Error('History checkpoint page too large');
  const r = closed(input, [
    'v',
    'kind',
    'requestHash',
    'catalog',
    'checkpoint',
    'admission',
    'heads',
    'signature',
  ]);
  if (
    r['v'] !== 1 ||
    r['kind'] !== 'history-checkpoint-page' ||
    (r['checkpoint'] === null && r['admission'] !== null)
  )
    throw Error('Invalid history page');
  return {
    v: 1,
    kind: 'history-checkpoint-page',
    requestHash: h(r['requestHash']),
    catalog: parseHistoryCatalog(r['catalog']),
    checkpoint: r['checkpoint'] === null ? null : parseHistoryCheckpoint(r['checkpoint']),
    admission: r['admission'] === null ? null : parseHistoryCheckpointAdmission(r['admission']),
    heads: parseHistoryHeads(r['heads']),
    signature: h(r['signature'], 64),
  };
}
export function historyCheckpointPageMessage(input: unknown) {
  const { signature: _, ...body } = parseHistoryCheckpointPage(input);
  return domainMessage('done/history-checkpoint-page/v1', body);
}
/** Membership/ciphertext/semantic checks remain required before using a returned snapshot. */
export async function verifyHistoryCheckpointPage(
  input: unknown,
  request: unknown,
  pin: AuthorityPin,
) {
  const r = parseHistoryExchange(request),
    p = parseHistoryCheckpointPage(input);
  if (p.requestHash !== (await historyExchangeHash(r))) throw Error('History page request changed');
  await verifyHistoryCatalog(p.catalog, pin, r.workspaceId, r.lineageId);
  await verifySignature(pin.authRoot, p.signature, await historyCheckpointPageMessage(p));
  const hash = p.checkpoint ? await historyCheckpointHash(p.checkpoint) : EMPTY_HISTORY_CHECKPOINT;
  if (r.action === 'read') {
    const selector = r.payload as 'latest' | 'previous' | 'pending';
    if (
      p.catalog[selector] !== hash ||
      (selector !== 'pending' && p.checkpoint !== null && p.admission === null) ||
      (selector === 'pending' && p.admission !== null)
    )
      throw Error('History page selection changed');
  } else if (r.action === 'publish') {
    if (hash !== (await historyCheckpointHash(r.payload)))
      throw Error('Published checkpoint changed');
  } else if (r.action === 'admit') {
    if (!p.admission || !same(p.admission, r.payload) || p.admission.checkpointHash !== hash)
      throw Error('Admitted checkpoint changed');
  } else if (
    p.checkpoint !== null ||
    p.admission !== null ||
    p.catalog.pending !== EMPTY_HISTORY_CHECKPOINT
  )
    throw Error('Discarded checkpoint remains');
  return p;
}
