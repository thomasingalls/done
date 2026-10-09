/** Cold, independently authenticated checkpoint source. No local install, publication or deletion. */
import { verifyCheckpointTimeline } from '../../account-protocol/checkpointTimeline';
import { historyMembership, historyPublisher } from '../../account-protocol/admissionHistory';
import { membershipState } from '../../account-protocol/membership';
import { verifyReceipt, same } from '../../account-protocol/admission';
import { verifyBindingProof, type BindingProof } from '../../account-protocol/slot';
import { checkpointAAD, GENESIS_LIMIT } from '../../account-protocol/genesis';
import {
  parseHistorySources,
  historySourceHash,
  requireHistorySourcesExtend,
} from '../../account-protocol/historySources';
import {
  verifyHistoryHeads,
  verifyHistoryCheckpointAdmission,
  historyCheckpointHash,
  type HistoryCheckpoint,
  type HistoryCheckpointAdmission,
} from '../../account-protocol/historyCheckpoint';
import {
  historyExchangeMessage,
  parseHistoryExchange,
  verifyHistoryCheckpointPage,
  type HistoryExchange,
} from '../../account-protocol/historyExchange';
import {
  encodeInboundRequest,
  inboundRequestMessage,
} from '../../account-protocol/inboundTransport';
import { openContentCheckpoint } from './contentCheckpoint';
import { openReplacementCheckpoint } from './replacementCheckpoint';
import {
  verifyReplacementCheckpointAdmission,
  replacementCheckpointHash,
  type ReplacementCheckpoint,
  type ReplacementCheckpointAdmission,
} from '../../account-protocol/replacementCheckpoint';
import { openRecoveryReading, type RecoveryReading } from './recoveryReading';
import { openHistoryCheckpoint } from './historyCheckpoint';
import { verifyInboundPage, type InboundContext, type InboundLifetime } from './accountInbound';
import { fields, hkdf, hex, random, type Bytes } from './custodyCrypto';
import { unhex } from '../../account-protocol/recovery';
import { Y, genesisCoverage, genesisCoverageParts, hasPendingUpdates, type YDoc } from './yjs';
import { actors } from './promotionGenesis';
export const HISTORY_REPLAY_EVENTS = 4096;
export const HISTORY_REPLAY_BYTES = 64 * 1024 * 1024;
export interface HistorySourceInput {
  base: Parameters<typeof verifyCheckpointTimeline>[0];
  proofs: Parameters<typeof verifyCheckpointTimeline>[1];
  earlySuccessor?: unknown;
  binding: BindingProof;
  producer: string;
  keys: ReadonlyMap<number, Bytes>;
  heads: HistoryCheckpoint['heads'];
  sources: HistoryCheckpoint['sources'];
  previous: { checkpoint: HistoryCheckpoint; admission: HistoryCheckpointAdmission } | null;
  recovery?: RecoveryReading;
  replacement?: { checkpoint: ReplacementCheckpoint; admission: ReplacementCheckpointAdmission };
  lifetime: InboundLifetime;
  sign(message: Bytes): Promise<string>;
  read(request: Bytes): Promise<Bytes>;
  exchange(request: HistoryExchange): Promise<unknown>;
}
/** Returns a caller-owned doc only after every source and cut verifies. All failures erase key/plain buffers.
 * A recovery baseline substitutes for unavailable old openers only with signed exact coverage. */
export async function readHistorySource(input: HistorySourceInput): Promise<YDoc> {
  const base = structuredClone(input.base),
    proofs = structuredClone(input.proofs),
    early = structuredClone(input.earlySuccessor ?? null),
    binding = structuredClone(input.binding),
    previous = structuredClone(input.previous),
    recovery = structuredClone(input.recovery),
    replacement = structuredClone(input.replacement),
    sources = parseHistorySources(input.sources),
    requestedHeads = structuredClone(input.heads),
    producer = input.producer,
    sign = input.sign.bind(input),
    read = input.read.bind(input),
    exchange = input.exchange.bind(input),
    lifetime: InboundLifetime = {
      assertCurrent: input.lifetime.assertCurrent.bind(input.lifetime),
      ...(input.lifetime.now ? { now: input.lifetime.now.bind(input.lifetime) } : {}),
    },
    guard = () => lifetime.assertCurrent();
  guard();
  const keys = new Map<number, Bytes>();
  let doc: YDoc | undefined;
  let consumedBytes = 0;
  const addBytes = (n: number) => {
    consumedBytes += n;
    if (consumedBytes > HISTORY_REPLAY_BYTES) throw Error('History replay exceeds its byte bound');
  };
  try {
    if (input.keys.size > 128) throw Error('Too many history openers');
    for (const [generation, key] of input.keys) {
      if (
        !Number.isSafeInteger(generation) ||
        generation < 1 ||
        !(key instanceof Uint8Array) ||
        key.length !== 32
      )
        throw Error('Invalid history opener');
      keys.set(generation, key.slice());
    }
    const timeline = await verifyCheckpointTimeline(base, proofs, early),
      history = timeline.history,
      authority = historyMembership(history),
      p = membershipState(authority),
      member = p.certificate.members.find((m) => m.id === producer),
      cuts = verifyHistoryHeads(requestedHeads, authority);
    if (!member || !keys.has(p.generation) || [...keys.keys()].some((g) => g > p.generation))
      throw Error('History replay requires a current certified owner and its installed key');
    await verifyBindingProof(binding, base.request, base.receipt, base.pin);
    guard();
    const at = (epoch: number, head: string) => {
      const h = timeline.states.get(epoch);
      if (!h || h.current.head !== head) throw Error('History source has unknown membership');
      return historyMembership(h);
    };
    let baselineHeads: HistoryCheckpoint['heads'] = [],
      coveredSources: HistoryCheckpoint['sources'] = [],
      baselineKind: InboundContext['baseline']['kind'] = 'promotion-genesis',
      id = base.receipt.offer.epoch.requestDigest;
    const originalAuthority = {
      base,
      successor: timeline.proofs?.successor ?? null,
      certification: timeline.proofs?.certification ?? null,
    };
    if (previous) {
      const cp = previous.checkpoint;
      const prior = at(cp.manifest.epoch, cp.manifest.epochHead);
      await verifyHistoryCheckpointAdmission(previous.admission, cp, prior);
      requireHistorySourcesExtend(sources, cp.sources);
    }
    if (previous && keys.has(previous.checkpoint.manifest.generation)) {
      const cp = previous.checkpoint,
        prior = at(cp.manifest.epoch, cp.manifest.epochHead);
      const key = keys.get(cp.manifest.generation);
      if (!key) throw Error('This device needs a history snapshot in an available generation');
      doc = await openHistoryCheckpoint(cp, key, prior);
      const snapshot = new Uint8Array(Y.encodeStateAsUpdate(doc));
      try {
        addBytes(snapshot.length);
      } finally {
        snapshot.fill(0);
      }
      baselineHeads = cp.heads;
      coveredSources = cp.sources;
      baselineKind = 'history-checkpoint';
      id = await historyCheckpointHash(cp);
    } else if (recovery) {
      const intent = recovery.successor.epoch.intent,
        key = keys.get(recovery.successor.epoch.generation),
        expected = previous ? await historyCheckpointHash(previous.checkpoint) : '00'.repeat(32);
      if (!key || !intent.sources || (intent.historyCheckpoint ?? '00'.repeat(32)) !== expected)
        throw Error('Recovery baseline does not establish this history checkpoint');
      requireHistorySourcesExtend(intent.sources, previous?.checkpoint.sources ?? []);
      coveredSources = parseHistorySources([
        ...intent.sources,
        {
          epoch: recovery.epoch,
          head: recovery.head,
          kind: 'recovery',
          hash: await historySourceHash('recovery', recovery.checkpoint),
        },
      ]);
      requireHistorySourcesExtend(sources, coveredSources);
      for (const before of previous?.checkpoint.heads ?? []) {
        const cut = intent.heads.find((c) => c.credentialId === before.credentialId);
        if (
          !cut ||
          cut.position < before.position ||
          (cut.position === before.position && cut.link !== before.link)
        )
          throw Error('Recovery baseline omits previous history cuts');
      }
      doc = await openRecoveryReading(recovery, key, originalAuthority, history, producer);
      const bytes = new Uint8Array(Y.encodeStateAsUpdate(doc));
      try {
        addBytes(bytes.length);
      } finally {
        bytes.fill(0);
      }
      baselineHeads = recovery.successor.epoch.heads;
      baselineKind = 'recovery-checkpoint';
      id = recovery.head;
    } else if (replacement) {
      const cp = replacement.checkpoint,
        coverage = cp.history,
        key = keys.get(cp.manifest.generation),
        expected = previous ? await historyCheckpointHash(previous.checkpoint) : '00'.repeat(32),
        parent = at(cp.manifest.epoch, cp.manifest.epochHead),
        certificate = timeline.proofs?.continuations.find(
          (s) => s.epoch.epoch === cp.manifest.epoch + 1,
        );
      if (
        !key ||
        !coverage ||
        coverage.checkpoint !== expected ||
        cp.manifest.candidate !== producer ||
        certificate?.kind !== 'membership-certification' ||
        certificate.epoch.delivery.v !== 3 ||
        certificate.epoch.installation.v !== 3 ||
        certificate.epoch.delivery.checkpointHash !== (await replacementCheckpointHash(cp)) ||
        !same(certificate.epoch.installation.checkpoint, replacement.admission)
      )
        throw Error('Replacement baseline does not establish this history checkpoint');
      await verifyReplacementCheckpointAdmission(replacement.admission, cp, parent);
      requireHistorySourcesExtend(coverage.sources, previous?.checkpoint.sources ?? []);
      coveredSources = parseHistorySources([
        ...coverage.sources,
        {
          epoch: cp.manifest.epoch,
          head: cp.manifest.epochHead,
          kind: 'replacement',
          hash: await historySourceHash('replacement', cp),
        },
      ]);
      requireHistorySourcesExtend(sources, coveredSources);
      for (const before of previous?.checkpoint.heads ?? []) {
        const cut = cp.heads.find((h) => h.credentialId === before.credentialId);
        if (
          !cut ||
          cut.position < before.position ||
          (cut.position === before.position && cut.link !== before.link)
        )
          throw Error('Replacement baseline omits previous history cuts');
      }
      doc = await openReplacementCheckpoint(cp, key, parent);
      const bytes = new Uint8Array(Y.encodeStateAsUpdate(doc));
      try {
        addBytes(bytes.length);
      } finally {
        bytes.fill(0);
      }
      baselineHeads = cp.heads;
      baselineKind = 'content-checkpoint';
      id = await replacementCheckpointHash(cp);
    } else {
      if (previous) throw Error('This device needs a history snapshot in an available generation');
      const key = keys.get(1);
      if (!key) throw Error('The first history snapshot needs an installed native baseline');
      const g = base.request.candidate;
      const plain = new Uint8Array(
        await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: unhex(g.checkpoint.nonce, 12),
            additionalData: checkpointAAD(g),
          },
          await hkdf(
            key,
            unhex(g.checkpoint.salt, 16),
            fields('done/checkpoint/v1', g.workspaceId),
            { name: 'AES-GCM', length: 256 },
            ['decrypt'],
            crypto.subtle,
          ),
          unhex(g.checkpoint.ct, g.checkpoint.ct.length / 2),
        ),
      );
      doc = new Y.Doc({ gc: false });
      try {
        guard();
        addBytes(plain.length);
        if (plain.length > GENESIS_LIMIT) throw Error('History genesis exceeds supported size');
        Y.applyUpdate(doc, plain);
      } finally {
        plain.fill(0);
      }
      if (hasPendingUpdates(doc) || hex(genesisCoverage(doc)) !== g.coverage.snapshot)
        throw Error('History genesis coverage changed');
      const parts = genesisCoverageParts(doc);
      await verifyReceipt(base.receipt, base.request, base.pin, {
        sv: hex(parts.sv),
        ds: hex(parts.ds),
      });
    }
    guard();
    for (const ref of sources) {
      at(ref.epoch, ref.head);
      const proof = timeline.proofs?.continuations.find((p) => p.head === ref.head);
      if (
        ref.kind === 'original'
          ? timeline.proofs?.certification?.head !== ref.head
          : ref.kind === 'replacement'
            ? proof?.kind !== 'membership-admission'
            : proof?.kind !== 'recovery-successor'
      )
        throw Error('History source kind differs from its membership');
      if (coveredSources.some((s) => same(s, ref))) continue;
      const request = parseHistoryExchange({
        v: 1,
        kind: 'history-checkpoint-request',
        workspaceId: p.workspaceId,
        lineageId: p.lineageId,
        epoch: p.epoch,
        head: p.head,
        credentialId: producer,
        nonce: hex(random(32)),
        expiresAt: (lifetime.now?.() ?? Date.now()) + 60000,
        action: 'source',
        payload: ref.head,
        signature: '00'.repeat(64),
      });
      request.signature = await sign(await historyExchangeMessage(request));
      guard();
      const page = await verifyHistoryCheckpointPage(await exchange(request), request, p.pin);
      guard();
      if (
        !same(page.sources, sources) ||
        !same(page.source?.ref, ref) ||
        (await historySourceHash(ref.kind, page.source!.checkpoint)) !== ref.hash
      )
        throw Error('History source inventory changed during replay');
      const cp = page.source!.checkpoint;
      let source: YDoc;
      if (ref.kind === 'original') {
        if (!originalAuthority.successor || !originalAuthority.certification || !keys.has(1))
          throw Error('Original handoff opener is unavailable');
        source = await openContentCheckpoint(cp, keys.get(1)!, {
          base,
          successor: originalAuthority.successor,
          certification: originalAuthority.certification,
        });
      } else if (proof?.kind === 'membership-admission') {
        const a = at(ref.epoch, ref.head),
          key = keys.get(membershipState(a).generation);
        if (!key) throw Error('Replacement handoff opener is unavailable');
        source = await openReplacementCheckpoint(cp, key, a);
      } else if (proof?.kind === 'recovery-successor') {
        const key = keys.get(proof.epoch.generation);
        if (!key) throw Error('Recovery handoff opener is unavailable');
        source = await openRecoveryReading(
          {
            v: 1,
            kind: 'recovery-reading',
            epoch: ref.epoch,
            head: ref.head,
            checkpoint: cp,
            successor: proof,
            binding,
          },
          key,
          originalAuthority,
          history,
          proof.epoch.intent.bootstrap.newCredentialId,
        );
      } else throw Error('Unsupported history source');
      try {
        guard();
        const bytes = new Uint8Array(Y.encodeStateAsUpdate(source));
        try {
          addBytes(bytes.length);
          Y.applyUpdate(doc, bytes);
        } finally {
          bytes.fill(0);
        }
      } finally {
        source.destroy();
      }
    }
    for (const before of baselineHeads) {
      const cut = cuts.find((c) => c.credentialId === before.credentialId);
      if (
        !cut ||
        cut.position < before.position ||
        (cut.position === before.position && cut.link !== before.link)
      )
        throw Error('History baseline exceeds the accepted cuts');
    }
    let events = 0;
    for (const cut of cuts) {
      const before = baselineHeads.find((h) => h.credentialId === cut.credentialId) ?? {
        position: 0,
        link: '00'.repeat(32),
      };
      if (before.position === cut.position) continue;
      const publisher = historyPublisher(history, cut.credentialId);
      const context: InboundContext = {
        baseline: { kind: baselineKind, id },
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
        retainedGenerationKeys: new Map([...keys].filter(([g]) => g < p.generation)),
        prefix: { position: before.position, link: before.link, observedThrough: before.position },
      };
      while (context.prefix.position < cut.position) {
        guard();
        if (++events > HISTORY_REPLAY_EVENTS) throw Error('History replay exceeds its event bound');
        const body = {
          serviceId: p.pin.serviceId,
          origin: p.pin.origin,
          workspace: p.workspaceId,
          reader: producer,
          publisher: publisher.credential,
          lineage: p.lineageId,
          head: p.head,
          epoch: p.epoch,
          after: context.prefix.position,
          limit: 1,
          nonce: hex(random(32)),
          expires: (lifetime.now?.() ?? Date.now()) + 30000,
          signature: '00'.repeat(64),
        };
        body.signature = await sign(inboundRequestMessage(body));
        const request = encodeInboundRequest(body);
        let page: Bytes | undefined;
        try {
          guard();
          page = await read(request);
          guard();
          const result = await verifyInboundPage(context, request, page, lifetime);
          try {
            if (
              result.kind !== 'received' ||
              result.position !== context.prefix.position + 1 ||
              result.position > cut.position ||
              (result.position === cut.position && result.link !== cut.link)
            )
              throw Error('History replay does not reach its authenticated cut');
            for (const bytes of result.updates) {
              addBytes(bytes.length);
              Y.applyUpdate(doc, bytes);
            }
            context.prefix = {
              position: result.position,
              link: result.link,
              observedThrough: result.through,
            };
          } finally {
            if (result.kind === 'received' || result.kind === 'conflict') result.record.fill(0);
            if (result.kind === 'received') for (const bytes of result.updates) bytes.fill(0);
          }
        } finally {
          request.fill(0);
          page?.fill(0);
        }
      }
    }
    guard();
    if (hasPendingUpdates(doc)) throw Error('Accepted history has unresolved dependencies');
    actors(doc, p.principalId, producer);
    const result = doc;
    doc = undefined;
    return result;
  } finally {
    doc?.destroy();
    for (const key of keys.values()) key.fill(0);
    keys.clear();
  }
}
