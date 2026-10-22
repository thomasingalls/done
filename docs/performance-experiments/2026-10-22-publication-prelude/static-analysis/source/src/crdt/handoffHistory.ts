/** Admitted history for retained generation-one readers, preserving their original binding. */
import { same } from '../../account-protocol/admission';
import { closed } from '../../account-protocol/preparation';
import {
  historyMembershipAt,
  type AdmissionHistory,
} from '../../account-protocol/admissionHistory';
import {
  parseHistoryCheckpoint,
  parseHistoryCheckpointAdmission,
  verifyHistoryCheckpointAdmission,
  historyCheckpointHash,
  type HistoryCheckpoint,
  type HistoryCheckpointAdmission,
} from '../../account-protocol/historyCheckpoint';
import {
  historyExchangeMessage,
  parseHistoryExchange,
  verifyHistoryCheckpointPage,
} from '../../account-protocol/historyExchange';
import type { AuthorityPin } from '../../account-protocol/authority';
import { openHistoryCheckpoint } from './historyCheckpoint';
import { verifyStoredInbound, type InboundContext, type InboundLifetime } from './accountInbound';
import { decodeInboundRecord } from './inboundRecord';
import { hex, random, type Bytes } from './custodyCrypto';
import { unhex } from '../../account-protocol/recovery';
import { Y, sameDocState, type YDoc } from './yjs';

export interface HandoffHistory {
  checkpoint: HistoryCheckpoint;
  admission: HistoryCheckpointAdmission;
}
export function captureHandoffHistory(input: unknown): HandoffHistory {
  const r = closed(input, ['checkpoint', 'admission']);
  return {
    checkpoint: parseHistoryCheckpoint(r['checkpoint']),
    admission: parseHistoryCheckpointAdmission(r['admission']),
  };
}
export function handoffHistoryPrefix(proof: HandoffHistory | undefined, publisher: string) {
  const cut = proof?.checkpoint.heads.find((h) => h.credentialId === publisher);
  return {
    position: cut?.position ?? 0,
    link: cut?.link ?? '00'.repeat(32),
    observedThrough: cut?.position ?? 0,
  };
}
export async function readHandoffHistory(
  history: AdmissionHistory,
  pin: AuthorityPin,
  reader: string,
  sign: (bytes: Bytes) => Promise<string>,
  request: (path: string, body: unknown) => Promise<unknown>,
  previous?: HandoffHistory,
): Promise<HandoffHistory | undefined> {
  const r = parseHistoryExchange({
    v: 1,
    kind: 'history-checkpoint-request',
    workspaceId: history.current.workspace,
    lineageId: history.current.lineage,
    epoch: history.current.tip,
    head: history.current.head,
    credentialId: reader,
    nonce: hex(random(32)),
    expiresAt: Date.now() + 30000,
    action: 'read',
    payload: 'latest',
    signature: '00'.repeat(64),
  });
  r.signature = await sign(await historyExchangeMessage(r));
  const response = closed(await request('/account/history/v1/checkpoint', r), ['ok', 'page']);
  if (response['ok'] !== true) throw Error('Handoff history unavailable');
  const page = await verifyHistoryCheckpointPage(response['page'], r, pin);
  if (!page.checkpoint) {
    if (previous) throw Error('Handoff history disappeared');
    return undefined;
  }
  if (!page.admission) throw Error('Handoff history is not admitted');
  const next = captureHandoffHistory({ checkpoint: page.checkpoint, admission: page.admission });
  if (previous) {
    const before = previous.checkpoint,
      after = next.checkpoint;
    if (
      after.manifest.sequence < before.manifest.sequence ||
      (after.manifest.sequence === before.manifest.sequence && !same(next, previous)) ||
      (after.manifest.sequence === before.manifest.sequence + 1 &&
        after.manifest.parent !== (await historyCheckpointHash(before)))
    )
      throw Error('Handoff history regressed or forked');
    if (after.manifest.sequence === before.manifest.sequence) return undefined;
  }
  return next;
}
export async function mergeHandoffHistory(
  doc: YDoc,
  proof: HandoffHistory | undefined,
  history: AdmissionHistory,
  key: Bytes,
) {
  if (!proof) return;
  const captured = captureHandoffHistory(proof),
    cp = captured.checkpoint;
  if (cp.manifest.generation !== 1 || cp.manifest.epoch > history.current.tip)
    throw Error('Handoff history needs its certified generation');
  const authority = historyMembershipAt(history, cp.manifest.epoch);
  await verifyHistoryCheckpointAdmission(captured.admission, cp, authority);
  const snapshot = await openHistoryCheckpoint(cp, key, authority);
  const update = new Uint8Array(Y.encodeStateAsUpdate(snapshot));
  try {
    Y.applyUpdate(doc, update);
  } finally {
    update.fill(0);
    snapshot.destroy();
  }
}
/** Old receipts stay in custody and are verified from their original prefix. Only receipts above
 * the new cut become native suffix records; covered receipts must add nothing to the full snapshot.
 * A gap is permitted exactly once, across the authenticated cut, never in the retained suffix. */
export async function replayHandoffStream(
  doc: YDoc,
  base: InboundContext,
  events: readonly string[],
  proof: HandoffHistory | undefined,
  lifetime: InboundLifetime,
) {
  const cut = handoffHistoryPrefix(proof, base.publisher.id);
  const context: InboundContext = {
    ...base,
    prefix: { position: 0, link: '00'.repeat(32), observedThrough: 0 },
  };
  const records: { record: Bytes; updates: readonly Bytes[] }[] = [];
  const snapshot = new Y.Doc({ gc: false });
  const initial = new Uint8Array(Y.encodeStateAsUpdate(doc));
  Y.applyUpdate(snapshot, initial);
  initial.fill(0);
  let last = 0;
  try {
    for (const wire of events) {
      lifetime.assertCurrent();
      const bytes = unhex(wire, wire.length / 2);
      try {
        const record = decodeInboundRecord(bytes),
          position = record.position;
        if (position <= last) throw Error('Retained handoff order changed');
        record.request.fill(0);
        record.page.fill(0);
        last = position;
        if (position <= cut.position)
          context.prefix = {
            position: position - 1,
            link: record.previous,
            observedThrough: position - 1,
          };
        if (position > cut.position && context.prefix.position < cut.position)
          context.prefix = { ...cut };
        const result = await verifyStoredInbound(context, bytes, lifetime);
        if (result.kind !== 'received') throw Error('Invalid retained handoff event');
        let retained = false;
        try {
          for (const update of result.updates) Y.applyUpdate(doc, update);
          if (position <= cut.position) {
            if (!sameDocState(doc, snapshot))
              throw Error('Admitted history omits retained accepted writing');
            if (position === cut.position && result.link !== cut.link)
              throw Error('Handoff history cut conflicts');
          } else {
            records.push({ record: result.record, updates: result.updates });
            retained = true;
          }
          context.prefix = {
            position: result.position,
            link: result.link,
            observedThrough: result.through,
          };
        } finally {
          if (!retained) {
            result.record.fill(0);
            for (const u of result.updates) u.fill(0);
          }
        }
      } finally {
        bytes.fill(0);
      }
    }
    if (context.prefix.position < cut.position)
      context.prefix = {
        ...cut,
        observedThrough: Math.max(cut.position, context.prefix.observedThrough),
      };
    else if (context.prefix.position === cut.position && !same(context.prefix.link, cut.link))
      throw Error('Handoff history cut conflicts');
    if (proof) context.baselineHeads = proof.checkpoint.heads;
    return { records, context };
  } catch (cause) {
    for (const r of records) {
      r.record.fill(0);
      for (const u of r.updates) u.fill(0);
    }
    throw cause;
  } finally {
    snapshot.destroy();
  }
}

export async function verifyHandoffHistoryAdvance(
  previous: HandoffHistory | undefined,
  next: HandoffHistory,
  history: AdmissionHistory,
  key: Bytes,
) {
  if (!previous) return;
  const doc = new Y.Doc({ gc: false }),
    prior = new Y.Doc({ gc: false });
  try {
    await mergeHandoffHistory(doc, next, history, key);
    await mergeHandoffHistory(prior, previous, history, key);
    const before = new Y.Doc({ gc: false });
    const bytes = new Uint8Array(Y.encodeStateAsUpdate(doc)),
      old = new Uint8Array(Y.encodeStateAsUpdate(prior));
    try {
      Y.applyUpdate(before, bytes);
      Y.applyUpdate(doc, old);
      if (!sameDocState(before, doc))
        throw Error('New handoff history omits retained snapshot writing');
      for (const cut of previous.checkpoint.heads) {
        const nextCut = next.checkpoint.heads.find((h) => h.credentialId === cut.credentialId);
        if (
          !nextCut ||
          nextCut.position < cut.position ||
          (nextCut.position === cut.position && nextCut.link !== cut.link)
        )
          throw Error('New handoff history regresses a retained cut');
      }
    } finally {
      before.destroy();
      bytes.fill(0);
      old.fill(0);
    }
  } finally {
    doc.destroy();
    prior.destroy();
  }
}
