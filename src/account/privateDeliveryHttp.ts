import { isAccountAccess, accountServiceFetch, type AccountAccess } from './accountHttp';
import {
  GrantDenied,
  NetworkAuthorityChanged,
  NetworkLoginUnavailable,
  NetworkSignInRequired,
  NetworkThrottled,
} from './scopedTransport';
import type { DeliveryRefusal } from './syncRefusal';
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
/** Why a request that threw got no result (phase 552). A passkey request is already shown by the
 * sign-in gate, so it is left unexplained here. */
export function deliveryFailure(cause: unknown): DeliveryRefusal | undefined {
  if (cause instanceof NetworkSignInRequired) return undefined;
  if (cause instanceof NetworkThrottled) return 'capacity';
  if (cause instanceof NetworkAuthorityChanged) return 'authority-changed';
  if (cause instanceof NetworkLoginUnavailable)
    switch (cause.problem) {
      case 'unreachable':
        return 'unreachable';
      case 'busy':
        return 'capacity';
      case 'unavailable':
        return 'storage-unavailable';
      case 'outdated':
        return 'invalid-request';
      case 'refused':
        return 'refused';
      default:
        return 'login-disconnected';
    }
  if (cause instanceof GrantDenied)
    switch (cause.reason) {
      case 'capacity':
        return 'capacity';
      case 'storage-unavailable':
        return 'storage-unavailable';
      case 'malformed':
        return 'invalid-request';
      case 'wrong-account':
      case 'insufficient-scope':
      case 'invalid-proof':
      case 'grant-required':
      case 'access-required':
        return 'access-refused';
      default:
        return 'refused';
    }
  if (cause instanceof Error && cause.name === 'TimeoutError') return 'timeout';
  return 'unreachable';
}
/** The service's hint envelope, `{ v: 1, kind: 'unknown', reason }`, with a reason this version
 * does not know or a malformed one, is still the service answering. Anything else is no answer. */
const hintEnvelope = (input: unknown) =>
  !!input &&
  typeof input === 'object' &&
  Object.getPrototypeOf(input) === Object.prototype &&
  Object.keys(input).sort().join() === 'kind,reason,v' &&
  (input as { v: unknown }).v === 1 &&
  (input as { kind: unknown }).kind === 'unknown';
async function malformedRefusal(response: Response, signal: AbortSignal) {
  if (
    ![400, 403, 413].includes(response.status) ||
    response.headers.get('content-type')?.split(';')[0] !== 'application/json' ||
    !response.body
  )
    return false;
  const reader = response.body.getReader();
  let text = '';
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length > 512) return false;
    }
    const body = JSON.parse(text + decoder.decode()) as unknown;
    return (
      !!body &&
      typeof body === 'object' &&
      Object.keys(body).sort().join() === 'ok,refusal' &&
      (body as { ok: unknown }).ok === false &&
      (body as { refusal: unknown }).refusal === 'malformed'
    );
  } catch {
    return false;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
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
  /** Optional aggregation can retry individual reads only after a successful binary reply
   * exceeds its byte reservation. Error hints and malformed declarations never select this. */
  aggregateLimit?: () => void,
  /** Phase 552: why this request got no result, for the sync notice only. Never changes what is
   * returned, recorded or retried. */
  explain?: (refusal: DeliveryRefusal) => void,
): Promise<Bytes | null> {
  const note = (phase: Diagnostic['phase'], code: Diagnostic['code']) =>
    reportDiagnostic(observe, {
      operation: path === 'read-v2-batch' ? 'read-v2' : path,
      phase,
      code,
    });
  const why = (refusal: DeliveryRefusal | undefined) => {
    try {
      if (refusal) explain?.(refusal);
    } catch {
      /* Observation cannot alter the transport. */
    }
  };
  if (!isAccountAccess(token)) {
    note('request', 'invalid-token');
    return null;
  }
  const stopped = AbortSignal.any([signal, AbortSignal.timeout(PRIVATE_DELIVERY_TIMEOUT_MS)]);
  const interrupted = () => (signal.aborted ? ('aborted' as const) : ('timeout' as const));
  // Stopped by the caller: nothing to say, the lane is closing or the request was abandoned.
  const stop = () => (signal.aborted ? undefined : ('timeout' as const));
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
      why(
        stopped.aborted
          ? stop()
          : explain && (await malformedRefusal(response, stopped))
            ? 'invalid-request'
            : 'unreachable',
      );
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
      why(hint ? 'unreachable' : 'unusable');
      note('response', 'response-too-large');
      if (path === 'read-v2-batch' && !hint && /^\d+$/.test(declared)) aggregateLimit?.();
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
          why(hint ? 'unreachable' : 'unusable');
          note('stream', 'response-too-large');
          if (path === 'read-v2-batch' && !hint) aggregateLimit?.();
          return null;
        }
        chunks.push(new Uint8Array(value));
      }
      if (declared !== null && Number(declared) !== length) {
        why('unreachable');
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
          const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
          const reason = serviceHint(parsed);
          why(reason ?? (hintEnvelope(parsed) ? 'refused' : 'unreachable'));
          note('response', reason ?? 'response-invalid');
        } catch {
          why('unreachable');
          note('response', 'response-invalid');
        } finally {
          bytes.fill(0);
        }
        return null;
      }
      return bytes;
    } catch {
      cancel();
      why(stopped.aborted ? stop() : 'unreachable');
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
    why(stopped.aborted ? stop() : deliveryFailure(cause));
    note('request', stopped.aborted ? interrupted() : 'network-unavailable');
    return null;
  }
}
