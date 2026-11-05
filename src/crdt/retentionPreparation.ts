/** Exact-input, verifier-owned preparation receipts. No full ledger, cut, or commit authority. */
import {
  encodePreparationValue,
  decodePreparationValue,
  PREPARATION_VALUE_BYTES,
} from './preparationValue';
import { fields, hex, type Bytes } from './custodyCrypto';
import type { VerificationMemo } from './verificationMemo';
import type { BaselineAuthentication } from './localBaselineReplay';
import { eraseVerified, sameBytes } from './verifiedRecords';
import { PreparationCapacity } from './preparationCapacity';
export { PreparationCapacity } from './preparationCapacity';

const DOMAIN = 'done/local-preparation/draft-1';
export const PREPARATION_SLICE_MS = 2000;
export const PREPARATION_ENTRIES = 131072;
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

function validSlot(s: string) {
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
}) {
  if (!hashString(options.context)) invalid();
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
    misses = 0,
    hits = 0,
    revision = 0,
    started = false;
  const now = options.now ?? performance.now.bind(performance);
  const slice = options.sliceMs ?? PREPARATION_SLICE_MS;
  if (!Number.isFinite(slice) || slice <= 0) invalid();
  const memo: VerificationMemo = {
    clear() {
      revision++;
      for (const r of entries.values()) r.result.fill(0);
      entries.clear();
      pending.clear();
      bytes = 0;
    },
    retain() {
      /* A fixed-capture receipt journal retains its completed work until disposal. */
    },
    async check<T>(
      slot: string,
      context: string,
      input: readonly Uint8Array[],
      verify: () => Promise<T>,
      assert: () => void,
    ): Promise<T> {
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
          return decodePreparationValue(prior.result) as T;
        }
        const freshAt = now();
        began ??= freshAt;
        if (pending.size && freshAt - began >= slice) throw new PreparationPause();
        const value = await verify();
        let result: Bytes | undefined;
        try {
          unchanged();
          result = encodePreparationValue(value);
          validateResult(slot, result);
          const nextBytes =
            bytes -
            (prior ? prior.result.length + prior.slot.length + 64 : 0) +
            result.length +
            slot.length +
            64;
          if (
            (!prior && entries.size >= PREPARATION_ENTRIES) ||
            nextBytes > PREPARATION_VALUE_BYTES
          )
            throw new PreparationCapacity();
          prior?.result.fill(0);
          const receipt = { slot, digest, result };
          entries.set(slot, receipt);
          pending.set(slot, receipt);
          bytes = nextBytes;
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
    },
  };
  return Object.freeze({
    memo,
    import(proof: PreparationReceipts) {
      current();
      const p = proofs.get(proof);
      if (!p || p.context !== options.context) return invalid();
      if (started) throw Error('Preparation import after verification began');
      // Validate aggregate capacity before changing the private map.
      const merged = new Map(entries);
      for (const r of p.entries) merged.set(r.slot, r);
      const count = [...merged.values()].reduce(
        (n, r) => n + r.result.length + r.slot.length + 64,
        0,
      );
      if (merged.size > PREPARATION_ENTRIES || count > PREPARATION_VALUE_BYTES)
        throw new PreparationCapacity();
      for (const r of p.entries) {
        entries.get(r.slot)?.result.fill(0);
        entries.set(r.slot, { ...r, result: r.result.slice() });
      }
      bytes = count;
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
      return Object.freeze({ entries: entries.size, pending: pending.size, hits, misses });
    },
    dispose() {
      memo.clear();
      closed = true;
    },
  });
}
export type PreparationJournal = ReturnType<typeof createPreparationJournal>;
export const preparationDomain = (...parts: string[]) => fields(DOMAIN, ...parts);
