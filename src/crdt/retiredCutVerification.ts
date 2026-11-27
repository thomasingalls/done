/** Verify a history snapshot's cut inside history this device reduced: read that publisher's
 * accepted entries from the cut to the retained frontier and require the chain to end at the exact
 * frontier link this device kept. Network and crypto only; no storage, cursor or durable trust. */
import {
  encodeInboundRequest,
  inboundRequestMessage,
} from '../../account-protocol/inboundTransport';
import { READ_COUNT_LIMIT } from '../../account-protocol/deliveryTransport';
import {
  InboundError,
  verifyHistoryPage,
  type InboundContext,
  type InboundLifetime,
} from './accountInbound';
import { publisherContext } from './inboundLedger';
import { HISTORY_REPLAY_BYTES, HISTORY_REPLAY_EVENTS } from './historySource';
import { hex, random, type Bytes } from './custodyCrypto';
import type { RetiredCut } from './retainedHistory';

/** The service holds no answer, or the read would exceed the snapshot replay bounds. */
export class RetiredCutUnverifiable extends Error {
  constructor(message = 'History snapshot cut cannot be checked against retained history') {
    super(message);
  }
}
export interface RetiredCutReader {
  sign(message: Bytes): Promise<string>;
  /** One read-v2 page; throws for no answer. Never consulted for an expected link. */
  read(request: Bytes): Promise<Bytes>;
  now?(): number;
}
/** Same bounds as producing or admitting a snapshot. A mismatch throws an integrity refusal
 * (InboundError) from the existing page verifier; other publishers' cuts are never read. */
export async function verifyRetiredCuts(
  base: InboundContext,
  needs: readonly RetiredCut[],
  io: RetiredCutReader,
  lifetime: InboundLifetime,
): Promise<ReadonlyMap<string, RetiredCut>> {
  const now = () => io.now?.() ?? Date.now();
  let events = 0,
    bytes = 0;
  for (const n of needs)
    if (
      !Number.isSafeInteger(n.cut.position) ||
      n.cut.position < 1 ||
      !Number.isSafeInteger(n.through.position) ||
      n.through.position <= n.cut.position
    )
      throw Error('Invalid retired cut');
  if (
    needs.reduce((sum, n) => sum + n.through.position - n.cut.position, 0) > HISTORY_REPLAY_EVENTS
  )
    throw new RetiredCutUnverifiable('History snapshot cut is too far behind retained history');
  const verified = new Map<string, RetiredCut>();
  for (const need of needs) {
    if (verified.has(need.credentialId)) throw Error('Duplicate retired cut');
    // The publisher's certified context, reading forward from the snapshot's admitted cut.
    const { retained: _retained, ...publisher } = publisherContext(base, need.credentialId);
    const context: InboundContext = {
      ...publisher,
      prefix: {
        position: need.cut.position,
        link: need.cut.link,
        observedThrough: need.cut.position,
      },
    };
    while (context.prefix.position < need.through.position) {
      lifetime.assertCurrent();
      const body = {
        serviceId: base.service.id,
        origin: base.service.origin,
        workspace: base.authority.workspace,
        reader: base.reader.id,
        publisher: need.credentialId,
        lineage: base.authority.lineage,
        head: base.authority.head,
        epoch: base.authority.tip,
        after: context.prefix.position,
        limit: Math.min(READ_COUNT_LIMIT, need.through.position - context.prefix.position),
        nonce: hex(random(32)),
        expires: now() + 30000,
        signature: '00'.repeat(64),
      };
      body.signature = await io.sign(inboundRequestMessage(body));
      const request = encodeInboundRequest(body);
      let page: Bytes | undefined,
        result: Awaited<ReturnType<typeof verifyHistoryPage>> | undefined;
      try {
        page = await io.read(request);
        bytes += page.length;
        if (bytes > HISTORY_REPLAY_BYTES)
          throw new RetiredCutUnverifiable('History snapshot cut check exceeds its byte bound');
        // Ends at the retained frontier: a different final link refuses as `prefix`.
        result = await verifyHistoryPage(context, request, page, need.through, lifetime).catch(
          (cause: unknown) => {
            lifetime.assertCurrent(); // A stopped owner is not a refused page.
            if (cause instanceof InboundError) throw cause;
            // A malformed frame or envelope refuses like any other served entry that fails.
            throw Object.assign(new InboundError('record'), { cause });
          },
        );
        events += result.count;
        if (events > HISTORY_REPLAY_EVENTS) throw new RetiredCutUnverifiable();
        context.prefix = {
          position: result.position,
          link: result.link,
          observedThrough: result.through,
        };
      } finally {
        request.fill(0);
        page?.fill(0);
        for (const update of result?.updates ?? []) update.fill(0);
      }
    }
    verified.set(need.credentialId, need);
  }
  lifetime.assertCurrent();
  return verified;
}
