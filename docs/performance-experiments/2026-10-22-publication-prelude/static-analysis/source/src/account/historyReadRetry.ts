import type { Bytes } from '../crdt/custodyCrypto';
import type { DiagnosticSink } from '../../account-protocol/diagnostics';
import { INBOUND_BATCH_REQUEST_LIMIT } from '../../account-protocol/inboundBatch';
import {
  PRIVATE_DELIVERY_TIMEOUT_MS,
  recordPrivateTransportDiagnostic,
} from './privateDeliveryHttp';

const EXTRA_ATTEMPTS = 4;
const BACKOFF_MS = 200;
type Post = (body: Bytes, signal: AbortSignal, observe: DiagnosticSink) => Promise<Bytes | null>;

function pause(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, BACKOFF_MS);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

/** One transient snapshot load. Hints schedule bounded read work, never progress or authority. */
export function createHistoryReadRetry(signal: AbortSignal) {
  let remaining = EXTRA_ATTEMPTS,
    active = false;
  return async (body: Bytes, post: Post): Promise<Bytes | null> => {
    if (active) throw Error('Overlapping history read');
    if (!body.length || body.length > INBOUND_BATCH_REQUEST_LIMIT)
      throw Error('Invalid history read size');
    const captured = new Uint8Array(body),
      stopped = AbortSignal.any([signal, AbortSignal.timeout(PRIVATE_DELIVERY_TIMEOUT_MS)]);
    active = true;
    try {
      for (;;) {
        stopped.throwIfAborted();
        let changed = false;
        const outgoing = new Uint8Array(captured);
        let answer: Bytes | null;
        try {
          answer = await post(outgoing, stopped, (event) => {
            recordPrivateTransportDiagnostic(event);
            if (
              event.operation === 'read-v2' &&
              event.phase === 'response' &&
              event.code === 'state-changed'
            )
              changed = true;
          });
        } finally {
          outgoing.fill(0);
        }
        if (stopped.aborted) {
          answer?.fill(0);
          return null;
        }
        if (answer !== null || !changed || !remaining) return answer;
        remaining--;
        await pause(stopped);
      }
    } catch (cause) {
      if (stopped.aborted) return null;
      throw cause;
    } finally {
      captured.fill(0);
      active = false;
    }
  };
}
