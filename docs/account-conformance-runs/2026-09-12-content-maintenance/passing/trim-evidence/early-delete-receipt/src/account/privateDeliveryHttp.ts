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
export const readPrivateTransportDiagnostics = diagnostics.read;
export const clearPrivateTransportDiagnostics = diagnostics.clear;
export async function privateDeliveryPost(
  pin: AuthorityPin,
  token: string,
  path: 'submit' | 'read' | 'read-v2',
  body: Bytes,
  limit: number,
  signal: AbortSignal,
  observe: DiagnosticSink = diagnostics.record,
): Promise<Bytes | null> {
  const note = (phase: Diagnostic['phase'], code: Diagnostic['code']) =>
    reportDiagnostic(observe, { operation: path, phase, code });
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    note('request', 'invalid-token');
    return null;
  }
  const stopped = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
  const interrupted = () => (signal.aborted ? ('aborted' as const) : ('timeout' as const));
  try {
    stopped.throwIfAborted();
    const response = await fetch(new URL('/account/delivery/' + path, pin.origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', Authorization: 'Bearer ' + token },
      body,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: stopped,
    });
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
  } catch {
    note('request', stopped.aborted ? interrupted() : 'network-unavailable');
    return null;
  }
}
