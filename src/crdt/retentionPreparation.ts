/** Exact-input, verifier-owned preparation receipts. No full ledger, cut, or commit authority. */
import {
  encodePreparationValue,
  decodePreparationValue,
  PREPARATION_VALUE_BYTES,
  PREPARATION_VALUE_NODES,
} from './preparationValue';
import { fields, hex, type Bytes } from './custodyCrypto';
import type { ReceiptVerificationMemo } from './verificationMemo';
import { captureInboundReceiptSyntax, inboundReceiptViews } from './inboundRecord';
import { READ_COUNT_LIMIT } from '../../account-protocol/deliveryTransport';
import { MAX_BATCH_BYTES, MAX_BATCH_RECORDS } from './contentRecord';
import type { BaselineAuthentication } from './localBaselineReplay';
import { eraseVerified, sameBytes } from './verifiedRecords';
export { PreparationCapacity } from './preparationCapacity';

const DOMAIN = 'done/local-preparation/draft-1';
export const PREPARATION_SLICE_MS = 2000;
export const PREPARATION_ENTRIES = 131072;
// A saved slice is one encoded value of [slot, digest, result] rows inside a signed frame. Each
// row costs its accounted bytes plus ROW_FRAME in the encoder's count and four values; the
// outer array and signed frame fit in SLICE_FRAME. Within these a kept slice always saves.
const ROW_FRAME = 19,
  SLICE_FRAME = 256,
  SLICE_ROWS = Math.floor((PREPARATION_VALUE_NODES - 1) / 4);
export class PreparationPause extends Error {
  constructor() {
    super('Preparation slice saved before continuing');
  }
}
interface Receipt {
  slot: string;
  digest: string;
  result: Bytes;
}
export interface PreparationReceipts {
  readonly kind: 'authenticated-preparation-receipts';
}
const proofs = new WeakMap<PreparationReceipts, { context: string; entries: Receipt[] }>();
const invalid = (): never => {
  throw Error('Invalid preparation receipt');
};
const hashString = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
const positive = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
function resultObject(v: unknown, keys: string[]) {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    v instanceof Uint8Array ||
    Object.keys(v).sort().join() !== keys.slice().sort().join()
  )
    return invalid();
  return v as Record<string, unknown>;
}

/** Closed local-journal roles. They identify exact evidence, never a page alias or authority. */
function pageRole(slot: string) {
  const m = /^inbound-page:([1-9][0-9]*):(0|[1-9][0-9]*):([1-9][0-9]*)$/.exec(slot);
  if (!m || slot.length > 128) return;
  const sequence = Number(m[1]),
    first = Number(m[2]),
    count = Number(m[3]);
  if (
    !Number.isSafeInteger(sequence) ||
    first >= READ_COUNT_LIMIT ||
    count > READ_COUNT_LIMIT ||
    first + count > READ_COUNT_LIMIT
  )
    return;
  return { sequence, first, count };
}
function indexedInboundSlot(slot: string) {
  const m = /^inbound:([1-9][0-9]*):(0|[1-9][0-9]*)$/.exec(slot);
  if (!m || slot.length > 128) return;
  const sequence = Number(m[1]),
    index = Number(m[2]);
  if (!Number.isSafeInteger(sequence) || index >= READ_COUNT_LIMIT) return;
  return { sequence, index };
}
function pageSlot(addresses: readonly string[]): string {
  if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > READ_COUNT_LIMIT)
    return invalid();
  let sequence = 0,
    first = 0;
  for (let offset = 0; offset < addresses.length; offset++) {
    const address = addresses[offset];
    if (typeof address !== 'string') return invalid();
    const part = indexedInboundSlot(address);
    if (!part) return invalid();
    if (offset === 0) {
      sequence = part.sequence;
      first = part.index;
    }
    if (part.sequence !== sequence || part.index !== first + offset) return invalid();
  }
  const slot = `inbound-page:${sequence}:${first}:${addresses.length}`;
  if (!pageRole(slot)) return invalid();
  return slot;
}
function validatePageResult(slot: string, value: unknown) {
  const role = pageRole(slot),
    v = resultObject(value, ['record', 'entries']);
  if (!role || !(v['record'] instanceof Uint8Array) || !Array.isArray(v['entries']))
    return invalid();
  const raw = v['record'];
  if (!(raw.buffer instanceof ArrayBuffer)) return invalid();
  const captured = captureInboundReceiptSyntax(
    new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength),
  );
  try {
    if (!captured || captured.receipt.kind !== 'page') return invalid();
    const record = captured.receipt.record,
      views = inboundReceiptViews(captured);
    if (
      record.firstEntry !== role.first ||
      record.entryCount !== role.count ||
      v['entries'].length !== role.count
    )
      return invalid();
    let bytes = v['record'].length,
      records = 1,
      offset = 0;
    for (const { entryIndex, event } of views.entries()) {
      const entry = resultObject(v['entries'][offset++], ['index', 'original', 'result']),
        original = resultObject(entry['original'], ['envelope', 'proof']),
        result = resultObject(entry['result'], [
          'kind',
          'updates',
          'actor',
          'position',
          'link',
          'through',
        ]),
        actor = resultObject(result['actor'], ['id', 'kind']),
        selected = captured.originals.page.entries[entryIndex]!;
      if (
        entry['index'] !== entryIndex ||
        result['kind'] !== 'received' ||
        result['position'] !== event.position ||
        result['link'] !== event.link ||
        result['through'] !== captured.originals.page.through ||
        !Array.isArray(result['updates']) ||
        !result['updates'].every((b) => b instanceof Uint8Array) ||
        typeof actor['id'] !== 'string' ||
        !['human', 'system'].includes(String(actor['kind'])) ||
        !(original['envelope'] instanceof Uint8Array) ||
        !(original['proof'] instanceof Uint8Array) ||
        !sameBytes(original['envelope'], selected.envelope) ||
        !sameBytes(original['proof'], selected.proof)
      )
        return invalid();
      bytes += result['updates'].reduce((n, b: Uint8Array) => n + b.length, 0);
      records += result['updates'].length;
      if (bytes > MAX_BATCH_BYTES || records > MAX_BATCH_RECORDS) return invalid();
    }
  } finally {
    eraseVerified(captured);
  }
}
function pageInput(slot: string, value: unknown, inputs: readonly Uint8Array[]) {
  if (!pageRole(slot)) return;
  const v = resultObject(value, ['record', 'entries']);
  if (
    !(v['record'] instanceof Uint8Array) ||
    !(inputs[0] instanceof Uint8Array) ||
    !sameBytes(v['record'], inputs[0])
  )
    invalid();
}
function validSlot(s: string) {
  if (pageRole(s) || indexedInboundSlot(s)) return true;
  if (s === 'admission-prefix' || /^coverage:[0-9a-f]{64}$/.test(s)) return true;
  const m = /^(opened|witness|spool|link|delivery|inbound|history):((?:0|[1-9][0-9]*))$/.exec(s);
  return (
    !!m &&
    s.length <= 128 &&
    Number.isSafeInteger(Number(m[2])) &&
    Number(m[2]) >= (m[1] === 'witness' ? 0 : 1)
  );
}
function validateResult(slot: string, bytes: Bytes) {
  const value = decodePreparationValue(bytes),
    family = slot.split(':')[0];
  try {
    if (family === 'inbound-page') validatePageResult(slot, value);
    if (family === 'opened' && !(value instanceof Uint8Array)) invalid();
    if (['spool', 'coverage', 'admission-prefix'].includes(family!) && value !== undefined)
      invalid();
    if (family === 'link' && !hashString(value)) invalid();
    if (family === 'witness') {
      const w = value as { events: number; hash: string };
      if (
        !w ||
        Object.keys(w).sort().join() !== 'events,hash' ||
        !Number.isSafeInteger(w.events) ||
        w.events < 0 ||
        !hashString(w.hash)
      )
        invalid();
    }

    if (family === 'delivery') {
      const kind = (value as { kind?: unknown } | null)?.kind;
      if (kind === undefined) {
        const v = resultObject(value, ['lineage', 'envelope', 'parent', 'signature', 'parentId']);
        if (
          !hashString(v['lineage']) ||
          !hashString(v['parentId']) ||
          !(v['envelope'] instanceof Uint8Array) ||
          !(v['signature'] instanceof Uint8Array) ||
          v['signature'].length !== 64 ||
          (v['parent'] !== null && typeof v['parent'] !== 'object')
        )
          invalid();
      } else if (kind === 'refused') {
        const v = resultObject(value, ['kind', 'refusalId', 'refusal']);
        if (!hashString(v['refusalId']) || !v['refusal'] || typeof v['refusal'] !== 'object')
          invalid();
      } else if (kind === 'accepted' || kind === 'conflict') {
        const v = resultObject(value, ['kind', 'head', 'leaf']);
        const leaf = resultObject(v['leaf'], ['epoch', 'digest']);
        if (
          !positive(leaf['epoch']) ||
          !hashString(leaf['digest']) ||
          !v['head'] ||
          typeof v['head'] !== 'object'
        )
          invalid();
      } else invalid();
    }
    if (family === 'inbound') {
      const kind = (value as { kind?: unknown } | null)?.kind;
      if (kind !== 'received' && kind !== 'conflict') invalid();
      const v = resultObject(
        value,
        kind === 'received'
          ? ['kind', 'record', 'updates', 'actor', 'position', 'link', 'through']
          : ['kind', 'record', 'position', 'through'],
      );
      if (
        !(v['record'] instanceof Uint8Array) ||
        !positive(v['position']) ||
        !Number.isSafeInteger(v['through']) ||
        Number(v['through']) < Number(v['position'])
      )
        invalid();
      if (kind === 'received') {
        const actor = resultObject(v['actor'], ['id', 'kind']);
        if (
          !hashString(v['link']) ||
          !Array.isArray(v['updates']) ||
          !v['updates'].every((b) => b instanceof Uint8Array) ||
          typeof actor['id'] !== 'string' ||
          !['human', 'system'].includes(String(actor['kind']))
        )
          invalid();
      }
    }
    if (family === 'history') {
      const v = resultObject(value, ['update', 'duplicate', 'installed', 'heads']);
      if (
        !(v['update'] instanceof Uint8Array) ||
        typeof v['duplicate'] !== 'boolean' ||
        (v['heads'] !== null && !Array.isArray(v['heads']))
      )
        invalid();
      const installed = v['installed'] as { receiveCuts?: unknown };
      const i = resultObject(installed, [
        'hash',
        'sequence',
        ...(installed?.receiveCuts === true ? ['receiveCuts'] : []),
      ]);
      if (!hashString(i['hash']) || !positive(i['sequence'])) invalid();
    }
  } finally {
    eraseVerified(value);
  }
}
/** Authenticating a delta creates the only import capability. Raw decoded values cannot seed reuse. */
export async function authenticatePreparationReceipts(
  context: string,
  payload: Bytes,
  mac: Bytes,
  auth: Pick<BaselineAuthentication, 'verify'>,
  current: () => void,
): Promise<PreparationReceipts> {
  current();
  if (!hashString(context) || payload.length > PREPARATION_VALUE_BYTES || mac.length !== 32)
    invalid();
  const copied = payload.slice(),
    signature = mac.slice();
  let entries: Receipt[] = [];
  let delivered = false;
  try {
    const message = encodePreparationValue([DOMAIN, 'receipts', context, copied]);
    let valid: boolean;
    try {
      valid = await auth.verify(message, signature);
    } finally {
      message.fill(0);
    }
    current();
    if (!valid) invalid();
    const raw = decodePreparationValue(copied);
    try {
      if (!Array.isArray(raw) || raw.length > PREPARATION_ENTRIES) return invalid();
      const seen = new Set<string>();
      for (const row of raw) {
        if (
          !Array.isArray(row) ||
          row.length !== 3 ||
          typeof row[0] !== 'string' ||
          !validSlot(row[0]) ||
          !hashString(row[1]) ||
          !(row[2] instanceof Uint8Array) ||
          seen.has(row[0])
        )
          invalid();
        validateResult(row[0], row[2]);
        seen.add(row[0]);
        entries.push({ slot: row[0], digest: row[1], result: row[2].slice() });
      }
    } finally {
      eraseVerified(raw);
    }
    const proof: PreparationReceipts = Object.freeze({
      kind: 'authenticated-preparation-receipts',
    });
    current();
    proofs.set(proof, { context, entries });
    delivered = true;
    return proof;
  } finally {
    copied.fill(0);
    signature.fill(0);
    if (!delivered) eraseVerified(entries);
  }
}
export function preparationReceiptCount(proof: PreparationReceipts) {
  const p = proofs.get(proof);
  if (!p) return invalid();
  return p.entries.length;
}
export function disposePreparationReceipts(proof: PreparationReceipts) {
  const held = proofs.get(proof);
  if (held) eraseVerified(held.entries);
  proofs.delete(proof);
}
export function createPreparationJournal(options: {
  context: string;
  current(): void;
  now?(): number;
  sliceMs?: number;
  /** Encoded bytes the saved checkpoint can still take in one more slice. */
  room?: number;
}) {
  if (!hashString(options.context)) invalid();
  const room = Math.min(options.room ?? PREPARATION_VALUE_BYTES, PREPARATION_VALUE_BYTES);
  if (!Number.isSafeInteger(room) || room < 0) invalid();
  const current = () => {
    if (closed) throw Error('Preparation journal closed');
    options.current();
  };
  const entries = new Map<string, Receipt>(),
    pending = new Map<string, Receipt>();
  // Reopening and authenticating a saved prefix must not exhaust the next fresh slice.
  // The wall clock starts on its first miss; existing atomic verification/interrupt guards stay.
  let began: number | undefined;
  let closed = false,
    bytes = 0,
    ownedBytes = 0,
    misses = 0,
    hits = 0,
    revision = 0,
    started = false;
  // Once the cache or its checkpoint cannot take a result, the rest of this pass is uncached:
  // nothing more is kept and no slice pauses, since a saved slice could not hold the work.
  let full = false,
    pendingBytes = 0;
  const now = options.now ?? performance.now.bind(performance);
  const slice = options.sliceMs ?? PREPARATION_SLICE_MS;
  if (!Number.isFinite(slice) || slice <= 0) invalid();
  const check = async <T>(
    slot: string,
    context: string,
    input: readonly Uint8Array[],
    verify: () => Promise<T>,
    assert: () => void,
  ): Promise<T> => {
    current();
    assert();
    if (!validSlot(slot)) invalid();
    started = true;
    const at = revision,
      captured = input.map((b) => new Uint8Array(b));
    const unchanged = () => {
      current();
      assert();
      if (at !== revision) throw Error('Preparation journal changed');
      if (input.length !== captured.length || input.some((b, i) => !sameBytes(b, captured[i]!)))
        throw Error('Preparation input changed');
    };
    let frame: Bytes | undefined;
    try {
      frame = encodePreparationValue([DOMAIN, 'input', options.context, slot, context, captured]);
      let digest: string;
      try {
        digest = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', frame)));
      } finally {
        frame.fill(0);
        frame = undefined;
      }
      unchanged();
      const prior = entries.get(slot);
      if (prior?.digest === digest) {
        hits++;
        const value = decodePreparationValue(prior.result);
        try {
          pageInput(slot, value, captured);
          return value as T;
        } catch (error) {
          eraseVerified(value);
          throw error;
        }
      }
      const freshAt = now();
      began ??= freshAt;
      if (!full && pending.size && (freshAt - began >= slice || pending.size >= SLICE_ROWS))
        throw new PreparationPause();
      const value = await verify();
      let result: Bytes | undefined;
      try {
        unchanged();
        // The caller receives the same detached copy as from a kept result; it is not kept.
        if (full) return structuredClone(value);
        result = encodePreparationValue(value);
        validateResult(slot, result);
        pageInput(slot, value, captured);
        const size = (r: Receipt) => r.result.length + r.slot.length + 64,
          replaced = prior ? size(prior) : 0,
          own = result.length + slot.length + 64,
          nextBytes = bytes - replaced + own,
          nextPending =
            pendingBytes - (pending.has(slot) ? replaced + ROW_FRAME : 0) + own + ROW_FRAME;
        if (
          (!prior && entries.size >= PREPARATION_ENTRIES) ||
          nextBytes > PREPARATION_VALUE_BYTES ||
          nextPending + SLICE_FRAME > room
        ) {
          full = true;
          return structuredClone(value);
        }
        ownedBytes += result.length - (prior?.result.length ?? 0);
        prior?.result.fill(0);
        const receipt = { slot, digest, result };
        entries.set(slot, receipt);
        pending.set(slot, receipt);
        bytes = nextBytes;
        pendingBytes = nextPending;
        misses++;
        result = undefined;
        return structuredClone(value);
      } finally {
        result?.fill(0);
        eraseVerified(value);
      }
    } finally {
      frame?.fill(0);
      eraseVerified(captured);
    }
  };
  const memo: ReceiptVerificationMemo = {
    clear() {
      revision++;
      for (const r of entries.values()) r.result.fill(0);
      entries.clear();
      pending.clear();
      bytes = 0;
      ownedBytes = 0;
      pendingBytes = 0;
      full = false;
    },
    retain() {
      /* A fixed-capture receipt journal retains its completed work until disposal. */
    },
    ownedBytes: () => ownedBytes,
    check,
    async checkReceipt<T>(
      addresses: readonly string[],
      context: string,
      input: readonly Uint8Array[],
      verify: () => Promise<T>,
      assert: () => void,
    ): Promise<T> {
      current();
      assert();
      return check(pageSlot(addresses), context, input, verify, assert);
    },
  };
  return Object.freeze({
    memo,
    import(proof: PreparationReceipts) {
      current();
      const p = proofs.get(proof);
      if (!p || p.context !== options.context) return invalid();
      if (started) throw Error('Preparation import after verification began');
      // Validate aggregate capacity before changing the private map. A saved slice that does
      // not fit is left out whole; what was already imported stays, and the rest runs uncached.
      const merged = new Map(entries);
      for (const r of p.entries) merged.set(r.slot, r);
      const count = [...merged.values()].reduce(
        (n, r) => n + r.result.length + r.slot.length + 64,
        0,
      );
      if (merged.size > PREPARATION_ENTRIES || count > PREPARATION_VALUE_BYTES) {
        full = true;
        return;
      }
      for (const r of p.entries) {
        entries.get(r.slot)?.result.fill(0);
        entries.set(r.slot, { ...r, result: r.result.slice() });
      }
      bytes = count;
      ownedBytes = [...entries.values()].reduce((n, r) => n + r.result.length, 0);
    },
    async delta(auth: Pick<BaselineAuthentication, 'sign'>) {
      current();
      const at = revision;
      const payload = encodePreparationValue(
        [...pending.values()].map((r) => [r.slot, r.digest, r.result]),
      );
      let message: Bytes | undefined,
        mac: Bytes | undefined,
        delivered = false;
      try {
        message = encodePreparationValue([DOMAIN, 'receipts', options.context, payload]);
        mac = await auth.sign(message);
        current();
        if (at !== revision) throw Error('Preparation journal changed');
        if (mac.length !== 32) invalid();
        delivered = true;
        return { payload, mac };
      } finally {
        message?.fill(0);
        if (!delivered) {
          payload.fill(0);
          mac?.fill(0);
        }
      }
    },
    get statistics() {
      return Object.freeze({ entries: entries.size, pending: pending.size, hits, misses, full });
    },
    dispose() {
      memo.clear();
      closed = true;
    },
  });
}
export type PreparationJournal = ReturnType<typeof createPreparationJournal>;
export const preparationDomain = (...parts: string[]) => fields(DOMAIN, ...parts);
