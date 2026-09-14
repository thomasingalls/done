/**
 * Boot-path timing marks (TRD §12).
 *
 * These exist so that the cost of Stage 1's encrypted store is *attributable*
 * rather than merely visible. The same three marks bracket a plaintext
 * IndexedDB read today and a key-store read, an unseal and per-record
 * decryption afterwards, so a number that moves between those two runs has one
 * place to have moved. Without them a cold-start regression is a single figure
 * with nothing to say about which of the three new things caused it.
 *
 * **Only the marks with no DOM signal live here.** A painted compose field, a
 * mounted card editor and a day that has changed are all observable from
 * outside the app, and `test/latency` measures them without costing the initial
 * bundle anything — which matters, because that bundle is the one budget with
 * teeth (`scripts/check-budget.mjs`). Content-root load is the row that cannot
 * be seen from the DOM, and it is also the row Stage 1 changes most.
 *
 * Guarded because User Timing is not universal and a timer that is only
 * supposed to be watching a boot must never be able to break one.
 */

/** The entry module body began: everything it imports has been fetched, parsed and initialised. */
export const BOOT = 'done:boot';

/** `openStore` was entered. */
export const STORE_OPEN = 'done:store-open';

/** The on-disk content root has been read back into the document (TRD §4.2). */
export const CONTENT_ROOT = 'done:content-root';

/** `openStore` resolved: the document is ready for the shell to render. */
export const STORE_READY = 'done:store-ready';

/** Factor-unlocked admission: carrier read/decryption and Yjs replay, excluding factor entry. */
export const ADMISSION_LOAD_START = 'done:admission-load-start';
export const ADMISSION_LOAD_READY = 'done:admission-load-ready';

export const mark = (name: string): void => {
  try {
    performance.mark(name);
  } catch {
    // A measurement is never worth an exception on the path it is measuring.
  }
};
