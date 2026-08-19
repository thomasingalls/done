/**
 * Which XChaCha20-Poly1305 implementation, measured (TRD §12, §15 rows 1–2).
 *
 * **The question this exists to split.** The journal write exceeds its budget at
 * 4 kB on a Pixel 9a, and the cipher is why: against a desktop the phone runs it
 * 43× slower at that payload while paths reaching native code run only 5×
 * slower. That is consistent with two quite different causes — **pure-JS 32-bit
 * arithmetic being inherently slow on this hardware**, or **V8 on ARM handling
 * one library's particular code shape badly.** The fixes differ enormously: the
 * first needs a WASM dependency against 43.7 kB of bundle headroom, the second
 * needs a different import.
 *
 * So a second pure-JS implementation is the cheap discriminator, and a WASM one
 * is the ceiling — what is the most any change of implementation could buy?
 *
 * **Every candidate must reproduce the published vector before it is measured.**
 * All four are the same construction on the wire, so a swap would be an
 * implementation change with no format consequence — but that is a claim, and
 * `test/vectors/journal-aead.json` is what turns it into a check. A faster
 * cipher that computes something else is worthless, and it would still produce
 * a number.
 *
 * **It measures through the same `measure()` the journal benchmark uses**, so
 * the two sets of figures are comparable rather than merely adjacent.
 */

import { chacha20poly1305, xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { XChaCha20Poly1305 } from '@stablelib/xchacha20poly1305';
import sodium from 'libsodium-wrappers';
import { RUN_DEFAULTS, measure, type Measured } from './journal-bench';

/**
 * When this module finished evaluating.
 *
 * The WASM candidate's real cost is not how long `sodium.ready` takes to await —
 * by then it has usually resolved concurrently with something else, and an
 * earlier version of this file duly reported 0.0 ms, which is true and useless.
 * The question is **how long after the bundle evaluates the cipher becomes
 * callable**, because that is the window in which a crash journal cannot seal.
 * Measured from here, so a concurrent resolution is still counted.
 */
const moduleEvaluated = performance.now();

export type Kind = 'js' | 'wasm';

export interface Candidate {
  name: string;
  kind: Kind;
  /** Why it is in the comparison at all. */
  why: string;
  /**
   * Whether it can be checked against row 2's vector.
   *
   * The 12-byte-nonce reference cannot: it is a different construction, and
   * saying so is the point of the field. It is present to price XChaCha's extra
   * HChaCha20 step, not as a candidate to adopt — row 2 selected the 24-byte
   * nonce on grounds a speed measurement does not touch.
   */
  comparable: boolean;
  /**
   * Resolves when the implementation can be called, returning how many
   * milliseconds after this module evaluated that became true. Zero for the JS
   * candidates, which are callable the instant the bundle has run.
   */
  ready: () => Promise<number>;
  seal: (key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, plaintext: Uint8Array) => Uint8Array;
}

export const CANDIDATES: readonly Candidate[] = [
  {
    name: '@noble/ciphers',
    kind: 'js',
    why: 'What row 2 selected, and the baseline every other row here is against.',
    comparable: true,
    ready: () => Promise.resolve(0),
    seal: (key, nonce, aad, plaintext) => xchacha20poly1305(key, nonce, aad).encrypt(plaintext),
  },
  {
    name: '@stablelib/xchacha20poly1305',
    kind: 'js',
    why: 'The discriminator. A second pure-JS implementation: if it is much faster, the problem is a code shape rather than the language.',
    comparable: true,
    ready: () => Promise.resolve(0),
    seal: (key, nonce, aad, plaintext) => new XChaCha20Poly1305(key).seal(nonce, plaintext, aad),
  },
  {
    name: 'libsodium (WASM)',
    kind: 'wasm',
    why: 'The ceiling. Far too large to ship at 550 kB unpacked against 43.7 kB of headroom, but it answers what any WASM cipher could buy before anyone builds a small one.',
    comparable: true,
    ready: async () => {
      await sodium.ready;
      return performance.now() - moduleEvaluated;
    },
    seal: (key, nonce, aad, plaintext) =>
      sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, aad, null, nonce, key),
  },
  {
    name: '@noble ChaCha20-Poly1305 (12-byte nonce)',
    kind: 'js',
    why: 'A reference, not a candidate. Prices the HChaCha20 step XChaCha adds, which is one block and so should matter at 18 B and vanish at 4 kB.',
    comparable: false,
    ready: () => Promise.resolve(0),
    seal: (key, nonce, aad, plaintext) =>
      chacha20poly1305(key, nonce.subarray(0, 12), aad).encrypt(plaintext),
  },
];

export interface CipherResult extends Measured {
  name: string;
  kind: Kind;
  bytes: number;
}

export interface Vector {
  k_journal: string;
  nonce: string;
  aad: string;
  plaintext: string;
}

const unhex = (s: string): Uint8Array =>
  Uint8Array.from(s.match(/.{2}/gu) ?? [], (byte) => Number.parseInt(byte, 16));

const hex = (u: Uint8Array): string =>
  [...u].map((byte) => byte.toString(16).padStart(2, '0')).join('');

export interface Agreement {
  name: string;
  comparable: boolean;
  agrees: boolean;
  got: string;
}

/**
 * Check every comparable candidate against the published vector.
 *
 * The expected value comes from the vector file rather than from the first
 * implementation, so this cannot degenerate into the candidates agreeing with
 * each other about something wrong.
 */
export const agree = (vector: Vector, expectedCiphertext: string): Agreement[] =>
  CANDIDATES.map((candidate) => {
    if (!candidate.comparable)
      return { name: candidate.name, comparable: false, agrees: false, got: '' };
    const got = hex(
      candidate.seal(
        unhex(vector.k_journal),
        unhex(vector.nonce),
        unhex(vector.aad),
        unhex(vector.plaintext),
      ),
    );
    return { name: candidate.name, comparable: true, agrees: got === expectedCiphertext, got };
  });

/** Benchmark one candidate at one payload size, through the shared harness. */
export const runCandidate = (candidate: Candidate, bytes: number): CipherResult => {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const aad = crypto.getRandomValues(new Uint8Array(64));
  const payload = crypto.getRandomValues(new Uint8Array(bytes));
  const measured = measure(() => {
    // A fresh nonce per call, because production generates one and the cost
    // belongs to the operation rather than to the setup.
    const nonce = crypto.getRandomValues(new Uint8Array(24));
    candidate.seal(key, nonce, aad, payload);
  }, RUN_DEFAULTS);
  return { name: candidate.name, kind: candidate.kind, bytes, ...measured };
};
