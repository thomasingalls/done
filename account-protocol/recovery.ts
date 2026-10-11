/** Closed, public recovery-preparation bytes. No account or content authority. */
export interface RecoveryContext {
  principalId: string;
  workspaceId: string;
  lineageId: string;
  authRoot: string;
}
export interface RecoveryDraft extends RecoveryContext {
  v: 1;
  rootCommitment: string;
  rPub: string;
  bootstrapSigner: string;
  envelope: { v: 1; salt: string; nonce: string; ct: string };
}
const HEX_BYTES = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'));
export const hex = (value: Uint8Array): string => {
  if (!value.length) value.subarray(0, 0); // Keep detached-buffer failure, including empty views.
  const parts = new Array<string>(value.length);
  for (let i = 0; i < value.length; i++) parts[i] = HEX_BYTES[value[i]!]!;
  return parts.join('');
};
export const unhex = (value: unknown, size: number): Uint8Array<ArrayBuffer> => {
  if (typeof value !== 'string' || value.length !== size * 2 || !/^[0-9a-f]+$/.test(value))
    throw Error('Invalid canonical hex');
  // Preserve the old pair parser's behavior; validation is deliberately unchanged.
  if (value.length === 1) throw new TypeError('No complete hex pair');
  const bytes = new Uint8Array(Math.floor(value.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    const high = value.charCodeAt(2 * i),
      low = value.charCodeAt(2 * i + 1);
    bytes[i] = ((high < 58 ? high - 48 : high - 87) << 4) | (low < 58 ? low - 48 : low - 87);
  }
  return bytes;
};
export const lp = (...values: string[]): Uint8Array<ArrayBuffer> => {
  const parts = values.map((value) => {
    if (!/^[\x20-\x7e]*$/.test(value)) throw Error('Non-ASCII protocol field');
    const body = new TextEncoder().encode(value);
    if (body.length > 65535) throw Error('Protocol field too long');
    return new Uint8Array([body.length >>> 8, body.length & 255, ...body]);
  });
  const result = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};
export const digest = async (value: Uint8Array<ArrayBuffer>): Promise<string> =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', value)));
const closed = (input: unknown, keys: string[]): Record<string, unknown> => {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(input, key))
  )
    throw Error('Malformed recovery object');
  return input as Record<string, unknown>;
};
const contextKeys = ['principalId', 'workspaceId', 'lineageId', 'authRoot'];
export function context(input: unknown): RecoveryContext {
  const value = closed(input, contextKeys);
  for (const key of contextKeys.slice(0, 3))
    if (typeof value[key] !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value[key]))
      throw Error('Malformed recovery identity');
  unhex(value['authRoot'], 32);
  return {
    principalId: value['principalId'] as string,
    workspaceId: value['workspaceId'] as string,
    lineageId: value['lineageId'] as string,
    authRoot: value['authRoot'] as string,
  };
}
export const rootCommitment = (value: RecoveryContext): Promise<string> =>
  digest(lp('done/pkg-root/v1', value.workspaceId, value.lineageId, value.authRoot));
export function parseDraft(input: unknown): RecoveryDraft {
  const value = closed(input, [
    ...contextKeys,
    'v',
    'rootCommitment',
    'rPub',
    'bootstrapSigner',
    'envelope',
  ]);
  const scope = context(Object.fromEntries(contextKeys.map((key) => [key, value[key]])));
  const envelope = closed(value['envelope'], ['v', 'salt', 'nonce', 'ct']);
  if (value['v'] !== 1 || envelope['v'] !== 1) throw Error('Unsupported recovery version');
  for (const key of ['rootCommitment', 'rPub', 'bootstrapSigner']) unhex(value[key], 32);
  unhex(envelope['salt'], 16);
  unhex(envelope['nonce'], 12);
  unhex(envelope['ct'], 112);
  return {
    ...scope,
    v: 1,
    rootCommitment: value['rootCommitment'] as string,
    rPub: value['rPub'] as string,
    bootstrapSigner: value['bootstrapSigner'] as string,
    envelope: {
      v: 1,
      salt: envelope['salt'] as string,
      nonce: envelope['nonce'] as string,
      ct: envelope['ct'] as string,
    },
  };
}
export const envelopeBytes = (draft: RecoveryDraft): Uint8Array<ArrayBuffer> =>
  lp(
    'done/recovery-envelope/v1',
    '1',
    draft.envelope.salt,
    draft.envelope.nonce,
    draft.envelope.ct,
  );
export const recoveryStateDigest = async (draft: RecoveryDraft): Promise<string> =>
  digest(
    lp(
      'done/recovery-state/v1',
      '0',
      draft.rPub,
      await digest(envelopeBytes(draft)),
      draft.rootCommitment,
      draft.bootstrapSigner,
    ),
  );
export const draftDigest = async (draft: RecoveryDraft): Promise<string> =>
  digest(
    lp(
      'done/account-recovery-draft/v1',
      '1',
      draft.principalId,
      draft.workspaceId,
      draft.lineageId,
      draft.authRoot,
      await recoveryStateDigest(draft),
    ),
  );
export const confirmationBytes = (challenge: string, draftHash: string): Uint8Array<ArrayBuffer> =>
  lp('done/account-recovery-confirm/v1', challenge, draftHash);
