import {
  readHandoffHistory,
  verifyHandoffHistoryAdvance,
  mergeHandoffHistory,
  replayHandoffStream,
  handoffHistoryPrefix,
  type HandoffHistory,
} from '../crdt/handoffHistory';
import { type AccountAccess } from './accountHttp';
/** Certified checkpoint + ordinary inbound stream, retained as one factor-sealed reader tuple. */
import { same, semanticMessage } from '../../account-protocol/admission';
import { contentDeliveryHash } from '../../account-protocol/contentDelivery';
import {
  checkpointRequestMessage,
  verifyContentCheckpoint,
  checkpointAdmissionBody,
  verifyCheckpointAdmission,
  contentCheckpointHash,
  type CheckpointAuthority,
  type ContentCheckpoint,
  type CheckpointAdmission,
  type CheckpointRequest,
} from '../../account-protocol/contentCheckpoint';
import { verifyCertificationHistory } from '../../account-protocol/admissionHistory';
import {
  encodeInboundRequest,
  inboundRequestMessage,
} from '../../account-protocol/inboundTransport';
import { READ_PAGE_LIMIT } from '../../account-protocol/deliveryTransport';
import { openContentCheckpoint } from '../crdt/contentCheckpoint';
import { verifyInboundPage, type InboundContext, type InboundResult } from '../crdt/accountInbound';
import { Y, hasPendingUpdates } from '../crdt/yjs';
import { exportEntries } from '../crdt/export';
import { hex, random } from '../crdt/custodyCrypto';
import type { LocalPasskey } from '../crdt/accountAccess';
import { privateDeliveryPost } from './privateDeliveryHttp';
import type { CeremonyVault } from './ceremonyVault';
import type { ContentHandoffState } from './contentHandoff';
export interface ContentReaderState {
  checkpoint: ContentCheckpoint;
  admission: CheckpointAdmission | null;
  active: boolean;
  history?: HandoffHistory;
  events: string[];
  prefix: InboundContext['prefix'];
}
export interface ReadingProgress {
  role: 'existing' | 'new';
  content?: ContentHandoffState;
  reading?: ContentReaderState;
}
export async function openApprovedWriting(
  p: ReadingProgress,
  owner: CeremonyVault,
  a: CheckpointAuthority,
  input: {
    assert: LocalPasskey;
    token: AccountAccess;
    signal: AbortSignal;
    save(): Promise<void>;
    request(route: string, value: unknown): Promise<any>;
  },
) {
  const guard = () => input.signal.throwIfAborted();
  if (!p.content?.certification || !same(p.content.certification, a.certification))
    throw Error('Certified content access is required');
  const transfer = async (action: CheckpointRequest['action'], payload: unknown) => {
    const r: CheckpointRequest = {
      workspaceId: a.base.request.candidate.workspaceId,
      credentialId: owner.participant.id,
      head: a.certification.head,
      nonce: hex(random(32)),
      action,
      payload,
      signature: '00'.repeat(64),
    };
    r.signature = await owner.sign(await checkpointRequestMessage(r));
    guard();
    return input.request('content/checkpoint', r);
  };
  if (p.role === 'existing') {
    const c = await owner.prepareCheckpoint(a, input.assert);
    const remote = await transfer('publish', c);
    if (!same(remote.checkpoint, c)) throw Error('Published checkpoint changed');
    if (remote.admission) await verifyCheckpointAdmission(remote.admission, c, a);
    return { kind: 'published' as const };
  }
  const key = p.content.key;
  if (
    !key ||
    owner.participant.id !== a.certification.epoch.delivery.candidate.context.candidate.id
  )
    throw Error('This device has no installed content key');
  const remote = await transfer('read', null);
  if (!remote.checkpoint) return { kind: 'waiting' as const };
  const checkpoint = await verifyContentCheckpoint(remote.checkpoint, a);
  if (p.reading && !same(p.reading.checkpoint, checkpoint))
    throw Error('Saved content baseline changed');
  await owner.authorize(checkpoint.binding, a, input.assert);
  const history = await verifyCertificationHistory(a.certification, a.successor, a.base, {
    epoch: 3,
    head: a.certification.head,
  });
  return owner.withInstalledKey(key, await contentDeliveryHash(p.content.delivery), async (kg) => {
    const doc = await openContentCheckpoint(checkpoint, kg, a);
    try {
      guard();
      if (!p.reading) {
        p.reading = {
          checkpoint,
          admission: null,
          active: false,
          events: [],
          prefix: { position: 0, link: '00'.repeat(32), observedThrough: 0 },
        };
        await input.save();
      }
      const state = p.reading;
      let addedHistory = false;
      {
        const proof = await readHandoffHistory(
          history,
          a.base.pin,
          owner.participant.id,
          owner.sign,
          input.request,
          state.history,
        );
        if (proof) {
          await verifyHandoffHistoryAdvance(state.history, proof, history, kg);
          state.history = proof;
          addedHistory = true;
        }
      }
      await mergeHandoffHistory(doc, state.history, history, kg);
      const base: InboundContext = {
        baseline: { kind: 'content-checkpoint', id: await contentCheckpointHash(checkpoint) },
        service: { id: a.base.pin.serviceId, origin: a.base.pin.origin },
        authority: history.current,
        history,
        creatingCredential: history.credential,
        reader: { id: owner.participant.id, publicKey: owner.participant.sPub, active: true },
        publisher: {
          id: history.credential,
          publicKey: history.signingKey,
          principal: history.principal,
          system: true,
          active: true,
        },
        generation: 1,
        generationKey: kg,
        prefix: { position: 0, link: '00'.repeat(32), observedThrough: 0 },
      };
      const apply = (result: InboundResult) => {
        if (result.kind !== 'received') throw Error('Unexpected content history');
        try {
          for (const u of result.updates) Y.applyUpdate(doc, u);
        } finally {
          for (const u of result.updates) u.fill(0);
          result.record.fill(0);
        }
        base.prefix = {
          position: result.position,
          link: result.link,
          observedThrough: result.through,
        };
      };
      if (!Array.isArray(state.events) || state.events.length > 4096)
        throw Error('Reader history limit');
      const replay = await replayHandoffStream(doc, base, state.events, state.history, {
        assertCurrent: guard,
      });
      Object.assign(base, replay.context);
      for (const r of replay.records) {
        r.record.fill(0);
        for (const u of r.updates) u.fill(0);
      }
      if (addedHistory) {
        const cut = handoffHistoryPrefix(state.history, base.publisher.id);
        if (state.prefix.position < cut.position)
          state.prefix = {
            ...cut,
            observedThrough: Math.max(cut.position, state.prefix.observedThrough),
          };
      }
      if (!same(base.prefix, state.prefix))
        throw Error('Reader prefix differs from retained history');
      if (addedHistory) await input.save();
      if (state.admission) await verifyCheckpointAdmission(state.admission, checkpoint, a);
      else {
        // Only a fully reopened, durably retained snapshot can receive the second client's admission.
        const retained = (await owner.load()) as ReadingProgress;
        if (!retained.reading || !same(retained.reading, state))
          throw Error('Checkpoint did not persist');
        const reopened = await openContentCheckpoint(retained.reading.checkpoint, kg, a);
        reopened.destroy();
        state.admission = await checkpointAdmissionBody(checkpoint, owner.participant.id);
        state.admission.signature = await owner.sign(await semanticMessage(state.admission));
        await input.save();
      }
      if (!state.active) {
        const ack = await transfer('admit', state.admission);
        await verifyCheckpointAdmission(ack.admission, checkpoint, a);
        if (!same(ack.checkpoint, checkpoint) || !same(ack.admission, state.admission))
          throw Error('Checkpoint acknowledgment changed');
        state.active = true;
        await input.save();
      }
      for (let batch = 0; batch < 32; batch++) {
        guard();
        const r = {
          serviceId: base.service.id,
          origin: base.service.origin,
          workspace: base.authority.workspace,
          reader: base.reader.id,
          publisher: base.publisher.id,
          lineage: base.authority.lineage,
          head: base.authority.head,
          epoch: 3,
          after: base.prefix.position,
          limit: 1,
          nonce: hex(random(32)),
          expires: Date.now() + 30000,
          signature: '00'.repeat(64),
        };
        r.signature = await owner.sign(inboundRequestMessage(r));
        const bytes = encodeInboundRequest(r),
          page = await privateDeliveryPost(
            a.base.pin,
            input.token,
            'read-v2',
            bytes,
            READ_PAGE_LIMIT,
            input.signal,
          );
        if (!page)
          throw Error(
            'Writing is saved on this device, but checking for updates failed. Try again.',
          );
        try {
          const result = await verifyInboundPage(base, bytes, page, { assertCurrent: guard });
          if (result.kind === 'empty') break;
          if (result.kind !== 'received' || state.events.length >= 4096)
            throw Error('Reader history limit or conflicting update');
          const wire = hex(result.record);
          apply(result);
          state.events.push(wire);
          state.prefix = { ...base.prefix };
          await input.save();
          if (base.prefix.position === base.prefix.observedThrough) break;
          if (batch === 31) throw Error('More writing remains to load. Check again to continue.');
        } finally {
          bytes.fill(0);
          page.fill(0);
        }
      }
      if (hasPendingUpdates(doc))
        throw Error('Writing is saved but some dependencies have not arrived. Check again.');
      guard();
      return {
        kind: 'reading' as const,
        entries: exportEntries(doc, doc.getText('master').toString()),
      };
    } finally {
      doc.destroy();
    }
  });
}
