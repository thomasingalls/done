/** Scoped transport for a retained removal intent. A reply never installs a local generation. */
import { same } from '../../account-protocol/admission';
import { closed } from '../../account-protocol/preparation';
import {
  membershipState,
  parseMembershipRotation,
  verifyMembershipRotation,
  MEMBERSHIP_PROOF_LIMIT,
  type VerifiedMembership,
} from '../../account-protocol/membership';
import {
  parseRemovalPreparationRequest,
  verifyRemovalPreparation,
  parseRotationRequest,
  verifyRotationRequest,
  resolveRotationOutcome,
} from '../../account-protocol/rotation';
import { NetworkAuthorityChanged, type ScopedAccess } from './scopedTransport';
import type { DeviceRemovalIO } from './deviceRemoval';

export function createDeviceRemovalTransport(
  parent: VerifiedMembership,
  access: ScopedAccess,
  signal: AbortSignal,
): Pick<DeviceRemovalIO, 'prepare' | 'submit'> {
  const p = membershipState(parent);
  if (access.kind !== 'scoped-account' || !same(access.pin, p.pin))
    throw Error('Removal service changed');
  const send = access.fetch.bind(access);
  const post = async (path: string, body: unknown) => {
    const stopped = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
    stopped.throwIfAborted();
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: stopped,
    };
    // Preparation itself changes the grant fingerprint. Retrying these identical signed bytes
    // is safe: the domain still checks the prepared parent or its saved terminal outcome.
    const response = await send(path, init).catch((cause) => {
      if (!(cause instanceof NetworkAuthorityChanged)) throw cause;
      stopped.throwIfAborted();
      return send(path, init);
    });
    const limit = MEMBERSHIP_PROOF_LIMIT + 4096;
    const declared = response.headers.get('content-length');
    if (
      response.status !== 200 ||
      !response.body ||
      response.headers.get('content-type')?.split(';')[0] !== 'application/json' ||
      (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit))
    ) {
      await response.body?.cancel();
      throw Error('Removal reply unavailable');
    }
    const reader = response.body.getReader(),
      decoder = new TextDecoder('utf-8', { fatal: true });
    let length = 0,
      text = '';
    const cancel = () => {
      void reader.cancel().catch(() => {});
    };
    stopped.addEventListener('abort', cancel, { once: true });
    try {
      for (;;) {
        stopped.throwIfAborted();
        const { value, done } = await reader.read();
        stopped.throwIfAborted();
        if (done) break;
        length += value.length;
        if (length > limit) throw Error('Removal reply too large');
        text += decoder.decode(value, { stream: true });
      }
      if (declared !== null && length !== Number(declared)) throw Error('Incomplete removal reply');
      return JSON.parse(text + decoder.decode()) as unknown;
    } finally {
      stopped.removeEventListener('abort', cancel);
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  };
  return {
    async prepare(input) {
      const request = parseRemovalPreparationRequest(input);
      if (request.parent !== p.head || request.workspaceId !== p.workspaceId)
        throw Error('Removal parent changed');
      const result = closed(await post('/account/membership/v2/removal/prepare', request), [
        'ok',
        'preparation',
      ]);
      if (result['ok'] !== true) throw Error('Removal not prepared');
      const preparation = await verifyRemovalPreparation(result['preparation'], parent);
      if (!same(preparation.request, request)) throw Error('Removal preparation changed');
      signal.throwIfAborted();
      return preparation;
    },
    async submit(input) {
      const request = parseRotationRequest(input);
      if (
        request.preparation.request.parent !== p.head ||
        request.preparation.request.workspaceId !== p.workspaceId
      )
        throw Error('Removal parent changed');
      const result = closed(await post('/account/membership/v2/removal/commit', request), [
        'ok',
        'outcome',
        'rotation',
      ]);
      if (result['ok'] !== true) throw Error('Removal not committed');
      const rotation = parseMembershipRotation(result['rotation']);
      await verifyMembershipRotation(rotation, parent);
      if (!same(rotation.epoch.outcome, result['outcome'])) throw Error('Removal outcome changed');
      const verified = await verifyRotationRequest(request, parent, rotation.epoch.recovery);
      const outcome = await resolveRotationOutcome(result['outcome'], verified);
      if (outcome.kind === 'pending') throw Error('Unverified removal outcome');
      signal.throwIfAborted();
      return outcome.outcome;
    },
  };
}
