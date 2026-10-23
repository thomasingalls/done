/** Private Account pairing. This is a retirement boundary, not a profile rollback witness. */
import { concat, utf8, type Bytes } from './custodyCrypto';
import type { ContentIdentity } from './contentRecord';
import { JournalError } from './journalCodec';
import { sameBytes } from './verifiedRecords';

export interface JournalEra {
  current: string;
  previous: string | null;
  revision: number;
}
export interface JournalBinding {
  identity: ContentIdentity;
  intent: string;
  era: JournalEra;
}
const fail = (): never => {
  throw new JournalError('repair-required', 'Account journal/database pairing differs.');
};
export function parseJournalEra(value: unknown): JournalEra {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).sort().join(',') !== 'current,previous,revision'
  )
    return fail();
  const e = value as JournalEra;
  if (
    typeof e.current !== 'string' ||
    !/^[0-9a-f]{64}$/.test(e.current) ||
    !(
      e.previous === null ||
      (typeof e.previous === 'string' && /^[0-9a-f]{64}$/.test(e.previous))
    ) ||
    e.current === e.previous ||
    !Number.isSafeInteger(e.revision) ||
    e.revision < 1
  )
    return fail();
  return { current: e.current, previous: e.previous, revision: e.revision };
}
const magic = utf8('done/account-journal/era-1\0');
const header = (b: JournalBinding) => [
  b.identity.slotId,
  b.identity.principalId,
  b.identity.workspaceId,
  b.identity.storeId,
  b.identity.rootId,
  b.intent,
  parseJournalEra(b.era).current,
];
export function wrapAccountJournal(bytes: Bytes, binding: JournalBinding | undefined): Bytes {
  if (!binding) return bytes.slice();
  const encoded = utf8(JSON.stringify(header(binding))),
    size = new Uint8Array(4);
  new DataView(size.buffer).setUint32(0, encoded.length, false);
  return concat(magic, size, encoded, bytes);
}
/** Caller owns plaintext. Never mutate stored capsule bytes or infer an era from the journal. */
export function unwrapAccountJournal(bytes: Bytes, binding: JournalBinding | undefined): Bytes {
  const wrapped = sameBytes(bytes.subarray(0, magic.length), magic);
  if (!binding) {
    if (wrapped) return fail();
    return bytes.slice();
  }
  if (!wrapped || bytes.length < magic.length + 4) return fail();
  const size = new DataView(bytes.buffer, bytes.byteOffset + magic.length, 4).getUint32(0, false);
  const start = magic.length + 4;
  if (
    size > 1024 ||
    start + size >= bytes.length ||
    !sameBytes(bytes.subarray(start, start + size), utf8(JSON.stringify(header(binding))))
  )
    return fail();
  return bytes.slice(start + size);
}
