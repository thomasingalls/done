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
import {
  verifyStoredInboundReceipt,
  type InboundContext,
  type InboundLifetime,
} from './accountInbound';
import {
  captureScopedInboundReceiptSyntax,
  inboundReceiptViews,
  encodeInboundPageRecord,
} from './inboundRecord';
import { captureInboundReceiptVersion } from './inboundReceiptVersion';
import { eraseVerified } from './verifiedRecords';
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
  const floor = captureInboundReceiptVersion(base),
    cut = handoffHistoryPrefix(proof, base.publisher.id);
  const context: InboundContext = {
    ...base,
    ...floor,
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
        const captured = captureScopedInboundReceiptSyntax(bytes, floor);
        if (!captured) throw Error('Invalid inbound record');
        try {
          const logical = [...inboundReceiptViews(captured).entries()],
            first = logical[0]!.event,
            position = first.position,
            end = logical.at(-1)!.event.position;
          if (position <= last) throw Error('Retained handoff order changed');
          last = end;
          if (position <= cut.position)
            context.prefix = {
              position: position - 1,
              link: first.previous,
              observedThrough: position - 1,
            };
          if (position > cut.position && context.prefix.position < cut.position)
            context.prefix = { ...cut };
          const receipt = await verifyStoredInboundReceipt(context, bytes, lifetime);
          let retainedRecord: Bytes | undefined, narrowed: Bytes | undefined;
          const retainedUpdates = new Set<Bytes>();
          try {
            for (const selected of receipt.entries) {
              lifetime.assertCurrent();
              const result = selected.result;
              if (result.kind !== 'received') throw Error('Invalid retained handoff event');
              for (const update of result.updates) Y.applyUpdate(doc, update);
              if (result.position <= cut.position) {
                if (!sameDocState(doc, snapshot))
                  throw Error('Admitted history omits retained accepted writing');
                if (result.position === cut.position && result.link !== cut.link)
                  throw Error('Handoff history cut conflicts');
              }
              context.prefix = {
                position: result.position,
                link: result.link,
                observedThrough: result.through,
              };
            }
            const suffix = receipt.entries.filter((e) => e.result.position > cut.position);
            if (suffix.length) {
              const begin = suffix[0]!,
                end = suffix.at(-1)!;
              if (begin.result.kind !== 'received' || end.result.kind !== 'received')
                throw Error('Invalid retained handoff event');
              if (suffix.length !== receipt.entries.length) {
                if (captured.receipt.kind !== 'page') throw Error('Invalid handoff extent');
                // Only the unsigned admitted-extent header changes. Exact original signed frames
                // remain whole; the covered snapshot/cut checks above authorize this suffix.
                narrowed = encodeInboundPageRecord({
                  baseline: begin.event.baseline,
                  lineage: begin.event.lineage,
                  head: begin.event.head,
                  reader: begin.event.reader,
                  publisher: begin.event.publisher,
                  firstPosition: begin.result.position,
                  previous: begin.event.previous,
                  lastLink: end.result.link,
                  firstEntry: begin.index,
                  entryCount: suffix.length,
                  request: begin.event.request,
                  page: begin.event.page,
                });
              }
              const updates = suffix.flatMap((e) => {
                if (e.result.kind !== 'received') throw Error('Invalid retained handoff event');
                return [...e.result.updates];
              });
              lifetime.assertCurrent();
              records.push({ record: narrowed ?? receipt.record, updates });
              retainedRecord = narrowed ?? receipt.record;
              for (const update of updates) retainedUpdates.add(update);
            }
          } finally {
            if (receipt.record !== retainedRecord) receipt.record.fill(0);
            if (narrowed !== retainedRecord) narrowed?.fill(0);
            for (const selected of receipt.entries) {
              if ('record' in selected.result && selected.result.record !== retainedRecord)
                selected.result.record.fill(0);
              if (selected.result.kind === 'received')
                for (const update of selected.result.updates)
                  if (!retainedUpdates.has(update)) update.fill(0);
              eraseVerified(selected.original);
            }
          }
        } finally {
          eraseVerified(captured);
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
