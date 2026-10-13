/** Private non-deleting carrier primitive; NOT an application installer or a full Account reader.
 * Caller must own the slot exclusively, authenticate the full census/candidate, and fence admission
 * and authority changes until native settlement. The explicit Account experiment supplies that fence; ordinary application builds refuse this carrier. */
import { concat, hex, type Bytes } from './custodyCrypto';
import { contentTransaction } from './contentDatabase';
import { equalStoredRecord, type DiskState } from './contentCompaction';
import {
  CONTENT_STORES,
  corrupt,
  counterPayload,
  equalCounter,
  parseCounter,
  parseStoredRecord,
  recordStore,
  reserveCounter,
  sameSpoolWitness,
  type ContentCounter,
  type ContentIdentity,
  type StoredRecord,
} from './contentRecord';
import {
  baselineAuthenticationPayload,
  decodeLocalBaseline,
  type BaselineAnchor,
} from './localBaselineRecord';
import {
  BASELINE_CARRIER,
  BASELINE_CHUNK_BYTES,
  baselineChunkKey,
  baselineChunkPrefix,
  baselineCounterPayload,
  parseBaselineCounter,
  type BaselineCounter,
  type BaselinePointer,
} from './localBaselineAnchor';
import { sameBytes, eraseVerified } from './verifiedRecords';
import type { AuthenticatedLocalBaseline } from './localBaselineReplay';
import type { ContentCrypto } from './contentStore';
import type { SessionTask } from './writeSession';

interface Owner {
  db: IDBDatabase;
  identity: ContentIdentity;
  generation: number;
  intent: string;
  crypt: Pick<ContentCrypto, 'open' | 'seal' | 'sign' | 'verify'>;
  /** Complete fresh authority check, not an old grant. */
  assertCurrent(): Promise<void>;
  /** Synchronous lifetime/activity/journal check under an already-held admission fence. */
  checkCommit(): void;
}
const hash = async (task: SessionTask, bytes: Bytes) =>
  hex(new Uint8Array(await task.wait(() => crypto.subtle.digest('SHA-256', bytes))));
const scopeEqual = (a: ContentIdentity, b: ContentIdentity) =>
  a.slotId === b.slotId &&
  a.principalId === b.principalId &&
  a.workspaceId === b.workspaceId &&
  a.storeId === b.storeId &&
  a.rootId === b.rootId;
async function authenticateCandidate(
  task: SessionTask,
  owner: Owner,
  baseline: AuthenticatedLocalBaseline,
  anchor: BaselineAnchor,
) {
  const parsed = task.step(() => decodeLocalBaseline(baseline.payload));
  try {
    if (
      !scopeEqual(parsed.identity, owner.identity) ||
      parsed.generation !== owner.generation ||
      parsed.cut.intent !== owner.intent ||
      parsed.revision !== anchor.revision ||
      anchor.hash !== (await hash(task, baseline.payload)) ||
      baseline.mac.length !== 32
    )
      return corrupt('Baseline scope or anchor differs.');
    const message = baselineAuthenticationPayload(baseline.payload);
    try {
      if (!(await task.wait(() => owner.crypt.verify(task, message, baseline.mac))))
        return corrupt('Baseline authentication failed.');
    } finally {
      message.fill(0);
    }
    return parsed;
  } catch (cause) {
    eraseVerified(parsed);
    throw cause;
  }
}
/** Compare every key and sealed byte in the same transaction as the transition.
 * This phase accepts no extra metadata, no old baseline, and no deletion of any kind. */
function exchange(
  task: SessionTask,
  owner: Owner,
  expected: DiskState,
  next: ContentCounter | BaselineCounter,
  chunks: readonly StoredRecord[] = [],
): Promise<void> {
  return task.wait(() =>
    contentTransaction<void>(
      owner.db,
      task,
      [...CONTENT_STORES],
      'readwrite',
      (tx, _result, guard) => {
        let remaining = CONTENT_STORES.length;
        const finish = () => {
          if (--remaining) return;
          owner.checkCommit();
          chunks.forEach((row, i) => tx.objectStore('meta').add(row, baselineChunkKey(i)));
          tx.objectStore('meta').put(next, 'counter');
        };
        for (const name of CONTENT_STORES) {
          const store = tx.objectStore(name),
            values = store.getAll(),
            keys = store.getAllKeys();
          keys.onsuccess = () =>
            guard(() => {
              if (keys.result.length !== values.result.length) return corrupt();
              if (name === 'meta') {
                if (keys.result.length !== 1 || keys.result[0] !== 'counter')
                  return corrupt('Baseline metadata changed.');
                const current = parseCounter(values.result[0], owner.identity, owner.intent);
                if (!expected.counter || !equalCounter(owner.identity, current, expected.counter))
                  return corrupt('Baseline counter changed.');
              } else {
                const retained = expected.rows
                  .filter((r) => r.store === name)
                  .sort((a, b) => Number(a.key) - Number(b.key));
                if (retained.length !== keys.result.length)
                  return corrupt('Baseline census changed.');
                retained.forEach((r, i) => {
                  if (
                    r.key !== keys.result[i] ||
                    !equalStoredRecord(
                      parseStoredRecord(r.value),
                      parseStoredRecord(values.result[i]),
                    )
                  )
                    return corrupt('Baseline census changed.');
                });
              }
              finish();
            });
        }
      },
      'strict',
    ),
  );
}

/** First anchor only. Success fences ordinary readers; complete history stays byte-for-byte intact.
 * Reservation failure writes nothing; later failure leaves burned reservations in ordinary v2.
 * After a lost success reply, inspect via readEncryptedBaseline; never blindly repeat this call. */
export async function anchorLocalBaseline(
  task: SessionTask,
  ownerInput: Owner,
  censusInput: DiskState,
  input: { baseline: AuthenticatedLocalBaseline; anchor: BaselineAnchor },
): Promise<BaselineAnchor> {
  const owner = { ...ownerInput, identity: { ...ownerInput.identity } };
  const census = task.step(() => structuredClone(censusInput));
  const baseline = task.step(() => ({
    payload: input.baseline.payload.slice(),
    mac: input.baseline.mac.slice(),
  }));
  const anchor = { ...input.anchor };
  let packed: Bytes | undefined;
  let decoded: ReturnType<typeof decodeLocalBaseline> | undefined;
  try {
    const counter = parseCounter(census.counter, owner.identity, owner.intent);
    if (counter.v !== 2 || counter.active_gen !== owner.generation)
      return corrupt('Account generation required.');
    if (
      !(await task.wait(() =>
        owner.crypt.verify(task, counterPayload(owner.identity, counter), counter.mac),
      ))
    )
      return corrupt('Counter authentication failed.');
    const b = (decoded = await authenticateCandidate(task, owner, baseline, anchor));
    if (
      b.revision !== 1 ||
      b.cut.nextSequence !== counter.next_seq ||
      !sameSpoolWitness(b.cut.witness, counter.spool) ||
      JSON.stringify(b.cut.reserved) !==
        JSON.stringify(
          Object.entries(counter.reserved)
            .map(([g, n]) => [Number(g), n])
            .sort((a, b) => a[0]! - b[0]!),
        )
    )
      return corrupt('Baseline is not the verified current cut.');
    // A detached authenticated census is required, including physical placement and exact cut.
    const seen = new Set<number>();
    let last = 0;
    for (const row of census.rows) {
      const r = parseStoredRecord(row.value);
      if (
        row.key !== r.seq ||
        row.store !== recordStore(r.kind) ||
        seen.has(r.seq) ||
        r.seq >= counter.next_seq ||
        r.gen > counter.active_gen ||
        !counter.reserved[String(r.gen)]
      )
        return corrupt();
      seen.add(r.seq);
      last = Math.max(last, r.seq);
    }
    if (last !== b.cut.sequence) return corrupt('Baseline census cut differs.');
    packed = concat(baseline.mac, baseline.payload);
    const p: BaselinePointer = {
      format: BASELINE_CARRIER,
      history: 'complete',
      revision: anchor.revision,
      commitment: hex(baseline.mac),
      generation: owner.generation,
      firstSequence: counter.next_seq,
      chunks: Math.ceil(packed.length / BASELINE_CHUNK_BYTES),
      bytes: packed.length,
    };
    let reserved = reserveCounter(counter, p.chunks, owner.generation);
    reserved = {
      ...reserved,
      mac: await task.wait(() => owner.crypt.sign(task, counterPayload(owner.identity, reserved))),
    };
    await task.wait(owner.assertCurrent);
    await exchange(task, owner, census, reserved);
    const chunks: StoredRecord[] = [];
    for (let i = 0; i < p.chunks; i++) {
      const plain = concat(
        baselineChunkPrefix(owner.identity, p, i),
        packed.subarray(i * BASELINE_CHUNK_BYTES, (i + 1) * BASELINE_CHUNK_BYTES),
      );
      try {
        const header = {
          v: 1 as const,
          gen: owner.generation,
          seq: p.firstSequence + i,
          kind: 'heads' as const,
        };
        const sealed = parseStoredRecord(
          await task.wait(() => owner.crypt.seal(task, header, plain)),
        );
        if (
          sealed.seq !== header.seq ||
          sealed.gen !== header.gen ||
          sealed.kind !== header.kind ||
          sealed.ct.length !== plain.length + 16
        )
          return corrupt('Baseline sealing returned another record.');
        chunks.push(sealed);
      } finally {
        plain.fill(0);
      }
    }
    let next = parseBaselineCounter(
      { ...reserved, v: 3, baseline: p },
      owner.identity,
      owner.intent,
    );
    next = {
      ...next,
      mac: await task.wait(() =>
        owner.crypt.sign(task, baselineCounterPayload(owner.identity, next)),
      ),
    };
    await task.wait(owner.assertCurrent);
    await exchange(task, owner, { ...census, counter: reserved }, next, chunks);
    return anchor;
  } finally {
    baseline.payload.fill(0);
    baseline.mac.fill(0);
    packed?.fill(0);
    eraseVerified(decoded);
  }
}

/** Reads the independent pointer and encrypted chunks from one native snapshot. This authenticates
 * the carrier only; callers still must replay its protocol/content evidence before using its state. */
export async function readEncryptedBaseline(
  task: SessionTask,
  ownerInput: Owner,
): Promise<{
  baseline: AuthenticatedLocalBaseline;
  anchor: BaselineAnchor;
  counter: BaselineCounter;
}> {
  const owner = { ...ownerInput, identity: { ...ownerInput.identity } };
  await task.wait(owner.assertCurrent);
  const snapshot = await task.wait(() =>
    contentTransaction<{ counter: BaselineCounter; chunks: StoredRecord[] }>(
      owner.db,
      task,
      ['meta'],
      'readonly',
      (tx, result, guard) => {
        const store = tx.objectStore('meta'),
          count = store.count(),
          request = store.get('counter');
        request.onsuccess = () =>
          guard(() => {
            const counter = parseBaselineCounter(request.result, owner.identity, owner.intent),
              p = counter.baseline;
            if (count.result !== p.chunks + 1)
              return corrupt('Baseline chunks missing or unknown.');
            const chunks: StoredRecord[] = [];
            result({ counter, chunks });
            for (let i = 0; i < p.chunks; i++) {
              const request = store.get(baselineChunkKey(i));
              request.onsuccess = () =>
                guard(() => {
                  const prefix = baselineChunkPrefix(owner.identity, p, i),
                    length = Math.min(BASELINE_CHUNK_BYTES, p.bytes - i * BASELINE_CHUNK_BYTES);
                  // Bound ciphertext before the closed parser makes its detached copy.
                  if (
                    !(request.result?.ct instanceof Uint8Array) ||
                    request.result.ct.length !== prefix.length + length + 16
                  )
                    return corrupt('Baseline chunk size differs.');
                  chunks[i] = parseStoredRecord(request.result);
                });
            }
          });
      },
    ),
  );
  const { counter, chunks } = snapshot,
    p = counter.baseline;
  if (
    counter.active_gen !== owner.generation ||
    p.generation !== owner.generation ||
    !(await task.wait(() =>
      owner.crypt.verify(task, baselineCounterPayload(owner.identity, counter), counter.mac),
    ))
  )
    return corrupt('Baseline counter authentication failed.');
  const packed = new Uint8Array(p.bytes);
  let baseline: AuthenticatedLocalBaseline | undefined,
    delivered = false;
  let decoded: ReturnType<typeof decodeLocalBaseline> | undefined;
  try {
    for (let i = 0; i < chunks.length; i++) {
      const row = chunks[i]!,
        prefix = baselineChunkPrefix(owner.identity, p, i),
        length = Math.min(BASELINE_CHUNK_BYTES, p.bytes - i * BASELINE_CHUNK_BYTES);
      if (
        row.seq !== p.firstSequence + i ||
        row.gen !== p.generation ||
        row.kind !== 'heads' ||
        row.ct.length !== prefix.length + length + 16
      )
        return corrupt('Baseline chunk allocation differs.');
      const plain = await task.wait(() => owner.crypt.open(task, row));
      try {
        if (
          plain.length !== prefix.length + length ||
          !sameBytes(plain.subarray(0, prefix.length), prefix)
        )
          return corrupt('Baseline chunk scope differs.');
        packed.set(plain.subarray(prefix.length), i * BASELINE_CHUNK_BYTES);
      } finally {
        plain.fill(0);
      }
    }
    baseline = { mac: packed.slice(0, 32), payload: packed.slice(32) };
    // The expected commitment comes from the separately authenticated counter, not this blob.
    // Its keyed MAC pins the exact plaintext without publishing an unkeyed dictionary oracle.
    if (hex(baseline.mac) !== p.commitment) return corrupt('Baseline commitment differs.');
    const anchor = { revision: p.revision, hash: await hash(task, baseline.payload) };
    const b = (decoded = await authenticateCandidate(task, owner, baseline, anchor));
    if (
      b.cut.nextSequence !== p.firstSequence ||
      b.cut.witness.events > counter.spool.events ||
      (b.cut.witness.events === counter.spool.events &&
        !sameSpoolWitness(b.cut.witness, counter.spool)) ||
      b.cut.reserved.some(
        ([g, n]) => (counter.reserved[String(g)] ?? -1) < n + (g === p.generation ? p.chunks : 0),
      )
    )
      return corrupt('Baseline allocation or witness regressed.');
    await task.wait(owner.assertCurrent);
    task.step(owner.checkCommit);
    delivered = true;
    return { baseline, anchor, counter };
  } finally {
    packed.fill(0);
    eraseVerified(decoded);
    if (!delivered) {
      baseline?.payload.fill(0);
      baseline?.mac.fill(0);
    }
  }
}
