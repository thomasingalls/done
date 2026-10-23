/** Cold recovery replay from the admitted genesis and every accepted publisher stream. */
import { verifyLostRecoveryPrepared } from '../../account-protocol/lostDeviceRecovery';
import {
  verifyRecoveryBootstrap,
  type RecoveryBootstrap,
} from '../../account-protocol/recoveryBootstrap';
import {
  parseRecoveryRead,
  recoveryReadMessage,
  verifyRecoveryReadPage,
  type RecoveryRead,
} from '../../account-protocol/recoveryRead';
import {
  historyPublisher,
  historyGeneration,
  historyEnvelopeRoute,
  verifyHistoryDecision,
} from '../../account-protocol/admissionHistory';
import { verifyReceipt } from '../../account-protocol/admission';
import { decodeNetworkEnvelope, openNetworkEnvelope } from '../../account-protocol/envelope';
import { verifyPositionResponse, ZERO_REFUSAL } from '../../account-protocol/positionDecision';
import { checkpointAAD, generationInfo, GENESIS_LIMIT } from '../../account-protocol/genesis';
import { hex, unhex } from '../../account-protocol/recovery';
import type { AuthorityPin } from '../../account-protocol/authority';
import { withRecoveryKeys } from '../account/recovery';
import { openGeneration } from '../account/generationWrap';
import { fields, hkdf, random, type Bytes } from './custodyCrypto';
import { Y, genesisCoverage, genesisCoverageParts, hasPendingUpdates } from './yjs';
import { actors } from './promotionGenesis';
import { openContentCheckpoint } from './contentCheckpoint';
import { openReplacementCheckpoint } from './replacementCheckpoint';
import { openRecoveryReading } from './recoveryReading';
import { verifyMembershipChain } from '../../account-protocol/membershipLocator';
import { openHistoryCheckpoint } from './historyCheckpoint';
import { verifyCheckpointTimeline } from '../../account-protocol/checkpointTimeline';
import {
  verifyHistoryCheckpointAdmission,
  historyCheckpointHash,
} from '../../account-protocol/historyCheckpoint';
import { historyMembership } from '../../account-protocol/admissionHistory';
import { historySourceHash, parseHistorySources } from '../../account-protocol/historySources';

export const RECOVERY_SOURCE_EVENTS = 4096;
export const RECOVERY_SOURCE_UPDATE_BYTES = 64 * 1024 * 1024;
export interface RecoverySourceOptions {
  prepared: unknown;
  begin: unknown;
  pin: AuthorityPin;
  code: string;
  bootstrap: RecoveryBootstrap;
  sign(bytes: Bytes): Promise<string>;
  read(request: RecoveryRead): Promise<unknown>;
  assertCurrent(): void;
}
/** No local keys, content or membership are installed. Caller must erase the returned snapshot. */
export async function readRecoverySource(input: RecoverySourceOptions) {
  const preparedInput = structuredClone(input.prepared),
    beginInput = structuredClone(input.begin),
    pin = structuredClone(input.pin),
    bootstrap = structuredClone(input.bootstrap),
    code = input.code,
    sign = input.sign.bind(input),
    read = input.read.bind(input),
    guard = input.assertCurrent.bind(input);
  guard();
  const checked = await verifyLostRecoveryPrepared(preparedInput, beginInput, pin),
    proof = await verifyRecoveryBootstrap(bootstrap, checked.context),
    prepared = checked.prepared,
    base = prepared.base,
    original = base.request.candidate;
  guard();
  const keys = new Map<number, Bytes>(),
    doc = new Y.Doc({ gc: false });
  let snapshot: Bytes | undefined;
  try {
    await withRecoveryKeys(checked.context.recovery, code, crypto.subtle, async (wrapping) => {
      guard();
      const wraps = [
        { generation: 1, wrap: original.wraps.find((w) => w.recipient === 'recovery')! },
        ...(prepared.proofs?.continuations ?? []).flatMap((p) =>
          p.kind === 'recovery-successor'
            ? [{ generation: p.epoch.generation, wrap: p.epoch.intent.recoveryWrap }]
            : p.kind === 'membership-rotation'
              ? [{ generation: p.epoch.generation, wrap: p.epoch.rotation.payload.recoveryWrap }]
              : [],
        ),
      ];
      if (wraps.length > 128) throw Error('Too many recovery generations');
      for (const item of wraps) {
        if (keys.has(item.generation)) throw Error('Repeated recovery generation');
        guard();
        const key = await openGeneration(
          item.wrap,
          wrapping,
          unhex(base.request.recovery.rPub, 32),
          generationInfo({ ...original, generation: item.generation }),
        );
        keys.set(item.generation, key);
        guard();
      }
    });
    const historyRequest = parseRecoveryRead({
      retryKey: (beginInput as { retryKey: string }).retryKey,
      attemptId: prepared.challenge.context.attemptId,
      bootstrap: proof,
      publisher: original.signer,
      after: 0,
      limit: 1,
      history: 'latest',
      nonce: hex(random(32)),
      signature: '00'.repeat(64),
    });
    historyRequest.signature = await sign(await recoveryReadMessage(historyRequest));
    guard();
    const historyPage = await verifyRecoveryReadPage(
      await read(historyRequest),
      historyRequest,
      pin,
    );
    guard();
    const baseline = historyPage.history;
    const sources = structuredClone(baseline?.checkpoint.sources ?? []);
    let checkpointBytes = 0;
    if (baseline) {
      const cp = baseline.checkpoint;
      const timeline = await verifyCheckpointTimeline(base, prepared.proofs);
      const at = timeline.states.get(cp.manifest.epoch);
      if (!at) throw Error('Recovery history baseline has unknown membership');
      const authority = historyMembership(at);
      await verifyHistoryCheckpointAdmission(baseline.admission, cp, authority);
      const key = keys.get(cp.manifest.generation);
      if (!key) throw Error('Recovery history opener is unavailable');
      const recovered = await openHistoryCheckpoint(cp, key, authority);
      try {
        const bytes = new Uint8Array(Y.encodeStateAsUpdate(recovered));
        try {
          guard();
          checkpointBytes += bytes.length;
          Y.applyUpdate(doc, bytes);
        } finally {
          bytes.fill(0);
        }
      } finally {
        recovered.destroy();
      }
    } else {
      const key = keys.get(1)!;
      const plain = new Uint8Array(
        await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: unhex(original.checkpoint.nonce, 12),
            additionalData: checkpointAAD(original),
          },
          await hkdf(
            key,
            unhex(original.checkpoint.salt, 16),
            fields('done/checkpoint/v1', original.workspaceId),
            { name: 'AES-GCM', length: 256 },
            ['decrypt'],
            crypto.subtle,
          ),
          unhex(original.checkpoint.ct, original.checkpoint.ct.length / 2),
        ),
      );
      try {
        guard();
        if (plain.length > GENESIS_LIMIT) throw Error('Recovery genesis is too large');
        Y.applyUpdate(doc, plain);
      } finally {
        plain.fill(0);
      }
      if (hasPendingUpdates(doc) || hex(genesisCoverage(doc)) !== original.coverage.snapshot)
        throw Error('Recovery genesis coverage changed');
      const parts = genesisCoverageParts(doc);
      await verifyReceipt(base.receipt, base.request, pin, {
        sv: hex(parts.sv),
        ds: hex(parts.ds),
      });
    }
    // A handoff snapshot can contain durable originals never published as ledger updates.
    // Merge every retained snapshot as well as every accepted stream; Yjs replay is idempotent.
    const proofs = prepared.proofs;
    const targets = [
      ...(proofs?.certification ? [proofs.certification.head] : []),
      ...(proofs?.continuations ?? [])
        .filter((p) => p.kind === 'recovery-successor' || p.kind === 'membership-admission')
        .map((p) => p.head),
    ];
    for (const head of targets) {
      if (baseline?.checkpoint.sources.some((source) => source.head === head)) continue;
      guard();
      const request = parseRecoveryRead({
        retryKey: (beginInput as { retryKey: string }).retryKey,
        attemptId: prepared.challenge.context.attemptId,
        bootstrap: proof,
        publisher: original.signer,
        after: 0,
        limit: 1,
        checkpoint: head,
        nonce: hex(random(32)),
        signature: '00'.repeat(64),
      });
      request.signature = await sign(await recoveryReadMessage(request));
      const page = await verifyRecoveryReadPage(await read(request), request, pin);
      guard();
      const c = page.checkpoint;
      const index = proofs!.continuations.findIndex((p) => p.head === head);
      const successor = proofs!.continuations[index];
      if (!c) {
        if (successor?.kind === 'recovery-successor')
          throw Error('Committed recovery checkpoint is missing');
        // Original/replacement publication can still be unfinished. Signed absence is fenced by
        // the service preparation: a later publication requires fresh recovery preparation.
        continue;
      }
      let recovered;
      if (proofs!.certification?.head === head) {
        recovered = await openContentCheckpoint(c, keys.get(1)!, {
          base,
          successor: proofs!.successor!,
          certification: proofs!.certification,
        });
      } else if (successor?.kind === 'membership-admission') {
        const parent = await verifyMembershipChain(
          { ...proofs!, continuations: proofs!.continuations.slice(0, index + 1) },
          base,
        );
        recovered = await openReplacementCheckpoint(
          c,
          keys.get(historyGeneration(parent.history))!,
          historyMembership(parent.history),
        );
      } else if (successor?.kind === 'recovery-successor') {
        if (!prepared.binding || !checked.history)
          throw Error('Recovery checkpoint binding is missing');
        recovered = await openRecoveryReading(
          {
            v: 1,
            kind: 'recovery-reading',
            epoch: successor.epoch.epoch,
            head,
            checkpoint: c,
            successor,
            binding: prepared.binding,
          },
          keys.get(successor.epoch.generation)!,
          { base, successor: proofs!.successor, certification: proofs!.certification },
          checked.history,
          successor.epoch.intent.bootstrap.newCredentialId,
        );
      } else throw Error('Unexpected recovery checkpoint');
      try {
        const kind =
          proofs!.certification?.head === head
            ? ('original' as const)
            : successor!.kind === 'membership-admission'
              ? ('replacement' as const)
              : ('recovery' as const);
        sources.push({
          epoch: kind === 'original' ? 3 : successor!.epoch.epoch,
          head,
          kind,
          hash: await historySourceHash(kind, c),
        });
        const update = new Uint8Array(Y.encodeStateAsUpdate(recovered));
        try {
          checkpointBytes += update.length;
          if (checkpointBytes > RECOVERY_SOURCE_UPDATE_BYTES)
            throw Error('Recovery checkpoints exceed supported bounds');
          guard();
          Y.applyUpdate(doc, update);
        } finally {
          update.fill(0);
        }
      } finally {
        recovered.destroy();
      }
    }
    const publishers = new Set([original.signer]);
    for (const m of prepared.proofs?.certification?.epoch.delivery.certificate.members ?? [])
      publishers.add(m.id);
    for (const p of prepared.proofs?.continuations ?? [])
      if (p.kind === 'recovery-successor') publishers.add(p.epoch.intent.bootstrap.newCredentialId);
      else if (p.kind === 'membership-certification')
        for (const m of p.epoch.delivery.certificate.members) publishers.add(m.id);
    const heads: { credentialId: string; position: number; link: string }[] = [];
    let events = 0,
      updateBytes = 0;
    for (const publisher of [...publishers].sort()) {
      const history = checked.history ? historyPublisher(checked.history, publisher) : null;
      const current = history?.current ?? {
        workspace: original.workspaceId,
        lineage: original.lineageId,
        head: base.receipt.offer.head,
        tip: 1,
        acceptanceKey: base.receipt.offer.epoch.acceptancePublicKey,
      };
      const signing = await crypto.subtle.importKey(
        'raw',
        unhex(history?.signingKey ?? base.request.certification.members[0].sPub, 32),
        'Ed25519',
        false,
        ['verify'],
      );
      const cut = baseline?.checkpoint.heads.find((h) => h.credentialId === publisher);
      let position = cut?.position ?? 0,
        link = cut?.link ?? ZERO_REFUSAL,
        observed = position;
      do {
        guard();
        const request = parseRecoveryRead({
          retryKey: (beginInput as { retryKey: string }).retryKey,
          attemptId: prepared.challenge.context.attemptId,
          bootstrap: proof,
          publisher,
          after: position,
          limit: 16,
          nonce: hex(random(32)),
          signature: '00'.repeat(64),
        });
        request.signature = await sign(await recoveryReadMessage(request));
        guard();
        const page = await verifyRecoveryReadPage(
          await read(structuredClone(request)),
          request,
          pin,
        );
        guard();
        if (page.through < observed) throw Error('Recovery accepted prefix regressed');
        observed = page.through;
        for (const entry of page.entries) {
          if (++events > RECOVERY_SOURCE_EVENTS)
            throw Error('Recovery history exceeds supported bounds');
          const envelope = unhex(entry.envelope, entry.envelope.length / 2),
            e = decodeNetworkEnvelope(envelope);
          if (
            e.v !== 2 ||
            e.workspace_id !== original.workspaceId ||
            e.credential_id !== publisher ||
            e.seq !== position + 1
          )
            throw Error('Recovery publisher sequence changed');
          const expected = {
            workspace: original.workspaceId,
            credential: publisher,
            position: e.seq,
            epoch: e.epoch,
            digest: hex(e.digest),
            parent: ZERO_REFUSAL,
            previous: link,
          };
          const decisionBytes = unhex(entry.proof, entry.proof.length / 2);
          const decision = history
            ? await verifyHistoryDecision(decisionBytes, expected, current, history)
            : await verifyPositionResponse(decisionBytes, expected, current);
          guard();
          if (decision.kind !== 'accepted' || decision.head.final)
            throw Error('Recovery acceptance is unverified');
          const currentRoute = {
            v: 2 as const,
            workspace_id: original.workspaceId,
            credential_id: publisher,
            epoch: current.tip,
            gen: history ? historyGeneration(history) : 1,
          };
          const route = history
            ? historyEnvelopeRoute(history, currentRoute, e.epoch)
            : currentRoute;
          const opener = keys.get(route.gen);
          if (!opener) throw Error('Recovery generation is missing');
          const body = await openNetworkEnvelope(envelope, route, signing, opener);
          try {
            guard();
            if (
              !(
                (body.actor_kind === 'human' && body.actor_id === original.principalId) ||
                (body.actor_kind === 'system' &&
                  body.actor_id === 'system' &&
                  original.actors.some((a) => a.kind === 'system'))
              )
            )
              throw Error('Recovery actor is not certified');
            for (const update of body.updates) {
              updateBytes += update.length;
              if (updateBytes > RECOVERY_SOURCE_UPDATE_BYTES)
                throw Error('Recovery updates exceed supported bounds');
              Y.applyUpdate(doc, update);
            }
          } finally {
            for (const update of body.updates) update.fill(0);
          }
          position++;
          link = decision.head.link;
        }
        if (position === page.through && link !== page.link)
          throw Error('Recovery terminal link changed');
      } while (position < observed);
      const required = history?.finalization ?? history?.boundaries.at(-1);
      if (
        required &&
        (position < required.position || (position === required.position && link !== required.link))
      )
        throw Error('Recovery history omits an authenticated cut');
      if (history?.finalization && position !== history.finalization.position)
        throw Error('Finalized recovery prefix changed');
      heads.push({ credentialId: publisher, position, link });
    }
    guard();
    if (hasPendingUpdates(doc)) throw Error('Recovered writing has unresolved dependencies');
    actors(doc, original.principalId, original.signer);
    snapshot = new Uint8Array(Y.encodeStateAsUpdate(doc));
    if (snapshot.length > GENESIS_LIMIT)
      throw Error('Recovered writing exceeds supported checkpoint size');
    const result = {
      snapshot,
      historyCheckpoint: baseline ? await historyCheckpointHash(baseline.checkpoint) : null,
      sources: parseHistorySources(sources.sort((a, b) => a.epoch - b.epoch)),
      heads,
      epoch: prepared.head.epoch,
      head: prepared.head.head,
      generation: checked.history ? historyGeneration(checked.history) : 1,
    };
    snapshot = undefined;
    return result;
  } finally {
    snapshot?.fill(0);
    for (const key of keys.values()) key.fill(0);
    doc.destroy();
  }
}
