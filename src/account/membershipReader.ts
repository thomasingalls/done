import {
  readHandoffHistory,
  verifyHandoffHistoryAdvance,
  handoffHistoryPrefix,
} from '../crdt/handoffHistory';
/** Later-device loading. Activation remains the slot owner's separate commit. */
import { same, semanticMessage } from '../../account-protocol/admission';
import { closed } from '../../account-protocol/preparation';
import {
  verifyMembershipChain,
  type parseMembershipChain,
} from '../../account-protocol/membershipLocator';
import {
  membershipCheckpointRequestMessage,
  verifyMembershipCheckpoint,
  membershipCheckpointAdmissionBody,
  verifyMembershipCheckpointAdmission,
} from '../../account-protocol/membershipCheckpoint';
import { membershipDeliveryHash } from '../../account-protocol/membershipDelivery';
import {
  encodeInboundRequest,
  inboundRequestMessage,
} from '../../account-protocol/inboundTransport';
import type { SuccessorBase } from '../../account-protocol/successor';
import { verifyInboundPage } from '../crdt/accountInbound';
import {
  replayMembershipReading,
  eraseMembershipReading,
  captureMembershipReading,
  MEMBERSHIP_READING_EVENTS,
  type MembershipReading,
} from '../crdt/membershipReading';
import { Y, hasPendingUpdates } from '../crdt/yjs';
import { exportEntries } from '../crdt/export';
import { hex, random, type Bytes } from '../crdt/custodyCrypto';
import type { MembershipVault } from './membershipVault';
import type { MembershipHandoffState } from './membershipHandoff';
import type { ApprovedMembershipProgress } from './membershipHandoff';
import { membershipReadingPrefix } from '../crdt/membershipReading';

export interface MembershipReadingProgress extends Pick<
  ApprovedMembershipProgress,
  'replacement' | 'replacementBinding'
> {
  role: 'existing' | 'new';
  content?: MembershipHandoffState;
  reading?: MembershipReading;
}
export async function loadMembershipWriting(
  p: MembershipReadingProgress,
  owner: Pick<MembershipVault, 'participant' | 'load' | 'sign' | 'withInstalledKey'>,
  authority: { base: SuccessorBase; proofs: ReturnType<typeof parseMembershipChain> },
  input: {
    signal: AbortSignal;
    save(): Promise<void>;
    request(path: string, body: unknown): Promise<unknown>;
    read(bytes: Bytes): Promise<Bytes>;
  },
) {
  const capturedAuthority = structuredClone(authority);
  const { proofs, history } = await verifyMembershipChain(
      capturedAuthority.proofs,
      capturedAuthority.base,
    ),
    a = {
      base: capturedAuthority.base,
      successor: proofs.successor,
      certification: proofs.certification,
      continuations: proofs.continuations,
    },
    certification = proofs.continuations.at(-1),
    content = p.content;
  if (
    p.role !== 'new' ||
    !content?.key ||
    !content.certification ||
    certification?.kind !== 'membership-certification' ||
    !same(certification, content.certification) ||
    !same(certification.epoch.delivery, content.delivery) ||
    !same(certification.epoch.installation, content.installation) ||
    !same(owner.participant, certification.epoch.delivery.candidate.context.candidate)
  )
    throw Error('This device has no certified installed content key');
  const guard = () => input.signal.throwIfAborted();
  const durable = async () => {
    guard();
    const retained = (await owner.load()) as MembershipReadingProgress | null;
    if (
      !retained ||
      retained.role !== 'new' ||
      !same(retained.content, content) ||
      !same(retained.replacement, p.replacement) ||
      !same(retained.replacementBinding, p.replacementBinding) ||
      !same(
        retained.reading && captureMembershipReading(retained.reading),
        p.reading && captureMembershipReading(p.reading),
      )
    )
      throw Error('Later reader progress did not persist');
    guard();
    return retained;
  };
  await durable();
  if (!p.reading) {
    if (content.delivery.v === 3) {
      if (!p.replacement || !p.replacementBinding || content.installation?.v !== 3)
        throw Error('Replacement snapshot or account binding is missing');
      const reading: MembershipReading = {
        v: 3,
        epoch: history.current.tip,
        head: history.current.head,
        checkpoint: p.replacement,
        admission: content.installation.checkpoint,
        binding: p.replacementBinding,
        streams: [],
      };
      reading.streams = history.readers.map((m) => ({
        publisher: m.id,
        events: [],
        prefix: membershipReadingPrefix(reading, m.id),
      }));
      p.reading = reading;
    } else {
      const request = {
        v: 2 as const,
        kind: 'membership-checkpoint-read' as const,
        pin: a.base.pin,
        workspaceId: history.current.workspace,
        lineageId: history.current.lineage,
        credentialId: owner.participant.id,
        epoch: history.current.tip,
        head: history.current.head,
        nonce: hex(random(32)),
        expiresAt: Date.now() + 30000,
        signature: '00'.repeat(64),
      };
      request.signature = await owner.sign(await membershipCheckpointRequestMessage(request));
      guard();
      const response = closed(await input.request('/account/membership/v2/checkpoint', request), [
        'ok',
        'checkpoint',
      ]);
      if (response['ok'] !== true) throw Error('Historical writing is unavailable');
      const checkpoint = await verifyMembershipCheckpoint(response['checkpoint'], a, history);
      p.reading = {
        v: 2,
        epoch: history.current.tip,
        head: history.current.head,
        checkpoint,
        admission: null,
        streams: history.readers.map((m) => ({
          publisher: m.id,
          events: [],
          prefix: { position: 0, link: '00'.repeat(32), observedThrough: 0 },
        })),
      };
    }
    await input.save();
  }
  if (p.reading.v === 2) {
    const proof = await readHandoffHistory(
      history,
      a.base.pin,
      owner.participant.id,
      owner.sign,
      input.request,
      p.reading.history,
    );
    if (proof) {
      const prior = p.reading.history;
      await owner.withInstalledKey(
        content.key,
        await membershipDeliveryHash(content.delivery),
        (key) => verifyHandoffHistoryAdvance(prior, proof, history, key),
      );
      p.reading.history = proof;
      for (const stream of p.reading.streams) {
        const cut = handoffHistoryPrefix(proof, stream.publisher);
        if (stream.prefix.position < cut.position)
          stream.prefix = {
            ...cut,
            observedThrough: Math.max(cut.position, stream.prefix.observedThrough),
          };
      }
      // Authenticate the new tuple before writing it; a failed write leaves the old tuple usable.
      const checked = await owner.withInstalledKey(
        content.key,
        await membershipDeliveryHash(content.delivery),
        (key) =>
          replayMembershipReading(p.reading, a, history, owner.participant, key, {
            assertCurrent: guard,
          }),
      );
      eraseMembershipReading(checked);
      await input.save();
    }
  }
  const retained = await durable();
  return owner.withInstalledKey(
    content.key,
    await membershipDeliveryHash(content.delivery),
    async (key) => {
      const replay = await replayMembershipReading(
        retained.reading,
        a,
        history,
        owner.participant,
        key,
        { assertCurrent: guard },
      );
      try {
        // Work only on the captured, cold-replayed committed value after any interrupted save.
        const reading = (p.reading = replay.reading);
        if (reading.v === 2 && !reading.admission) {
          reading.admission = await membershipCheckpointAdmissionBody(
            reading.checkpoint,
            owner.participant.id,
            history,
          );
          reading.admission.signature = await owner.sign(await semanticMessage(reading.admission));
          await input.save();
          await durable();
        }
        if (reading.v === 2)
          await verifyMembershipCheckpointAdmission(reading.admission, reading.checkpoint, history);
        let fetched = 0,
          count = reading.streams.reduce((n, s) => n + s.events.length, 0);
        for (const [i, stream] of reading.streams.entries()) {
          const context = replay.contexts[i]!;
          for (;;) {
            guard();
            if (fetched++ >= 32 + reading.streams.length) return { kind: 'loading' as const };
            const r = {
              serviceId: context.service.id,
              origin: context.service.origin,
              workspace: history.current.workspace,
              reader: owner.participant.id,
              publisher: stream.publisher,
              lineage: history.current.lineage,
              head: history.current.head,
              epoch: history.current.tip,
              after: context.prefix.position,
              limit: 1,
              nonce: hex(random(32)),
              expires: Date.now() + 30000,
              signature: '00'.repeat(64),
            };
            r.signature = await owner.sign(inboundRequestMessage(r));
            const request = encodeInboundRequest(r);
            let page: Bytes | undefined;
            try {
              guard();
              page = await input.read(request);
              const result = await verifyInboundPage(context, request, page, {
                assertCurrent: guard,
              });
              if (result.kind === 'empty') break;
              if (result.kind !== 'received') {
                if (result.kind === 'conflict') result.record.fill(0);
                throw Error('Conflicting publisher history');
              }
              try {
                if (count++ >= MEMBERSHIP_READING_EVENTS) throw Error('Later reader history limit');
                for (const u of result.updates) Y.applyUpdate(replay.doc, u);
                stream.events.push(hex(result.record));
                stream.prefix = context.prefix = {
                  position: result.position,
                  link: result.link,
                  observedThrough: result.through,
                };
                await input.save();
                await durable();
              } finally {
                result.record.fill(0);
                for (const u of result.updates) u.fill(0);
              }
              if (context.prefix.position === context.prefix.observedThrough) break;
            } finally {
              request.fill(0);
              page?.fill(0);
            }
          }
        }
        if (hasPendingUpdates(replay.doc)) return { kind: 'loading' as const };
        await durable();
        return {
          kind: 'reading' as const,
          entries: exportEntries(replay.doc, replay.doc.getText('master').toString()),
        };
      } finally {
        eraseMembershipReading(replay);
      }
    },
  );
}
