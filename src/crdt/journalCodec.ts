/** Selected row-2 construction. No persistence or admission authority in this module. */
import { createJournalSeal } from '../../wasm/journal-seal/seal.generated';
import { concat, fields, type Bytes } from './custodyCrypto';

/** Interim measured-rule value, not a supported-population performance receipt. */
export const MAX_JOURNAL_UPDATE = 16 * 1024;
export const JOURNAL_WATERMARK = 1024 * 1024;
export type JournalRefusal =
  | 'invalid-input'
  | 'unavailable'
  | 'repair-required'
  | 'journal-changed'
  | 'journal-busy';
export class JournalError extends Error {
  override readonly name = 'JournalError';
  constructor(
    readonly code: JournalRefusal,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
export const journalPrefix = (dbName: string): string =>
  `done.pending-update.${encodeURIComponent(dbName)}.`;
export const journalAAD = (workspaceId: string, generation: number, storageKey: string): Bytes =>
  fields('done/jrnl/v1', workspaceId, String(generation), storageKey);
export const deriveJournalKey = async (
  generation: Bytes,
  workspaceId: string,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<Bytes> => {
  const key = await subtle.importKey('raw', generation, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(),
        info: fields('done/journal/v1', workspaceId),
      },
      key,
      256,
    ),
  );
};
export const encodeJournal = (generation: number, nonce: Bytes, ct: Bytes): string => {
  if (
    !Number.isInteger(generation) ||
    generation < 1 ||
    generation > 0xffffffff ||
    nonce.length !== 24 ||
    ct.length < 16
  )
    throw new JournalError('invalid-input', 'Invalid journal framing.');
  const header = new Uint8Array(4);
  new DataView(header.buffer).setUint32(0, generation, false);
  const bytes = concat(header, nonce, ct);
  // Bounded at admission, with no spread of an arbitrarily large array.
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return '2:' + btoa(binary);
};
export const decodeJournal = (value: string): { generation: number; nonce: Bytes; ct: Bytes } => {
  try {
    if (typeof value !== 'string' || !value.startsWith('2:'))
      throw Error('Unknown or legacy journal version');
    const encoded = value.slice(2);
    if (
      encoded.length > 4 * Math.ceil((4 + 24 + MAX_JOURNAL_UPDATE + 16) / 3) ||
      encoded.length < 60 ||
      encoded.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
    )
      throw Error('Invalid base64 framing');
    const binary = atob(encoded);
    if (btoa(binary) !== encoded) throw Error('Noncanonical base64');
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    if (bytes.length < 44 || bytes.length > 44 + MAX_JOURNAL_UPDATE)
      throw Error('Invalid record length');
    const generation = new DataView(bytes.buffer).getUint32(0, false);
    if (!generation) throw Error('Invalid generation');
    return { generation, nonce: bytes.slice(4, 28), ct: bytes.slice(28) };
  } catch (cause) {
    throw new JournalError(
      'repair-required',
      'Unsupported or malformed journal entry; preserve it for repair.',
      { cause },
    );
  }
};
export const createJournalCodec = (workspaceId: string, generation: number, key: Bytes) => {
  const wasm = createJournalSeal();
  return {
    seal(storageKey: string, nonce: Bytes, plaintext: Bytes): string {
      if (plaintext.length > MAX_JOURNAL_UPDATE)
        throw new JournalError('invalid-input', 'Journal admission must precede sealing.');
      const ct = wasm.seal(key, nonce, journalAAD(workspaceId, generation, storageKey), plaintext);
      return encodeJournal(generation, nonce, ct);
    },
    open(storageKey: string, value: string): { generation: number; bytes: Bytes } {
      const parsed = decodeJournal(value);
      if (parsed.generation !== generation)
        throw new JournalError(
          'repair-required',
          'No retained opener for this journal generation.',
        );
      try {
        return {
          generation: parsed.generation,
          bytes: wasm.open(
            key,
            parsed.nonce,
            journalAAD(workspaceId, parsed.generation, storageKey),
            parsed.ct,
          ),
        };
      } catch (cause) {
        throw new JournalError(
          'repair-required',
          'Journal authentication failed; preserve the entry.',
          { cause },
        );
      }
    },
    dispose() {
      wasm.dispose();
    },
  };
};
