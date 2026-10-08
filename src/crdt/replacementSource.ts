/** Cold accepted-prefix replay for a replacement producer; no authority installation or publication. */
import type {
  CheckpointAuthority,
  ContentCheckpoint,
} from '../../account-protocol/contentCheckpoint';
import { contentCheckpointHash } from '../../account-protocol/contentCheckpoint';
import {
  historyAuthority,
  historyMembership,
  historyPublisher,
  type AdmissionHistory,
} from '../../account-protocol/admissionHistory';
import { membershipState, type VerifiedMembership } from '../../account-protocol/membership';
import {
  replacementCheckpointHeads,
  replacementCheckpointHash,
  verifyReplacementCheckpointAdmission,
  type ReplacementCheckpoint,
  type ReplacementCheckpointAdmission,
} from '../../account-protocol/replacementCheckpoint';
import { openContentCheckpoint } from './contentCheckpoint';
import { createReplacementCheckpoint, openReplacementCheckpoint } from './replacementCheckpoint';
import {
  verifyInboundPage,
  verifyStoredInbound,
  type InboundContext,
  type InboundLifetime,
  type InboundResult,
} from './accountInbound';
import { Y, hasPendingUpdates, type YDoc } from './yjs';
import type { Bytes } from './custodyCrypto';

export const REPLACEMENT_SOURCE_EVENTS = 4096;
/** Existing survivors start at the original baseline; replacements start at their own admitted
 * replacement baseline and its authenticated cuts. Neither transport hints nor caller prefix fields
 * can skip writing. The native owner supplies captured journal-inclusive local originals at finish. */
export async function openReplacementSource(input: {
  authority: CheckpointAuthority;
  checkpoint: ContentCheckpoint | ReplacementCheckpoint;
  installed?: { parent: VerifiedMembership; admission: ReplacementCheckpointAdmission };
  history: AdmissionHistory;
  producer: string;
  candidate: string;
  keys: ReadonlyMap<number, Bytes>;
  lifetime: InboundLifetime;
}) {
  const a = structuredClone(input.authority),
    checkpoint = structuredClone(input.checkpoint),
    installed = input.installed
      ? { parent: input.installed.parent, admission: structuredClone(input.installed.admission) }
      : undefined,
    history = input.history,
    parent = historyMembership(history),
    p = membershipState(parent),
    producer = input.producer,
    candidate = input.candidate,
    guard = input.lifetime.assertCurrent.bind(input.lifetime),
    lifetime: InboundLifetime = {
      assertCurrent: guard,
      ...(input.lifetime.now ? { now: input.lifetime.now.bind(input.lifetime) } : {}),
    },
    member = p.certificate.members.find((m) => m.id === producer);
  guard();
  if (
    !member ||
    p.generation < 2 ||
    !p.roster.some((m) => m.id === candidate && m.state === 'pending') ||
    a.base.request.candidate.workspaceId !== p.workspaceId ||
    a.base.request.candidate.lineageId !== p.lineageId
  )
    throw Error('Replacement replay source authority changed');
  const original = historyPublisher(history, a.base.request.candidate.signer);
  if (a.base.receipt.offer.head !== original.first.head)
    throw Error('Replacement source anchor changed');
  historyAuthority(original, { ...original.current, tip: 3, head: a.certification.head });
  if (input.keys.size > 128) throw Error('Too many replacement source keys');
  const keys = new Map<number, Bytes>();
  let doc: YDoc | undefined;
  try {
    for (const [generation, key] of input.keys) {
      if (
        !Number.isSafeInteger(generation) ||
        generation < 1 ||
        generation > p.generation ||
        !(key instanceof Uint8Array) ||
        key.length !== 32
      )
        throw Error('Invalid replacement source key');
      keys.set(generation, key.slice());
    }
    const baselineGeneration = checkpoint.manifest.generation;
    if (!keys.has(baselineGeneration) || !keys.has(p.generation))
      throw Error('Missing replacement source key');
    if (checkpoint.kind === 'replacement-checkpoint') {
      if (
        !installed ||
        checkpoint.manifest.candidate !== producer ||
        checkpoint.manifest.epoch >= p.epoch
      )
        throw Error('Replacement source needs its own admitted baseline');
      historyAuthority(original, {
        ...original.current,
        tip: checkpoint.manifest.epoch,
        head: checkpoint.manifest.epochHead,
      });
      await verifyReplacementCheckpointAdmission(installed.admission, checkpoint, installed.parent);
      guard();
      doc = await openReplacementCheckpoint(
        checkpoint,
        keys.get(baselineGeneration)!,
        installed.parent,
      );
    } else {
      if (installed) throw Error('Original baseline cannot borrow replacement admission');
      doc = await openContentCheckpoint(checkpoint, keys.get(1)!, a);
    }
    guard();
    const baseline = {
        kind: 'content-checkpoint' as const,
        id: await (checkpoint.kind === 'replacement-checkpoint'
          ? replacementCheckpointHash(checkpoint)
          : contentCheckpointHash(checkpoint)),
      },
      cuts = replacementCheckpointHeads(parent),
      contexts = new Map<string, InboundContext>();
    guard();
    for (const before of checkpoint.heads) {
      const cut = cuts.find((c) => c.credentialId === before.credentialId);
      if (
        !cut ||
        before.position > cut.position ||
        (before.position === cut.position && before.link !== cut.link)
      )
        throw Error('Replacement baseline exceeds current accepted coverage');
    }
    for (const cut of cuts) {
      const before = checkpoint.heads.find((h) => h.credentialId === cut.credentialId) ?? {
        position: 0,
        link: '00'.repeat(32),
      };
      // A removed pending candidate never became a publisher. Its authenticated empty cut needs
      // no stream route (and cannot be resolved through the certified-publisher history).
      if (cut.position === 0) continue;
      // A new pending publisher has no certified stream and must still be empty.
      if (p.roster.some((m) => m.id === cut.credentialId && m.state === 'pending')) {
        throw Error('Pending replacement already has writing');
      }
      const publisher = historyPublisher(history, cut.credentialId);
      contexts.set(cut.credentialId, {
        baseline,
        service: { id: p.pin.serviceId, origin: p.pin.origin },
        authority: publisher.current,
        history: publisher,
        creatingCredential: publisher.credential,
        reader: { id: producer, publicKey: member.sPub, active: true },
        publisher: {
          id: publisher.credential,
          publicKey: publisher.signingKey,
          principal: publisher.principal,
          system: true,
          active: true,
        },
        generation: p.generation,
        generationKey: keys.get(p.generation)!,
        retainedGenerationKeys: new Map(
          [...keys].filter(([generation]) => generation < p.generation),
        ),
        prefix: { position: before.position, link: before.link, observedThrough: before.position },
      });
    }
    let busy = false,
      disposed = false,
      events = 0;
    const dispose = () => {
      disposed = true;
      doc?.destroy();
      for (const key of keys.values()) key.fill(0);
      keys.clear();
    };
    const current = () => {
      guard();
      if (disposed) throw Error('Replacement replay is closed');
    };
    const run = async <T>(work: () => Promise<T>): Promise<T> => {
      current();
      if (busy) throw Error('Replacement replay operation is already running');
      busy = true;
      try {
        const value = await work();
        current();
        return value;
      } catch (cause) {
        dispose();
        throw cause;
      } finally {
        busy = false;
      }
    };
    const append = (publisher: string, read: (context: InboundContext) => Promise<InboundResult>) =>
      run(async () => {
        const cut = cuts.find((c) => c.credentialId === publisher),
          context = contexts.get(publisher);
        if (
          !cut ||
          !context ||
          context.prefix.position >= cut.position ||
          events >= REPLACEMENT_SOURCE_EVENTS
        )
          throw Error('Replacement replay is outside its accepted cut');
        const result = await read(context);
        try {
          current();
          if (
            result.kind !== 'received' ||
            result.position !== context.prefix.position + 1 ||
            result.position > cut.position ||
            (result.position === cut.position && result.link !== cut.link)
          )
            throw Error('Replacement replay does not reach the authenticated cut');
          for (const update of result.updates) Y.applyUpdate(doc!, update);
          context.prefix = {
            position: result.position,
            link: result.link,
            observedThrough: result.through,
          };
          events++;
          // Caller may retain this exact verified record to resume after interruption.
          return result.record.slice();
        } finally {
          if (result.kind === 'received' || result.kind === 'conflict') result.record.fill(0);
          if (result.kind === 'received') for (const update of result.updates) update.fill(0);
        }
      });
    return {
      dispose,
      pending() {
        current();
        return cuts
          .filter((cut) => (contexts.get(cut.credentialId)?.prefix.position ?? 0) < cut.position)
          .map((cut) => ({ ...cut, after: contexts.get(cut.credentialId)!.prefix.position }));
      },
      appendPage(publisher: string, request: Bytes, page: Bytes) {
        return append(publisher, (context) => verifyInboundPage(context, request, page, lifetime));
      },
      appendStored(publisher: string, record: Bytes) {
        return append(publisher, (context) => verifyStoredInbound(context, record, lifetime));
      },
      checkpoint(local: YDoc, sign: (bytes: Bytes) => Promise<string>) {
        return run(async () => {
          for (const cut of cuts) {
            const prefix = contexts.get(cut.credentialId)?.prefix ?? {
              position: 0,
              link: '00'.repeat(32),
            };
            if (prefix.position !== cut.position || prefix.link !== cut.link)
              throw Error('Replacement replay is missing accepted writing');
          }
          if (hasPendingUpdates(doc!)) throw Error('Accepted writing has unresolved dependencies');
          return createReplacementCheckpoint(
            doc!,
            local,
            keys.get(p.generation)!,
            parent,
            producer,
            candidate,
            async (bytes) => {
              current();
              const signature = await sign(bytes);
              current();
              return signature;
            },
          );
        });
      },
    };
  } catch (cause) {
    doc?.destroy();
    for (const key of keys.values()) key.fill(0);
    throw cause;
  }
}
