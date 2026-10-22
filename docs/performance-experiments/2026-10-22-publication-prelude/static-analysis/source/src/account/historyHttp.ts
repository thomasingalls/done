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

export class HistoryTransportUnavailable extends Error {}
export class HistoryReplyRefused extends Error {
  constructor(
    readonly reason: 'size' | 'integrity',
    cause?: unknown,
  ) {
    super(cause instanceof Error ? cause.message : 'History service evidence was refused', {
      cause,
    });
  }
}

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
    const live = () => {
      if (stopped.aborted)
        throw new HistoryTransportUnavailable('History service request stopped', {
          cause: stopped.reason,
        });
    };
    live();
    await verifyHistoryExchange(request, authority, Date.now());
    live();
    const response = await send('/account/history/v1/checkpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: stopped,
    }).catch((cause: unknown) => {
      throw new HistoryTransportUnavailable('History service is unavailable', { cause });
    });
    const limit = HISTORY_PAGE_LIMIT + 64;
    const declared = response.headers.get('content-length');
    if (
      stopped.aborted ||
      response.status !== 200 ||
      !response.body ||
      response.headers.get('content-type')?.split(';')[0] !== 'application/json'
    ) {
      await response.body?.cancel();
      throw new HistoryTransportUnavailable(
        'History service reply unavailable. Saved progress can be retried.',
      );
    }
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
      await response.body.cancel().catch(() => {});
      throw new HistoryReplyRefused(/^\d+$/.test(declared) ? 'size' : 'integrity');
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
        live();
        const { done, value } = await reader.read().catch((cause: unknown) => {
          throw new HistoryTransportUnavailable('History reply was interrupted', { cause });
        });
        live();
        if (done) break;
        length += value.length;
        if (length > limit) throw new HistoryReplyRefused('size');
        text += decoder.decode(value, { stream: true });
      }
      if (declared !== null && length !== Number(declared))
        throw Error('History reply is incomplete');
      const raw = JSON.parse(text + decoder.decode()) as unknown;
      const result = closed(raw, ['ok', 'page']);
      if (result['ok'] !== true) throw Error('History service did not confirm the operation');
      const page = await verifyHistoryCheckpointPage(result['page'], request, p.pin);
      live();
      return page;
    } catch (cause) {
      if (cause instanceof HistoryTransportUnavailable || cause instanceof HistoryReplyRefused)
        throw cause;
      throw new HistoryReplyRefused('integrity', cause);
    } finally {
      stopped.removeEventListener('abort', cancel);
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  };
}
