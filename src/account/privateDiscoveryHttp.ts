import { parseRemovalDiscoveryRequest } from '../../account-protocol/removalDiscovery';
import { isAccountAccess, accountServiceFetch, type AccountAccess } from './accountHttp';
/** Bounded private locator transport. Only the owned client may turn a verified reply into authority. */
import { parseAuthorityPin, type AuthorityPin } from '../../account-protocol/authority';
import {
  parseDiscoveryRequest,
  DISCOVERY_RESPONSE_LIMIT,
  type AuthorityDiscoveryRequest,
} from '../../account-protocol/successor';
import { recordPrivateTransportDiagnostic } from './privateDeliveryHttp';
import { type Diagnostic } from '../../account-protocol/diagnostics';
import {
  parseMembershipDiscoveryRequest,
  MEMBERSHIP_CHAIN_LIMIT,
} from '../../account-protocol/membershipLocator';

export async function privateDiscoveryPost(
  inputPin: AuthorityPin,
  token: AccountAccess,
  input:
    | AuthorityDiscoveryRequest
    | ReturnType<typeof parseMembershipDiscoveryRequest>
    | ReturnType<typeof parseRemovalDiscoveryRequest>,
  signal: AbortSignal,
): Promise<unknown | null> {
  const note = (phase: Diagnostic['phase'], code: Diagnostic['code']) =>
    recordPrivateTransportDiagnostic({ operation: 'discovery', phase, code });
  const stopped = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
  try {
    const removal = input.kind === 'removal-discovery-request';
    const pin = parseAuthorityPin(inputPin),
      request = removal
        ? parseRemovalDiscoveryRequest(input)
        : input.v === 2
          ? parseMembershipDiscoveryRequest(input)
          : parseDiscoveryRequest(input),
      limit = removal || input.v === 2 ? MEMBERSHIP_CHAIN_LIMIT + 1024 : DISCOVERY_RESPONSE_LIMIT;
    if (JSON.stringify(request.pin) !== JSON.stringify(pin)) throw Error('Discovery pin changed');
    if (!isAccountAccess(token)) {
      note('request', 'invalid-token');
      return null;
    }
    stopped.throwIfAborted();
    const response = await accountServiceFetch(
      pin,
      token,
      removal
        ? '/account/membership/v2/removal/discover'
        : input.v === 2
          ? '/account/membership/v2/discover'
          : '/account/authority/discover',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: stopped,
      },
    );
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
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
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
        if (length > limit) {
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
