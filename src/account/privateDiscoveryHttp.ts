import { isPrivateAccess, privateServiceFetch, type PrivateAccess } from './privateAccess';
/** Bounded private locator transport. Only the owned client may turn a verified reply into authority. */
import { parseAuthorityPin, type AuthorityPin } from '../../account-protocol/authority';
import {
  parseDiscoveryRequest,
  DISCOVERY_RESPONSE_LIMIT,
  type AuthorityDiscoveryRequest,
} from '../../account-protocol/successor';
import { recordPrivateTransportDiagnostic } from './privateDeliveryHttp';
import { type Diagnostic } from '../../account-protocol/diagnostics';

export async function privateDiscoveryPost(
  inputPin: AuthorityPin,
  token: PrivateAccess,
  input: AuthorityDiscoveryRequest,
  signal: AbortSignal,
): Promise<unknown | null> {
  const note = (phase: Diagnostic['phase'], code: Diagnostic['code']) =>
    recordPrivateTransportDiagnostic({ operation: 'discovery', phase, code });
  const stopped = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
  try {
    const pin = parseAuthorityPin(inputPin),
      request = parseDiscoveryRequest(input);
    if (JSON.stringify(request.pin) !== JSON.stringify(pin)) throw Error('Discovery pin changed');
    if (!isPrivateAccess(token)) {
      note('request', 'invalid-token');
      return null;
    }
    stopped.throwIfAborted();
    const response = await privateServiceFetch(pin, token, '/account/authority/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: stopped,
    });
    if (
      stopped.aborted ||
      response.status !== 200 ||
      response.headers.get('content-type') !== 'application/json' ||
      !response.body
    ) {
      await response.body?.cancel();
      note('response', 'response-invalid');
      return null;
    }
    const declared = response.headers.get('content-length');
    if (
      declared !== null &&
      (!/^\d+$/.test(declared) || Number(declared) > DISCOVERY_RESPONSE_LIMIT)
    ) {
      await response.body.cancel();
      note('response', 'response-too-large');
      return null;
    }
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let length = 0,
      cancellation: Promise<void> | undefined;
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
        if (length > DISCOVERY_RESPONSE_LIMIT) {
          cancel();
          note('stream', 'response-too-large');
          return null;
        }
        chunks.push(value.slice());
      }
      if (declared !== null && Number(declared) !== length) {
        note('stream', 'response-invalid');
        return null;
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      try {
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      } finally {
        bytes.fill(0);
      }
    } catch {
      cancel();
      note('stream', signal.aborted ? 'aborted' : stopped.aborted ? 'timeout' : 'response-invalid');
      return null;
    } finally {
      stopped.removeEventListener('abort', cancel);
      await cancellation;
      reader.releaseLock();
      for (const chunk of chunks) chunk.fill(0);
    }
  } catch {
    note(
      'request',
      signal.aborted ? 'aborted' : stopped.aborted ? 'timeout' : 'network-unavailable',
    );
    return null;
  }
}
