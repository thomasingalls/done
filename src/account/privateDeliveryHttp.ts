import { isAccountAccess, accountServiceFetch, type AccountAccess } from './accountHttp';
import {
  NetworkAuthorityChanged,
  NetworkSignInRequired,
  NetworkThrottled,
} from './scopedTransport';
/** Private same-service HTTP adapter; no device keys or membership decisions. */
import type { AuthorityPin } from '../../account-protocol/authority';
import type { Bytes } from '../../account-protocol/positionDecision';
import {
  createDiagnostics,
  serviceHint,
  reportDiagnostic,
  type DiagnosticSink,
  type Diagnostic,
} from '../../account-protocol/diagnostics';
const diagnostics = createDiagnostics();
export const PRIVATE_DELIVERY_TIMEOUT_MS = 10000;
export const readPrivateTransportDiagnostics = diagnostics.read;
export const clearPrivateTransportDiagnostics = diagnostics.clear;
export const recordPrivateTransportDiagnostic = diagnostics.record;
/** Closed, count-bounded observation from the receive owner; never request bytes or authority. */
export const recordPrivateReceiveExpiry = (phase: 'verify' | 'commit'): void =>
  reportDiagnostic(diagnostics.record, { operation: 'read-v2', phase, code: 'expired' });
export async function privateDeliveryPost(
  pin: AuthorityPin,
  token: AccountAccess,
  path: 'submit' | 'read' | 'read-v2' | 'read-v2-batch',
  body: Bytes,
  limit: number,
  signal: AbortSignal,
  observe: DiagnosticSink = diagnostics.record,
  /** Retained connection coordinators own rebootstrap/sign-in/backoff; byte-only drivers retain null. */
  propagateAuthorization = false,
  unsupported?: () => Promise<Bytes | null>,
): Promise<Bytes | null> {
  const note = (phase: Diagnostic['phase'], code: Diagnostic['code']) =>
    reportDiagnostic(observe, {
      operation: path === 'read-v2-batch' ? 'read-v2' : path,
      phase,
      code,
    });
  if (!isAccountAccess(token)) {
    note('request', 'invalid-token');
    return null;
  }
  const stopped = AbortSignal.any([signal, AbortSignal.timeout(PRIVATE_DELIVERY_TIMEOUT_MS)]);
  const interrupted = () => (signal.aborted ? ('aborted' as const) : ('timeout' as const));
  try {
    stopped.throwIfAborted();
    const response = await accountServiceFetch(pin, token, '/account/delivery/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: stopped,
    });
    // Only an absent optional route selects the original transport. All other refusals keep
    // their normal classification; fallback grants no authority and never advances a cursor.
    if (path === 'read-v2-batch' && response.status === 404 && unsupported) {
      await response.body?.cancel();
      stopped.throwIfAborted();
      return await unsupported();
    }
    const hint =
      response.status === 409 && response.headers.get('content-type') === 'application/json';
    if (
      stopped.aborted ||
      (!hint &&
        (response.status !== 200 ||
          response.headers.get('content-type') !== 'application/octet-stream')) ||
      !response.body
    ) {
      await response.body?.cancel();
      note(
        'response',
        stopped.aborted
          ? interrupted()
          : response.status === 403
            ? 'http-denied'
            : 'response-invalid',
      );
      return null;
    }
    const responseLimit = hint ? 512 : limit;
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > responseLimit)) {
      await response.body.cancel();
      note('response', 'response-too-large');
      return null;
    }
    const reader = response.body.getReader(),
      chunks: Bytes[] = [];
    let length = 0;
    let cancellation: Promise<void> | undefined;
    const cancel = () => {
      cancellation ??= reader.cancel().catch(() => {});
    };
    stopped.addEventListener('abort', cancel, { once: true });
    try {
      for (;;) {
        stopped.throwIfAborted();
        const { done, value } = await reader.read();
        stopped.throwIfAborted();
        if (done) break;
        length += value.length;
        if (length > responseLimit) {
          cancel();
          note('stream', 'response-too-large');
          return null;
        }
        chunks.push(new Uint8Array(value));
      }
      if (declared !== null && Number(declared) !== length) {
        note('stream', 'response-invalid');
        return null;
      }
      const bytes = new Uint8Array(length);
      let at = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, at);
        at += chunk.length;
      }
      if (hint) {
        try {
          const reason = serviceHint(
            JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
          );
          note('response', reason ?? 'response-invalid');
        } catch {
          note('response', 'response-invalid');
        } finally {
          bytes.fill(0);
        }
        return null;
      }
      return bytes;
    } catch {
      cancel();
      note('stream', stopped.aborted ? interrupted() : 'response-invalid');
      return null;
    } finally {
      stopped.removeEventListener('abort', cancel);
      await cancellation;
      reader.releaseLock();
      for (const chunk of chunks) chunk.fill(0);
    }
  } catch (cause) {
    if (
      propagateAuthorization &&
      (cause instanceof NetworkAuthorityChanged ||
        cause instanceof NetworkSignInRequired ||
        cause instanceof NetworkThrottled)
    )
      throw cause;
    note('request', stopped.aborted ? interrupted() : 'network-unavailable');
    return null;
  }
}
