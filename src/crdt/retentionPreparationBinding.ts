/** Fresh native-prefix and owner context binding. Digests never leave encrypted preparation data. */
import * as encoding from 'lib0/encoding';
import { baselineScope, baselineAuthorityState } from './localBaselineAuthority';
import {
  captureLocalBaselineContext,
  clearLocalBaselineContext,
  type LocalBaselineContext,
  type BaselineAuthentication,
} from './localBaselineReplay';
import type { RetentionInventory } from './localRetentionPlan';
import { parseStoredRecord, recordStore, type ContentCounter } from './contentRecord';
import { encodePreparationValue } from './preparationValue';
import { preparationDomain, PreparationCapacity } from './retentionPreparation';
import { hex, type Bytes } from './custodyCrypto';

const hash = async (b: Bytes) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', b)));
export interface PreparationPrefix {
  through: number;
  records: number;
  digest: string;
  generation: number;
  intent: string;
  reserved: [number, number][];
  events: number;
  witness: string;
}
export async function preparationContext(
  context: LocalBaselineContext,
  implementation: string,
  intent: string,
  auth: Pick<BaselineAuthentication, 'sign'>,
): Promise<string> {
  const captured = captureLocalBaselineContext(context);
  try {
    if (!/^[0-9a-f]{64}$/.test(implementation))
      throw Error('Preparation verifier identity required');
    const b = captured.inbound,
      route = captured.route;
    const frame = encodePreparationValue([
      preparationDomain('context'),
      implementation,
      intent,
      await baselineScope(captured),
      await baselineAuthorityState(captured),
      captured.identity,
      [route.workspace, route.credential, route.principal, route.epoch, route.generation],
      captured.installation,
      b.authority,
      b.prefix,
      b.baseline,
      b.baselineHeads ?? [],
      b.reader,
      b.publisher,
      b.service,
      b.creatingCredential,
      [...new Map([...(b.retainedGenerationKeys ?? []), [b.generation, b.generationKey]])].sort(
        ([a], [z]) => a - z,
      ),
    ]);
    let mac: Bytes | undefined;
    try {
      mac = await auth.sign(frame);
      captured.assertCurrent();
      if (mac.length !== 32) throw Error('Preparation context MAC');
      return hex(mac);
    } finally {
      frame.fill(0);
      mac?.fill(0);
    }
  } finally {
    clearLocalBaselineContext(captured);
  }
}
export async function capturePreparationPrefix(
  inventory: RetentionInventory,
  counter: ContentCounter,
  through = counter.next_seq,
): Promise<PreparationPrefix> {
  if (
    counter.v !== 2 ||
    !Number.isSafeInteger(through) ||
    through < 1 ||
    through > counter.next_seq
  )
    throw Error('Invalid preparation capture');
  const out = encoding.createEncoder(),
    seen = new Set<number>();
  let bytes = 0,
    records = 0;
  try {
    const rows = inventory.rows
      .slice()
      .sort(
        (a, b) => String(a.store).localeCompare(String(b.store)) || Number(a.key) - Number(b.key),
      );
    encoding.writeVarUint(out, 1);
    encoding.writeVarUint(out, through);
    for (const row of rows) {
      const r = parseStoredRecord(row.value);
      if (
        row.key !== r.seq ||
        row.store !== recordStore(r.kind) ||
        seen.has(r.seq) ||
        r.seq >= counter.next_seq ||
        r.gen > counter.active_gen ||
        !counter.reserved[String(r.gen)]
      )
        throw Error('Invalid preparation physical prefix');
      seen.add(r.seq);
      if (r.seq >= through) continue;
      bytes += r.ct.length + r.nonce.length + 128;
      if (bytes > 64 * 1024 * 1024)
        throw new PreparationCapacity({
          cause: 'resume-history',
          needed: bytes,
          allowed: 64 * 1024 * 1024,
        });
      records++;
      encoding.writeVarString(out, row.store);
      encoding.writeVarUint(out, r.seq);
      encoding.writeVarUint(out, r.gen);
      encoding.writeVarString(out, r.kind);
      encoding.writeVarUint8Array(out, r.nonce);
      encoding.writeVarUint8Array(out, r.ct);
    }
    encoding.writeVarString(out, 'metadata');
    const raw = inventory.metadata.find((m) => m.key === 'counter')?.value as
      | { v?: unknown; baseline?: unknown }
      | undefined;
    const metadata = inventory.metadata
      .filter((m) => m.key !== 'counter')
      .slice()
      .sort((a, b) => JSON.stringify(a.key).localeCompare(JSON.stringify(b.key)));
    const pointer = encodePreparationValue([
      raw?.v,
      raw?.baseline ?? null,
      metadata.map((m) => [m.key, m.value]),
    ]);
    try {
      encoding.writeVarUint8Array(out, pointer);
    } finally {
      pointer.fill(0);
    }
    const packed = new Uint8Array(encoding.toUint8Array(out));
    let digest: string;
    try {
      digest = await hash(packed);
    } finally {
      packed.fill(0);
    }
    return {
      through,
      records,
      digest,
      generation: counter.active_gen,
      intent: counter.intent,
      reserved: Object.entries(counter.reserved)
        .map(([g, n]) => [Number(g), n] as [number, number])
        .sort(([a], [b]) => a - b),
      events: counter.spool.events,
      witness: counter.spool.hash,
    };
  } finally {
    out.cbuf.fill(0);
    for (const b of out.bufs) b.fill(0);
  }
}
export async function matchesPreparationPrefix(
  prior: PreparationPrefix,
  inventory: RetentionInventory,
  counter: ContentCounter,
) {
  if (
    counter.v !== 2 ||
    prior.generation !== counter.active_gen ||
    prior.intent !== counter.intent ||
    prior.through > counter.next_seq ||
    prior.events > counter.spool.events ||
    (prior.events === counter.spool.events && prior.witness !== counter.spool.hash) ||
    prior.reserved.some(([g, n]) => (counter.reserved[String(g)] ?? -1) < n)
  )
    return false;
  const current = await capturePreparationPrefix(inventory, counter, prior.through);
  return prior.records === current.records && prior.digest === current.digest;
}
export function parsePreparationPrefix(value: unknown): PreparationPrefix {
  const p = value as PreparationPrefix;
  if (
    !p ||
    typeof p !== 'object' ||
    Object.keys(p).sort().join() !==
      'digest,events,generation,intent,records,reserved,through,witness' ||
    !Number.isSafeInteger(p.through) ||
    p.through < 1 ||
    !Number.isSafeInteger(p.records) ||
    p.records < 0 ||
    !/^[0-9a-f]{64}$/.test(p.digest) ||
    !Number.isSafeInteger(p.generation) ||
    p.generation < 1 ||
    !/^[-a-zA-Z0-9]{1,128}$/.test(p.intent) ||
    !Number.isSafeInteger(p.events) ||
    p.events < 0 ||
    !/^[0-9a-f]{64}$/.test(p.witness) ||
    !Array.isArray(p.reserved) ||
    p.reserved.length > 128
  )
    throw Error('Invalid preparation prefix');
  let sum = 0,
    previous = 0;
  for (const pair of p.reserved) {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      !Number.isSafeInteger(pair[0]) ||
      pair[0] <= previous ||
      pair[0] > p.generation ||
      !Number.isSafeInteger(pair[1]) ||
      pair[1] < 0
    )
      throw Error('Invalid preparation allocations');
    previous = pair[0];
    sum += pair[1];
  }
  if (previous !== p.generation || !Number.isSafeInteger(sum) || sum !== p.through - 1)
    throw Error('Invalid preparation allocation sum');
  return structuredClone(p);
}
