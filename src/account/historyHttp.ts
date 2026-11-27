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
import {
  HISTORY_ROUTE_REFUSALS,
  namedHistoryFailure,
  type HistoryFailureCode,
} from './historyFailure';

/** No usable answer, or a refusal; both are retried as before. `code` only chooses a sentence. */
export class HistoryTransportUnavailable extends Error {
  readonly code: HistoryFailureCode;
  constructor(message: string, options?: ErrorOptions & { code?: HistoryFailureCode }) {
    super(message, options);
    this.code = options?.code ?? 'history-unreachable';
  }
}
export class HistoryReplyRefused extends Error {
  readonly code: HistoryFailureCode = 'history-reply-unverified';
  constructor(
    readonly reason: 'size' | 'integrity',
    cause?: unknown,
  ) {
    super(cause instanceof Error ? cause.message : 'History service evidence was refused', {
      cause,
    });
  }
}
const REFUSAL_BODY_LIMIT = 512;
/** Which refusal a non-200 reply is. Only the service's exact `{ ok: false, refusal }` body counts,
 * and its reason chooses a code and nothing else. A gateway page or any other body is no answer. */
async function refusalCode(response: Response, signal: AbortSignal): Promise<HistoryFailureCode> {
  const declared = response.headers.get('content-length');
  if (
    !response.body ||
    response.headers.get('content-type')?.split(';')[0] !== 'application/json' ||
    (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > REFUSAL_BODY_LIMIT))
  ) {
    await response.body?.cancel().catch(() => {});
    return 'history-unreachable';
  }
  const reader = response.body.getReader(),
    decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '',
    length = 0;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      length += value.length;
      if (length > REFUSAL_BODY_LIMIT) return 'history-unreachable';
      text += decoder.decode(value, { stream: true });
    }
    const body = JSON.parse(text + decoder.decode()) as unknown;
    if (
      !body ||
      typeof body !== 'object' ||
      Object.getPrototypeOf(body) !== Object.prototype ||
      Object.keys(body).sort().join() !== 'ok,refusal' ||
      (body as { ok: unknown }).ok !== false
    )
      return 'history-unreachable';
    const reason = (body as { refusal: unknown }).refusal;
    if (response.status === 409 && (HISTORY_ROUTE_REFUSALS as readonly unknown[]).includes(reason))
      return `history-${reason as (typeof HISTORY_ROUTE_REFUSALS)[number]}`;
    if (response.status === 404 && reason === 'not-found') return 'history-not-found';
    if ([400, 403, 413].includes(response.status) && reason === 'malformed')
      return 'history-malformed';
    // The service's envelope with a reason this version does not know, or a malformed one.
    return 'history-refused';
  } catch {
    return 'history-unreachable';
  } finally {
    signal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
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
    // Stopped here (the operation ended) or timed out: no answer either way.
    const stop = (cause: unknown) =>
      new HistoryTransportUnavailable('History service request stopped', {
        cause,
        code: signal.aborted ? 'history-stopped' : 'history-timeout',
      });
    const live = () => {
      if (stopped.aborted) throw stop(stopped.reason);
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
      if (stopped.aborted || (cause instanceof Error && cause.name === 'TimeoutError'))
        throw stop(cause);
      // A sign-in or authorization refusal is named; anything else had no usable answer.
      throw new HistoryTransportUnavailable('History service is unavailable', {
        cause,
        code: namedHistoryFailure(cause) ?? 'history-unreachable',
      });
    });
    const limit = HISTORY_PAGE_LIMIT + 64;
    const declared = response.headers.get('content-length');
    if (stopped.aborted) {
      await response.body?.cancel();
      throw stop(stopped.reason);
    }
    if (response.status !== 200) {
      const code = await refusalCode(response, stopped);
      live();
      throw new HistoryTransportUnavailable(
        code === 'history-unreachable'
          ? 'History service reply unavailable. Saved progress can be retried.'
          : `History service refused the request (${code}). Saved progress can be retried.`,
        { code },
      );
    }
    if (
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
          if (stopped.aborted) throw stop(cause);
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
