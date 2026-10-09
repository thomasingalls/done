/** Recovery-only read evidence. Neither a device read grant nor authority to replace membership. */
import { closed, accountIdentifier } from './preparation.ts';
import { unhex, digest } from './recovery.ts';
import { json, domainMessage, verifySignature } from './admission.ts';
import {
  parseRecoveryBootstrap,
  type RecoveryBootstrapContext,
  verifyRecoveryBootstrap,
} from './recoveryBootstrap.ts';
import { ADMITTED_ENVELOPE_WIRE_LIMIT } from './envelope.ts';
import type { AuthorityPin } from './authority.ts';
import { parseContentCheckpoint } from './contentCheckpoint.ts';
import { parseReplacementCheckpoint } from './replacementCheckpoint.ts';
import { parseRecoveryCheckpoint } from './recoveryCommit.ts';

export const RECOVERY_READ_REQUEST_LIMIT = 8192;
export const RECOVERY_READ_PAGE_LIMIT = 4 * 1024 * 1024;
export const RECOVERY_CHECKPOINT_PAGE_LIMIT = 16 * 1024 * 1024;
export const RECOVERY_READ_ENTRIES = 16;
const fixed = (v: unknown, n = 32): string => {
  unhex(v, n);
  return v as string;
};
const integer = (v: unknown): number => {
  if (!Number.isSafeInteger(v) || Object.is(v, -0) || (v as number) < 0)
    throw Error('Invalid recovery read integer');
  return v as number;
};
const boundedHex = (v: unknown, max: number): string => {
  if (typeof v !== 'string' || !v.length || v.length > max * 2)
    throw Error('Oversized recovery entry');
  return fixed(v, v.length / 2);
};
export function parseRecoveryRead(input: unknown) {
  if (json(input).length > RECOVERY_READ_REQUEST_LIMIT) throw Error('Oversized recovery read');
  const r = closed(input, [
    ...(Object.hasOwn(input as object, 'checkpoint') ? ['checkpoint'] : []),
    'retryKey',
    'attemptId',
    'bootstrap',
    'publisher',
    'after',
    'limit',
    'nonce',
    'signature',
  ]);
  const limit = integer(r['limit']);
  if (limit < 1 || limit > RECOVERY_READ_ENTRIES) throw Error('Recovery read extent');
  return {
    retryKey: accountIdentifier(r['retryKey']),
    attemptId: accountIdentifier(r['attemptId']),
    bootstrap: parseRecoveryBootstrap(r['bootstrap']),
    publisher: fixed(r['publisher'], 16),
    after: integer(r['after']),
    limit,
    nonce: fixed(r['nonce']),
    signature: fixed(r['signature'], 64),
    ...(Object.hasOwn(r, 'checkpoint') ? { checkpoint: fixed(r['checkpoint']) } : {}),
  };
}
export type RecoveryRead = ReturnType<typeof parseRecoveryRead>;
export const recoveryReadMessage = (input: unknown) => {
  const { signature: _, ...body } = parseRecoveryRead(input);
  return domainMessage('done/lost-device-recovery-read/v1', body);
};
export async function verifyRecoveryRead(
  input: unknown,
  context: RecoveryBootstrapContext,
  attemptId: string,
) {
  const request = parseRecoveryRead(input);
  if (request.attemptId !== attemptId) throw Error('Recovery attempt changed');
  await verifyRecoveryBootstrap(request.bootstrap, context);
  await verifySignature(
    context.candidate.sPub,
    request.signature,
    await recoveryReadMessage(request),
  );
  return request;
}
export function parseRecoveryReadPage(input: unknown) {
  const snapshot = Object.hasOwn(input as object, 'checkpoint');
  if (json(input).length > (snapshot ? RECOVERY_CHECKPOINT_PAGE_LIMIT : RECOVERY_READ_PAGE_LIMIT))
    throw Error('Oversized recovery page');
  const p = closed(input, [
    ...(snapshot ? ['checkpoint'] : []),
    'v',
    'kind',
    'requestHash',
    'through',
    'link',
    'next',
    'entries',
    'signature',
  ]);
  if (
    p['v'] !== 1 ||
    p['kind'] !== 'lost-device-recovery-page' ||
    !Array.isArray(p['entries']) ||
    p['entries'].length > RECOVERY_READ_ENTRIES
  )
    throw Error('Invalid recovery page');
  return {
    v: 1 as const,
    kind: 'lost-device-recovery-page' as const,
    requestHash: fixed(p['requestHash']),
    through: integer(p['through']),
    link: fixed(p['link']),
    next: integer(p['next']),
    entries: p['entries'].map((raw) => {
      const e = closed(raw, ['envelope', 'proof']);
      return {
        envelope: boundedHex(e['envelope'], ADMITTED_ENVELOPE_WIRE_LIMIT),
        proof: boundedHex(e['proof'], 4096),
      };
    }),
    signature: fixed(p['signature'], 64),
    ...(snapshot
      ? {
          checkpoint:
            p['checkpoint'] === null
              ? null
              : (p['checkpoint'] as { kind?: unknown }).kind === 'content-checkpoint'
                ? parseContentCheckpoint(p['checkpoint'])
                : (p['checkpoint'] as { kind?: unknown }).kind === 'replacement-checkpoint'
                  ? parseReplacementCheckpoint(p['checkpoint'])
                  : parseRecoveryCheckpoint(p['checkpoint']),
        }
      : {}),
  };
}
export type RecoveryReadPage = ReturnType<typeof parseRecoveryReadPage>;
export const recoveryReadPageMessage = (input: unknown) => {
  const { signature: _, ...body } = parseRecoveryReadPage(input);
  return domainMessage('done/lost-device-recovery-page/v1', body);
};
/** Correlates/authenticates the response extent. Caller must still verify/decrypt every entry and
 * prove full replay coverage; a signed page alone does not establish recovered writing. */
export async function verifyRecoveryReadPage(
  input: unknown,
  requestInput: unknown,
  pin: AuthorityPin,
) {
  const page = parseRecoveryReadPage(input),
    request = parseRecoveryRead(requestInput);
  if (
    page.requestHash !== (await digest(json(request))) ||
    page.through < request.after ||
    page.next !== request.after + page.entries.length ||
    page.next > page.through ||
    page.entries.length > request.limit ||
    (page.next < page.through && page.entries.length === 0) ||
    (request.checkpoint !== undefined) !== Object.hasOwn(page, 'checkpoint') ||
    (request.checkpoint &&
      (request.after !== 0 ||
        page.through !== 0 ||
        page.entries.length !== 0 ||
        page.link !== '00'.repeat(32)))
  )
    throw Error('Recovery page extent changed');
  await verifySignature(pin.authRoot, page.signature, await recoveryReadPageMessage(page));
  return page;
}
