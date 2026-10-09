/** Bounded session/grant transport; a network reply cannot install a local baseline or prune. */
import { same } from '../../account-protocol/admission';
import { closed } from '../../account-protocol/preparation';
import { membershipState, type VerifiedMembership } from '../../account-protocol/membership';
import {
  HISTORY_PAGE_LIMIT,
  parseHistoryExchange,
  verifyHistoryExchange,
  verifyHistoryCheckpointPage,
  type HistoryExchange,
} from '../../account-protocol/historyExchange';
import type { ScopedAccess } from './scopedTransport';

export function createHistoryTransport(
  authority: VerifiedMembership,
  access: ScopedAccess,
  signal: AbortSignal,
) {
  const p = membershipState(authority),
    send = access.fetch.bind(access);
  if (access.kind !== 'scoped-account' || !same(access.pin, p.pin))
    throw Error('History service identity changed');
  return async (input: HistoryExchange) => {
    const request = parseHistoryExchange(input);
    const stopped = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
    stopped.throwIfAborted();
    await verifyHistoryExchange(request, authority, Date.now());
    stopped.throwIfAborted();
    const response = await send('/account/history/v1/checkpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: stopped,
    });
    const limit = HISTORY_PAGE_LIMIT + 64;
    const declared = response.headers.get('content-length');
    if (
      stopped.aborted ||
      response.status !== 200 ||
      !response.body ||
      response.headers.get('content-type')?.split(';')[0] !== 'application/json' ||
      (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit))
    ) {
      await response.body?.cancel();
      throw Error('History service reply unavailable. Saved progress can be retried.');
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
        const { done, value } = await reader.read();
        stopped.throwIfAborted();
        if (done) break;
        length += value.length;
        if (length > limit) throw Error('History service reply is too large');
        text += decoder.decode(value, { stream: true });
      }
      if (declared !== null && length !== Number(declared))
        throw Error('History reply is incomplete');
      const raw = JSON.parse(text + decoder.decode()) as unknown;
      const result = closed(raw, ['ok', 'page']);
      if (result['ok'] !== true) throw Error('History service did not confirm the operation');
      const page = await verifyHistoryCheckpointPage(result['page'], request, p.pin);
      stopped.throwIfAborted();
      return page;
    } finally {
      stopped.removeEventListener('abort', cancel);
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  };
}
