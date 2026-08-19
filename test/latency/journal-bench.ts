/**
 * The in-page half of the journal-write benchmark (TRD §12, §15 row 2).
 *
 * **Why this is a separate module from `recorder.ts`.** The recorder watches the
 * application. This measures a construction the application does not contain
 * yet: Stage 1 builds the encrypted journal, and the budget that gates it has to
 * be measured before it is built or the number arrives too late to influence
 * anything. So the code here is the *specification's* composition, bundled into
 * the page rather than imported from `src/`.
 *
 * **Which is exactly why it verifies itself first.** A benchmark of a
 * construction that is not the selected one measures nothing, and the drift
 * would be silent — the numbers would still look like numbers. `verify()`
 * reproduces a published vector from `test/vectors/journal-aead.json` byte for
 * byte, and the spec refuses to measure until it does.
 *
 * **Four levels, because the interesting quantity is a difference.** The budget
 * names the AEAD, but what the journal actually costs per keystroke is the seal
 * *plus* framing, base64 and a synchronous `localStorage.setItem`. Measuring the
 * plaintext write that exists today alongside the encrypted one that will
 * replace it is the only way to say what encryption adds, as opposed to what the
 * whole path costs — and those are different questions with different answers.
 */

import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { toBase64 } from 'lib0/buffer';

/** The framing selected in row 2: `"2:" || base64(u32be(gen) || nonce[24] || ct || tag[16])`. */
const RECORD_VERSION = '2:';
/** What the plaintext journal writes today (`src/crdt/persistence.ts`). */
const PLAINTEXT_VERSION = '1:';
const AAD_LABEL = 'done/jrnl/v1';

export type Level = 'plaintext' | 'seal' | 'framed' | 'stored';

/**
 * The measurement's shape, exported so every runner uses one definition.
 *
 * The harness already argues that a baseline is only worth having if the run
 * compared against it did the same thing. That applies twice as hard here,
 * because the whole purpose of the device run is to be compared against the
 * desktop one — two copies of these constants would be two experiments.
 */
export const SIZES: readonly { bytes: number; why: string }[] = [
  { bytes: 18, why: 'one keystroke — the measured common case for this path' },
  { bytes: 419, why: 'a 400-character paste' },
  { bytes: 4096, why: 'a large single update' },
];

export const LEVELS: readonly { level: Level; label: string }[] = [
  { level: 'plaintext', label: 'plaintext write (today)' },
  { level: 'seal', label: 'seal only' },
  { level: 'framed', label: 'seal + base64' },
  { level: 'stored', label: 'seal + base64 + setItem' },
];

/**
 * Batches, how long each should last, and how many single writes to time.
 *
 * The batch is sized from a duration rather than a count: a fixed count
 * quantizes to whatever the clock allows, and on a 100 µs clock that made two
 * adjacent levels report the same number. The singles are what the tail comes
 * from, and the tail is the statistic the budget in TRD §12 actually names.
 */
export const RUN_DEFAULTS = { batches: 30, targetBatchMs: 20, singles: 4000 } as const;

/** The budget under test (TRD §12), in milliseconds. */
export const BUDGET_MS = 1;

export interface RunOptions {
  /** Plaintext size in bytes. Row 2 measured 18, 419 and 4096. */
  bytes: number;
  /** How many timed blocks. Percentiles are taken over these. */
  batches: number;
  /**
   * How long one timed block should last, in milliseconds.
   *
   * The batch size is derived from this rather than fixed, because the whole
   * point of batching is to put a block far enough above the clock's
   * granularity that quantization stops mattering — and how many operations
   * that takes depends on the level, the payload and the machine. An earlier
   * version fixed the count at 100, which quantized every result on this clock
   * to a whole microsecond and made two adjacent levels report the same number.
   */
  targetBatchMs: number;
  /** Individually-timed operations, which is where the tail comes from. */
  singles: number;
}

export interface RunResult {
  level: Level;
  bytes: number;
  /** Per-operation milliseconds, one entry per batch. */
  perOperation: number[];
  /** Derived from `targetBatchMs`, and reported so a run can be reproduced. */
  perBatch: number;
  /**
   * Individually-timed operations, in milliseconds.
   *
   * Meaningful only when the clock is fine enough to resolve one operation —
   * with cross-origin isolation Chrome reports 5 µs, without it 100 µs, and a
   * 13 µs operation is invisible at the latter. The spec decides what to do
   * with these by looking at `resolutionMs`; the page just reports them.
   */
  singles: number[];
  /** The observed clock granularity, so the numbers above have a unit. */
  resolutionMs: number;
  /** Whether the page got the fine clock. */
  isolated: boolean;
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

/** Length-prefixed field: uint16be(byteLength) || utf8, as row 2 specifies. */
const lp = (s: string): Uint8Array => {
  const bytes = utf8(s);
  return concat(new Uint8Array([bytes.length >> 8, bytes.length & 0xff]), bytes);
};

const u32be = (n: number): Uint8Array =>
  new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);

const aadFor = (workspaceId: string, gen: number, journalKey: string): Uint8Array =>
  concat(lp(AAD_LABEL), lp(workspaceId), lp(String(gen)), lp(journalKey));

const unhex = (s: string): Uint8Array =>
  Uint8Array.from(s.match(/.{2}/gu) ?? [], (byte) => Number.parseInt(byte, 16));

/**
 * The measured unit: one journal record, sealed and framed as row 2 specifies.
 *
 * Deliberately allocates its own nonce from `crypto.getRandomValues` on every
 * call, because production does and the cost belongs to the operation.
 */
const sealRecord = (
  key: Uint8Array,
  aad: Uint8Array,
  plaintext: Uint8Array,
  gen: number,
): Uint8Array => {
  const nonce = crypto.getRandomValues(new Uint8Array(24));
  return concat(u32be(gen), nonce, xchacha20poly1305(key, nonce, aad).encrypt(plaintext));
};

/**
 * The smallest interval this clock will report, measured rather than assumed.
 *
 * Spinning until the value changes is the only portable way to see it: the clamp
 * is a browser policy that varies with cross-origin isolation and with the
 * browser, and hard-coding 100 µs would make the bound above a claim about
 * Chrome's documentation instead of about the machine the run happened on.
 */
export interface Measured {
  /** Per-operation milliseconds, one entry per batch. */
  perOperation: number[];
  /** Derived from `targetBatchMs`, and reported so a run can be reproduced. */
  perBatch: number;
  /** Individually-timed operations, which is where a tail can come from. */
  singles: number[];
  /** The observed clock granularity, so the numbers above have a unit. */
  resolutionMs: number;
  /** Whether the page got the fine clock. */
  isolated: boolean;
}

/**
 * Time one operation, however it is composed.
 *
 * **Exported because a second benchmark exists and must not measure
 * differently.** The cipher comparison asks a different question from the
 * journal levels, but an answer produced by a different batching rule or a
 * different warm-up is not comparable to this file's numbers, and the whole
 * point of comparing implementations is that the comparison is fair.
 */
export const measure = (
  operation: () => void,
  { batches, targetBatchMs, singles }: Omit<RunOptions, 'bytes'>,
): Measured => {
  const resolutionMs = clockResolution();

  // Warm up before anything is timed, so the first batch is not measuring JIT
  // compilation, and so the probe below sizes against warm code.
  for (let index = 0; index < 200; index += 1) operation();

  /**
   * Size a batch from a probe rather than a constant.
   *
   * The probe is run long enough to cross several ticks so its own answer is
   * not quantized into uselessness, which is the mistake it exists to avoid
   * one level down.
   */
  const probeCount = 200;
  const probeStart = performance.now();
  for (let index = 0; index < probeCount; index += 1) operation();
  const probeMs = Math.max(performance.now() - probeStart, resolutionMs);
  const perBatch = Math.max(50, Math.ceil((targetBatchMs * probeCount) / probeMs));

  const perOperation: number[] = [];
  for (let batch = 0; batch < batches; batch += 1) {
    const start = performance.now();
    for (let index = 0; index < perBatch; index += 1) operation();
    perOperation.push((performance.now() - start) / perBatch);
  }

  // The individually-timed pass, which is the only one that can see a tail. A
  // batch mean averages an outlier away by construction, and the budget this
  // feeds is written as a p95 of one write rather than as a mean.
  const singleTimes: number[] = [];
  for (let index = 0; index < singles; index += 1) {
    const start = performance.now();
    operation();
    singleTimes.push(performance.now() - start);
  }

  return {
    perOperation,
    perBatch,
    singles: singleTimes,
    resolutionMs,
    isolated: globalThis.crossOriginIsolated,
  };
};

const clockResolution = (): number => {
  let smallest = Number.POSITIVE_INFINITY;
  for (let probe = 0; probe < 20; probe += 1) {
    const start = performance.now();
    let now = start;
    while (now === start) now = performance.now();
    smallest = Math.min(smallest, now - start);
  }
  return smallest;
};

export interface Bench {
  verify: (vector: {
    k_journal: string;
    workspace_id: string;
    gen: number;
    journal_storage_key: string;
    nonce: string;
    plaintext: string;
    record: string;
  }) => { ok: boolean; got: string };
  run: (level: Level, options: RunOptions) => RunResult;
}

declare global {
  interface Window {
    journalBench: Bench;
  }
}

export const bench = (): Bench => {
  const workspace = 'ws_01HZXQ7M4K9P2R6T8V0Y3B5N7D';
  const journalKey = 'done.pending-update.done.7';
  const gen = 1;
  const key = crypto.getRandomValues(new Uint8Array(32));
  const aad = aadFor(workspace, gen, journalKey);

  /**
   * Reproduce a published vector with its own fixed nonce and key.
   *
   * Separate from the measured path because the measured path generates a nonce
   * per call — which is the behaviour under test and the reason a vector cannot
   * be produced by it.
   */
  const verify: Bench['verify'] = (vector) => {
    const vectorAad = aadFor(vector.workspace_id, vector.gen, vector.journal_storage_key);
    const nonce = unhex(vector.nonce);
    const sealed = xchacha20poly1305(unhex(vector.k_journal), nonce, vectorAad).encrypt(
      unhex(vector.plaintext),
    );
    const got = RECORD_VERSION + toBase64(concat(u32be(vector.gen), nonce, sealed));
    return { ok: got === vector.record, got };
  };

  const operation = (level: Level, payload: Uint8Array, slot: string): void => {
    if (level === 'plaintext') {
      localStorage.setItem(slot, PLAINTEXT_VERSION + toBase64(payload));
      return;
    }
    const sealed = sealRecord(key, aad, payload, gen);
    if (level === 'seal') return;
    const framed = RECORD_VERSION + toBase64(sealed);
    if (level === 'framed') return;
    localStorage.setItem(slot, framed);
  };

  const run: Bench['run'] = (level, { bytes, ...options }) => {
    const payload = crypto.getRandomValues(new Uint8Array(bytes));
    const slot = 'done.pending-update.bench';
    const measured = measure(() => operation(level, payload, slot), options);
    localStorage.removeItem(slot);
    return { level, bytes, ...measured };
  };

  return { verify, run };
};
