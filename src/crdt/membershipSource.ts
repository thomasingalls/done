/** Read the actual certified slot under its exclusive permit. No editor document or caller key. */
import { readPromotion, withPromotionRoot } from './promotionRecord';
import {
  readJoinedAccount,
  joinedContext,
  joinedKeys,
  joinedInitialGeneration,
} from './joinedAccount';
import { claimScope } from './localGenesisRecord';
import { openActiveRotation, eraseRotationKeys } from './rotationKeys';
import { heldCaptureRoute, verifyInstalledSuccessor } from './accountSuccessor';
import { installedMembershipHistory, verifyInstalledMembership } from './accountMembership';
import { heldInboundContext, inspectInbound, verifyInboundLedger } from './inboundLedger';
import { verifySpool, verifySpoolWitness } from './spoolRecord';
import { verifyDelivery } from './deliveryRecord';
import { verifySyncState } from './accountSyncState';
import { withRecoveryUnderPermit } from './custody';
import { capturedRecovery } from './sourceCapture';
import { replayRecovery } from './admissionDocument';
import { openEnvelope, openCredential, hex, random, type Bytes } from './custodyCrypto';
import { Y } from './yjs';
import { verifyReplacementReading, membershipReadingBinding } from './membershipReading';
import type { BindingProof } from '../../account-protocol/slot';
import { verifyEarlyHistory } from '../../account-protocol/admissionHistory';
import type { openReplacementSource } from './replacementSource';
import { same } from '../../account-protocol/admission';
import {
  verifyMembershipChain,
  type parseMembershipChain,
} from '../../account-protocol/membershipLocator';
import {
  historyAuthority,
  historyMembership,
  historyGeneration,
} from '../../account-protocol/admissionHistory';
import { membershipState, type VerifiedMembership } from '../../account-protocol/membership';
import { readHistorySource } from './historySource';
import { createReplacementCheckpoint } from './replacementCheckpoint';
import { replacementCheckpointHeads } from '../../account-protocol/replacementCheckpoint';
import { historyCheckpointHash } from '../../account-protocol/historyCheckpoint';
import {
  parseHistoryExchange,
  historyExchangeMessage,
  HISTORY_EXCHANGE_REQUEST_LIFETIME_MS,
  verifyHistoryCheckpointPage,
  type HistoryExchange,
} from '../../account-protocol/historyExchange';
import type { SuccessorBase } from '../../account-protocol/successor';
import type { SessionTask } from './writeSession';
import { sealGeneration } from '../account/generationWrap';
import { unhex } from '../../account-protocol/recovery';

type Proofs = ReturnType<typeof parseMembershipChain>;
type SourceArgs = { task: SessionTask; kind: 'promotion' | 'joined'; slotId: string; code: string };

export async function withNativeHistorySource<T>(
  input: SourceArgs,
  work: (source: {
    base: SuccessorBase;
    proofs: Proofs | null;
    earlySuccessor: unknown;
    binding: BindingProof;
    history: NonNullable<Awaited<ReturnType<typeof heldCaptureRoute>>['history']>;
    keys: ReadonlyMap<number, Bytes>;
    generation: number;
    producer: string;
    sign(bytes: Bytes): Promise<string>;
    snapshot: Parameters<typeof openReplacementSource>[0]['checkpoint'] | null;
    installed?: Parameters<typeof openReplacementSource>[0]['installed'];
    local(): Promise<InstanceType<typeof Y.Doc>>;
    subtle: SubtleCrypto;
  }) => Promise<T>,
) {
  const { task, kind, slotId, code } = input,
    original = kind === 'promotion' ? await readPromotion(task, slotId, code) : null,
    joined = kind === 'joined' ? await readJoinedAccount(task, slotId, code) : null,
    state = (original ?? joined)!;
  if ((original && original.marker?.v !== 9) || (joined && joined.marker?.phase !== 'active'))
    throw Error('History source is not an active account');
  const scope = claimScope(state.claim),
    marker = original?.marker,
    credentials = marker?.credentials ?? state.record.credentials!,
    producer = credentials[1].id,
    membership = marker?.membership ?? joined?.marker?.membership,
    base = original
      ? {
          pin: marker!.pin,
          request: marker!.admission!.request,
          receipt: marker!.admission!.receipt!,
        }
      : joined!.marker!.authority.base;
  return withPromotionRoot(task, state.claim, state.record, code, async (root, subtle) => {
    let first: Bytes | undefined;
    let active: Awaited<ReturnType<typeof openActiveRotation>> = null;
    try {
      first = original
        ? await openEnvelope(scope, root, state.record.envelope!, subtle)
        : await joinedKeys(task, joined!, code, async (key) => key.slice());
      active = await openActiveRotation(scope, root, state.record, subtle, membership?.proofs);
      const initialGeneration = joined?.marker ? joinedInitialGeneration(joined.marker) : 1,
        generation = active?.generation ?? initialGeneration,
        key = active?.key ?? first,
        keys = new Map<number, Bytes>([[initialGeneration, first], ...(active?.previous ?? [])]);
      if (active) keys.set(active.generation, active.key);
      let route, context;
      const initial = joined ? await joinedContext(task, joined, first) : null;
      if (original) {
        route = await heldCaptureRoute(marker!, generation);
        context = await heldInboundContext(marker!, key, subtle, route);
      } else {
        route = initial!.route;
        context = initial!.base;
        if (membership) {
          const history = await installedMembershipHistory(
            membership,
            base,
            route.history!,
            generation,
          );
          route = {
            ...route,
            epoch: history.current.tip,
            generation: historyGeneration(history),
            history,
          };
          context = {
            ...context,
            authority: history.current,
            history,
            generation,
            generationKey: key,
          };
        }
      }
      const history =
        original && route.epoch < 3
          ? await verifyEarlyHistory(base, marker!.successor?.artifact ?? null)
          : route.history!;
      if (
        route.generation !== generation ||
        !history ||
        history.finalization ||
        !membershipState(historyMembership(history)).certificate.members.some(
          (m) =>
            m.id === producer &&
            m.sPub === hex(credentials[1].publicKey) &&
            m.wPub === hex(credentials[0].publicKey),
        )
      )
        throw Error('History source is not a current certified device');
      context.retainedGenerationKeys = new Map([...keys].filter(([g]) => g < generation));
      const publicKey = await subtle.importKey('raw', credentials[1].publicKey, 'Ed25519', false, [
          'verify',
        ]),
        signing = await openCredential(scope, root, credentials[1], subtle),
        guard = () => task.step(() => {});
      return await work({
        base,
        proofs:
          membership?.proofs ??
          (original
            ? marker!.successor?.certification
              ? {
                  successor: marker!.successor.artifact,
                  certification: marker!.successor.certification,
                  continuations: [],
                }
              : null
            : {
                successor: joined!.marker!.authority.successor,
                certification: joined!.marker!.authority.certification,
                continuations:
                  joined!.marker!.v === 1 ? [] : joined!.marker!.authority.continuations,
              }),
        earlySuccessor: original ? (marker!.successor?.artifact ?? null) : null,
        binding: original
          ? marker!.handoff!.binding
          : joined!.marker!.v === 3
            ? joined!.marker!.reading.binding
            : joined!.marker!.v === 2
              ? membershipReadingBinding(joined!.marker!.reading)
              : joined!.marker!.reading.checkpoint.binding,
        history,
        keys,
        generation,
        producer,
        subtle,
        snapshot: original
          ? (marker!.catchup ?? null)
          : joined!.marker!.v === 3
            ? joined!.marker!.reading
            : joined!.marker!.reading.checkpoint,
        ...(joined?.marker?.v === 2 && joined.marker.reading.v === 3
          ? {
              installed: {
                parent: await verifyReplacementReading(
                  joined.marker.reading,
                  joined.marker.authority,
                  initial!.original,
                  { id: producer, sPub: hex(credentials[1].publicKey) },
                ),
                admission: joined.marker.reading.admission,
              },
            }
          : {}),
        sign: async (bytes) => {
          guard();
          const signature = hex(new Uint8Array(await subtle.sign('Ed25519', signing, bytes)));
          guard();
          return signature;
        },
        local: () =>
          withRecoveryUnderPermit(
            task,
            { ...scope, resolvePrincipal: () => scope.principalId },
            code,
            async (recovered) => {
              const census = inspectInbound(recovered.records, route, context),
                recovery = capturedRecovery(
                  { ...recovered, records: census.delivery.spool.sourceRecords },
                  route,
                ),
                doc = new Y.Doc({ gc: false });
              try {
                replayRecovery(doc, recovery);
                return doc;
              } catch (cause) {
                doc.destroy();
                throw cause;
              } finally {
                for (const row of recovery.journal) row.bytes.fill(0);
              }
            },
            {
              allowSpoolCounter: true,
              validate: async (records, _task, counter) => {
                const census = inspectInbound(records, route, context);
                await verifySpoolWitness(census.delivery.spool, counter, subtle);
                await verifySpool(census.delivery.spool, route, keys, publicKey, subtle);
                if (original)
                  await verifyInstalledSuccessor(
                    census.delivery.spool,
                    route,
                    marker!.successor,
                    subtle,
                    undefined,
                    membership,
                  );
                else if (membership)
                  await verifyInstalledMembership(
                    census.delivery.spool,
                    history,
                    membership,
                    initial!.route.epoch,
                    subtle,
                  );
                const delivery = await verifyDelivery(
                    census.delivery,
                    route,
                    context.authority,
                    publicKey,
                    subtle,
                  ),
                  inbound = await verifyInboundLedger(census, records, context, {
                    assertCurrent: guard,
                  });
                verifySyncState(census.delivery, delivery, inbound);
              },
            },
          ),
      });
    } finally {
      first?.fill(0);
      eraseRotationKeys(active);
    }
  });
}

export async function prepareNativeReplacement(
  input: SourceArgs,
  authority: { base: SuccessorBase; proofs: Proofs },
  candidate: string,
  read: (request: Bytes) => Promise<Bytes>,
  exchange: (request: HistoryExchange) => Promise<unknown>,
) {
  const captured = structuredClone(authority);
  return withNativeHistorySource(input, async (source) => {
    if (!source.snapshot || (input.kind === 'promotion' && source.history.current.tip < 3))
      throw Error('Replacement source needs an installed certified baseline');
    if (!same(source.base, captured.base)) throw Error('Replacement source account changed');
    const verified = await verifyMembershipChain(captured.proofs, source.base),
      parent = historyMembership(verified.history),
      p = membershipState(parent);
    historyAuthority(verified.history, source.history.current);
    if (source.generation !== p.generation) throw Error('Replacement key has not been installed');
    const guard = () => input.task.step(() => {});
    const query = parseHistoryExchange({
      v: 1,
      kind: 'history-checkpoint-request',
      workspaceId: p.workspaceId,
      lineageId: p.lineageId,
      epoch: p.epoch,
      head: p.head,
      credentialId: source.producer,
      nonce: hex(random(32)),
      expiresAt: Date.now() + HISTORY_EXCHANGE_REQUEST_LIFETIME_MS,
      action: 'read',
      payload: 'latest',
      signature: '00'.repeat(64),
    });
    query.signature = await source.sign(await historyExchangeMessage(query));
    const page = await verifyHistoryCheckpointPage(await exchange(query), query, p.pin);
    guard();
    if (page.checkpoint && !page.admission) throw Error('Handoff history is not admitted');
    const previous = page.checkpoint
      ? { checkpoint: page.checkpoint, admission: page.admission! }
      : null;
    const accepted = await readHistorySource({
      base: source.base,
      proofs: captured.proofs,
      binding: source.binding,
      producer: source.producer,
      keys: source.keys,
      heads: replacementCheckpointHeads(parent),
      sources: page.sources,
      previous,
      ...(source.snapshot.kind === 'recovery-reading' ? { recovery: source.snapshot } : {}),
      ...(source.snapshot.kind === 'replacement-checkpoint' && source.installed
        ? { replacement: { checkpoint: source.snapshot, admission: source.installed.admission } }
        : {}),
      lifetime: { assertCurrent: guard },
      sign: source.sign,
      read,
      exchange,
    });
    try {
      const local = await source.local();
      try {
        guard();
        return await createReplacementCheckpoint(
          accepted,
          local,
          source.keys.get(p.generation)!,
          parent,
          source.producer,
          candidate,
          source.sign,
          {
            checkpoint: previous
              ? await historyCheckpointHash(previous.checkpoint)
              : '00'.repeat(32),
            sources: page.sources,
          },
        );
      } finally {
        local.destroy();
      }
    } finally {
      accepted.destroy();
    }
  });
}

/** Only the installed key matching the verified approval generation can be released. */
export async function wrapMembershipGeneration(
  input: SourceArgs,
  recipient: string,
  info: Bytes,
  workspace: string,
  membership: VerifiedMembership,
) {
  const p = membershipState(membership);
  return withNativeHistorySource(input, async (source) => {
    if (!source.snapshot || (input.kind === 'promotion' && source.history.current.tip < 3))
      throw Error('Replacement source needs an installed certified baseline');
    const held = membershipState(historyMembership(source.history));
    if (
      workspace !== p.workspaceId ||
      workspace !== held.workspaceId ||
      !same(p.pin, held.pin) ||
      p.lineageId !== held.lineageId ||
      p.generation !== source.generation ||
      p.epoch < held.epoch ||
      !p.roster.some((m) => m.state === 'pending' && m.wPub === recipient) ||
      !p.certificate.members.some(
        (m) => m.id === source.producer && held.certificate.members.some((h) => same(h, m)),
      )
    )
      throw Error('Approved content generation differs from installed custody');
    return sealGeneration(
      unhex(recipient, 32),
      info,
      source.keys.get(source.generation)!,
      source.subtle,
    );
  });
}
