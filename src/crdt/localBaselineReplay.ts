/** Experimental pure reader/builder. No IndexedDB, journal, install, deletion or live-owner wiring. */
import { decodeNetworkEnvelope, openNetworkEnvelope } from '../../account-protocol/envelope';
import { decodePositionResponse, ZERO_REFUSAL } from '../../account-protocol/positionDecision';
import { unhex } from '../../account-protocol/recovery';
import { type InboundContext, type InboundLifetime } from './accountInbound';
import {
  membershipEventEpoch,
  verifyInstalledMembership,
  type InstalledMembership,
} from './accountMembership';
import { verifyInstalledSuccessor, type InstalledSuccessor } from './accountSuccessor';
import {
  baselineAuthorityState,
  baselineScope,
  verifyBaselineAuthority,
} from './localBaselineAuthority';
import { RetiredHistoryRequired } from './retainedHistory';
import { advanceSelfReceive } from './accountSyncState';
import {
  parseCounter,
  sameSpoolWitness,
  type ContentCounter,
  type ContentIdentity,
  type OpenedRecord,
} from './contentRecord';
import { guardedSubtle, hex, type Bytes } from './custodyCrypto';
import {
  emptyDelivery,
  verifyDelivery,
  verifyDeliveryDecision,
  publicationState,
} from './deliveryRecord';
import { generationKey } from './generationKeys';
import { verifyHistoryInstall } from './historyInstall';
import {
  emptyInbound,
  inspectInbound,
  publisherContext,
  verifyInboundCoverage,
  verifyInboundLedger,
} from './inboundLedger';
import {
  baselineAuthenticationPayload,
  decodeLocalBaseline,
  encodeLocalBaseline,
  type BaselineAnchor,
  type BaselineReceipt,
  type LocalBaseline,
} from './localBaselineRecord';
import { decodeSourceCapsule, eraseCapsule, type CaptureRoute } from './sourceCapture';
import {
  positionSources,
  verifySpool,
  verifySpoolWitness,
  networkRoute,
  type SpoolReplayStart,
} from './spoolRecord';
import { copyRecords, sameBytes } from './verifiedRecords';
import { Y, hasPendingUpdates } from './yjs';

export interface LocalBaselineContext extends InboundLifetime {
  identity: ContentIdentity;
  route: CaptureRoute;
  inbound: InboundContext;
  signer: CryptoKey;
  /** Custody-verified evidence, supplied by the owner, never learned from baseline bytes. */
  installation:
    | { kind: 'original'; successor?: InstalledSuccessor; membership?: InstalledMembership }
    | { kind: 'joined'; initialEpoch: number; membership?: InstalledMembership };
}
export interface BaselineAuthentication {
  sign(payload: Bytes): Promise<Bytes>;
  verify(payload: Bytes, mac: Bytes): Promise<boolean>;
}
export interface AuthenticatedLocalBaseline {
  payload: Bytes;
  mac: Bytes;
}
export interface LocalReplayInput {
  /** Detached, authenticated opened rows and counter from one settled owner census. */
  records: readonly OpenedRecord[];
  counter: ContentCounter;
}
export class LocalBaselineError extends Error {
  constructor(readonly reason: 'scope' | 'integrity' | 'ineligible' | 'history-required') {
    super('Local baseline refused: ' + reason);
  }
}
function refuse(reason: LocalBaselineError['reason']): never {
  throw new LocalBaselineError(reason);
}
const hash = async (bytes: Bytes) =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;
function captureContext(c: LocalBaselineContext): LocalBaselineContext {
  c.assertCurrent();
  const b = c.inbound;
  // Joined custody keeps local IDs; its authenticated installation bridges them to the account.
  // Both scopes are bound in baselineScope, rather than assuming the IDs are equal.
  if (
    (c.installation.kind === 'original' &&
      (c.identity.workspaceId !== c.route.workspace ||
        c.identity.principalId !== c.route.principal)) ||
    b.authority.workspace !== c.route.workspace ||
    b.publisher.id !== c.route.credential ||
    b.publisher.principal !== c.route.principal ||
    b.authority.tip !== c.route.epoch ||
    b.generation !== c.route.generation ||
    b.history !== c.route.history ||
    !b.reader.active ||
    !b.publisher.active
  )
    refuse('scope');
  // Protocol histories are immutable verifier-owned capabilities; do not structuredClone those.
  return {
    ...c,
    identity: { ...c.identity },
    route: { ...c.route },
    installation: structuredClone(c.installation),
    inbound: {
      ...b,
      baseline: { ...b.baseline },
      authority: { ...b.authority },
      service: { ...b.service },
      reader: { ...b.reader },
      publisher: { ...b.publisher },
      prefix: { ...b.prefix },
      generationKey: b.generationKey.slice(),
      ...(b.baselineHeads ? { baselineHeads: b.baselineHeads.map((h) => ({ ...h })) } : {}),
      ...(b.retainedGenerationKeys
        ? {
            retainedGenerationKeys: new Map(
              [...b.retainedGenerationKeys].map(([g, k]) => [g, k.slice()]),
            ),
          }
        : {}),
    },
  };
}
function clearContext(c: LocalBaselineContext) {
  c.inbound.generationKey.fill(0);
  for (const k of c.inbound.retainedGenerationKeys?.values() ?? []) k.fill(0);
}
const keys = (c: LocalBaselineContext) =>
  new Map([
    ...(c.inbound.retainedGenerationKeys ?? []),
    [c.inbound.generation, c.inbound.generationKey],
  ]);
function captureInput(input: LocalReplayInput, c: LocalBaselineContext) {
  const counter = parseCounter(input.counter, c.identity, input.counter.intent);
  if (counter.v !== 2) return refuse('ineligible');
  if (counter.active_gen > c.route.generation) return refuse('scope');
  const records = copyRecords(input.records).sort((a, b) => a.seq - b.seq);
  let seq = 0;
  for (const r of records) {
    if (
      !Number.isSafeInteger(r.seq) ||
      r.seq <= seq ||
      r.seq >= counter.next_seq ||
      !Number.isSafeInteger(r.gen) ||
      r.gen < 1 ||
      r.gen > counter.active_gen ||
      !['update', 'state', 'heads', 'outbound'].includes(r.kind)
    )
      refuse('integrity');
    seq = r.seq;
  }
  return { records, counter };
}
function documentState(records: readonly OpenedRecord[], complete: boolean): Bytes {
  const doc = new Y.Doc({ gc: false });
  try {
    for (const r of records)
      if (r.kind === 'update' || r.kind === 'state') Y.applyUpdate(doc, r.bytes);
    if (complete && hasPendingUpdates(doc)) refuse('ineligible');
    return new Uint8Array(Y.encodeStateAsUpdate(doc));
  } finally {
    doc.destroy();
  }
}
async function full(input: ReturnType<typeof captureInput>, c: LocalBaselineContext) {
  const subtle = guardedSubtle(c.assertCurrent),
    { route, inbound: base } = c;
  const census = inspectInbound(input.records, route, base);
  await verifySpoolWitness(census.delivery.spool, input.counter, subtle);
  if (c.installation.kind === 'original')
    await verifyInstalledSuccessor(
      census.delivery.spool,
      route,
      c.installation.successor,
      subtle,
      undefined,
      c.installation.membership,
    );
  else if (c.installation.membership) {
    if (!route.history) refuse('scope');
    await verifyInstalledMembership(
      census.delivery.spool,
      route.history!,
      c.installation.membership,
      c.installation.initialEpoch,
      subtle,
    );
  } else {
    if (
      !route.history ||
      c.installation.initialEpoch !== route.epoch ||
      census.delivery.spool.events.some((e) => membershipEventEpoch(e) !== route.epoch)
    )
      refuse('scope');
  }
  await verifySpool(census.delivery.spool, route, keys(c), c.signer, subtle);
  const delivery = await verifyDelivery(census.delivery, route, base.authority, c.signer, subtle);
  const inbound = await verifyInboundLedger(census, input.records, base, c);
  advanceSelfReceive(census.delivery, delivery, inbound, route, (u) =>
    verifyInboundCoverage(input.records, u),
  );
  // Every original is durable even if it has not been allocated to a network position yet.
  for (const bytes of census.delivery.spool.sources.values()) {
    const capsule = decodeSourceCapsule(bytes, route);
    try {
      verifyInboundCoverage(
        input.records,
        capsule.sources.map((s) => s.bytes),
      );
    } finally {
      eraseCapsule(capsule);
    }
  }
  c.assertCurrent();
  return { census, delivery, inbound, snapshot: documentState(input.records, false) };
}
export async function replayFullLocalHistory(
  input: LocalReplayInput,
  context: LocalBaselineContext,
) {
  const c = captureContext(context);
  try {
    return await full(captureInput(input, c), c);
  } finally {
    clearContext(c);
  }
}
/** Only a settled cut is summarized. Unallocated sources survive; open positions stay in the suffix. */
export async function prepareLocalBaseline(
  input: LocalReplayInput,
  context: LocalBaselineContext,
  auth: BaselineAuthentication,
  previous: BaselineAnchor | null = null,
): Promise<{ baseline: AuthenticatedLocalBaseline; anchor: BaselineAnchor }> {
  const c = captureContext(context);
  previous = previous && { ...previous };
  try {
    const captured = captureInput(input, c);
    const verified = await full(captured, c),
      spool = verified.census.delivery.spool;
    if (
      publicationState(verified.delivery) !== 'ready' ||
      verified.delivery.acceptedThrough !== spool.positions.length ||
      verified.inbound.conflict ||
      [...(verified.inbound.peers?.values() ?? [])].some((s) => s.conflict)
    )
      refuse('ineligible');
    const snapshot = documentState(captured.records, true);
    const used = new Map<string, number[]>();
    for (const p of spool.positions)
      for (const ref of positionSources(p)) {
        const indices = used.get(ref.id) ?? [];
        indices.push(ref.index);
        used.set(ref.id, indices);
      }
    const sources: LocalBaseline['sources'] = [];
    for (const [id, bytes] of spool.sources) {
      const capsule = decodeSourceCapsule(bytes, c.route);
      try {
        const consumed = (used.get(id) ?? []).sort((a, b) => a - b);
        if (consumed.length < capsule.sources.length) {
          const record = spool.sourceRecords.find(
            (r) => r.kind === 'outbound' && sameBytes(r.bytes, bytes),
          )!;
          sources.push({ record, consumed });
        }
      } finally {
        eraseCapsule(capsule);
      }
    }
    const n = verified.delivery.acceptedThrough;
    const ownReceipt = verified.inbound.retained.get(n) ?? null;
    if (n && !ownReceipt) refuse('integrity');
    const streams: LocalBaseline['streams'] = [
      [c.route.credential, verified.inbound] as const,
      ...(verified.inbound.peers ?? []),
    ]
      .map(([publisher, s]) => ({
        publisher,
        ...s.prefix,
        startingPoint: s.startingPoint ?? null,
        receipt: s.retained.get(s.prefix.position) ?? null,
      }))
      .sort((a, b) => a.publisher.localeCompare(b.publisher));
    const b: LocalBaseline = {
      identity: c.identity,
      generation: captured.counter.active_gen,
      revision: (previous?.revision ?? 0) + 1,
      predecessor: previous?.hash ?? ZERO_REFUSAL,
      authority: await baselineScope(c),
      authorityState: await baselineAuthorityState(c),
      cut: {
        intent: captured.counter.intent,
        sequence: captured.records.at(-1)?.seq ?? 0,
        nextSequence: captured.counter.next_seq,
        reserved: Object.entries(captured.counter.reserved)
          .map(([g, n]) => [Number(g), n])
          .sort((a, b) => a[0]! - b[0]!) as [number, number][],
        witness: captured.counter.spool,
      },
      snapshot,
      own: { position: n, link: ZERO_REFUSAL, attempts: spool.attempts, receipt: ownReceipt },
      sources: sources.sort((a, b) => a.record.seq - b.record.seq),
      streams,
      history: verified.census.installations.at(-1)?.record ?? null,
    };
    // Derive the own head from its signed acceptance, never from an incidental receive cursor.
    if (ownReceipt) {
      const decision = decodePositionResponse(ownReceipt.proof);
      if (decision.kind !== 'accepted' || decision.head.position !== n) refuse('integrity');
      b.own.link = decision.head.link;
    }
    const payload = encodeLocalBaseline(b),
      message = baselineAuthenticationPayload(payload);
    try {
      const mac = (await auth.sign(message)).slice();
      if (mac.length !== 32 || !(await auth.verify(message, mac))) refuse('integrity');
      const anchor = { revision: b.revision, hash: await hash(payload) };
      // A valid full history need not have a representable compact frontier (for example,
      // several non-dominated checkpoint cuts). Never return a candidate that cannot reopen.
      const checked = await replayLocalBaseline(
        { payload, mac },
        anchor,
        { records: [], counter: captured.counter },
        c,
        auth,
      );
      const streams = (s: typeof verified.inbound) =>
        JSON.stringify(
          canonical([
            [c.route.credential, s.prefix, s.startingPoint ?? null, s.conflict],
            ...[...(s.peers ?? [])]
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .map(([id, p]) => [id, p.prefix, p.startingPoint ?? null, p.conflict]),
            s.installedHistory ?? null,
          ]),
        );
      if (
        !sameBytes(checked.snapshot, verified.snapshot) ||
        checked.delivery.acceptedThrough !== verified.delivery.acceptedThrough ||
        checked.census.delivery.spool.attempts !== spool.attempts ||
        streams(checked.inbound) !== streams(verified.inbound)
      )
        refuse('integrity');
      c.assertCurrent();
      return { baseline: { payload, mac }, anchor };
    } finally {
      message.fill(0);
    }
  } finally {
    clearContext(c);
  }
}
async function verifyReceipt(
  receipt: BaselineReceipt,
  publisher: string,
  position: number,
  link: string,
  records: readonly OpenedRecord[],
  c: LocalBaselineContext,
) {
  const base = publisherContext(c.inbound, publisher),
    envelope = decodeNetworkEnvelope(receipt.envelope);
  if (envelope.credential_id !== publisher || envelope.seq !== position) refuse('integrity');
  const route: CaptureRoute = {
    workspace: base.authority.workspace,
    credential: publisher,
    principal: base.publisher.principal,
    epoch: base.authority.tip,
    generation: base.generation,
    ...(base.history ? { history: base.history } : {}),
  };
  const proof = decodePositionResponse(receipt.proof);
  if (proof.kind !== 'accepted' || proof.head.position !== position || proof.head.link !== link)
    refuse('integrity');
  const evidence = await verifyDeliveryDecision(
    receipt.proof,
    {
      workspace: route.workspace,
      credential: publisher,
      position,
      epoch: envelope.epoch,
      digest: hex(envelope.digest),
      previous: receipt.previous,
      parent: ZERO_REFUSAL,
    },
    base.authority,
    route,
    guardedSubtle(c.assertCurrent),
  );
  if (evidence.kind !== 'accepted') refuse('integrity');
  const signer = await guardedSubtle(c.assertCurrent).importKey(
    'raw',
    unhex(base.publisher.publicKey, 32),
    'Ed25519',
    false,
    ['verify'],
  );
  const body = await openNetworkEnvelope(
    receipt.envelope,
    networkRoute(route, envelope.epoch),
    signer,
    generationKey(keys(c), envelope.gen),
    guardedSubtle(c.assertCurrent),
  );
  try {
    if (
      !(body.actor_kind === 'human' && body.actor_id === base.publisher.principal) &&
      !(body.actor_kind === 'system' && body.actor_id === 'system' && base.publisher.system)
    )
      refuse('integrity');
    verifyInboundCoverage(records, body.updates);
  } finally {
    for (const u of body.updates) u.fill(0);
  }
}
/** External anchor must come from authenticated owner metadata, never from this blob itself. */
export async function replayLocalBaseline(
  input: AuthenticatedLocalBaseline,
  anchor: BaselineAnchor,
  suffix: LocalReplayInput,
  context: LocalBaselineContext,
  auth: Pick<BaselineAuthentication, 'verify'>,
) {
  const c = captureContext(context);
  let payload: Bytes | undefined, mac: Bytes | undefined;
  try {
    payload = input.payload.slice();
    mac = input.mac.slice();
    anchor = { ...anchor };
    const tail = captureInput(suffix, c);
    const b = decodeLocalBaseline(payload),
      message = baselineAuthenticationPayload(payload);
    try {
      if (mac.length !== 32 || !(await auth.verify(message, mac))) refuse('integrity');
    } finally {
      message.fill(0);
    }
    c.assertCurrent();
    if (anchor.revision !== b.revision || anchor.hash !== (await hash(payload)))
      refuse('integrity');
    if (
      JSON.stringify(canonical(c.identity)) !== JSON.stringify(canonical(b.identity)) ||
      b.authority !== (await baselineScope(c)) ||
      b.cut.intent !== tail.counter.intent ||
      // Local re-encryption advances allocation metadata but preserves this authenticated
      // prefix and its retained opener. Network generations/cuts are proved independently below.
      b.generation > tail.counter.active_gen ||
      tail.counter.next_seq < b.cut.nextSequence ||
      b.cut.reserved.some(([g, n]) => (tail.counter.reserved[g] ?? -1) < n)
    )
      refuse('scope');
    if (tail.records.some((r) => r.seq < b.cut.nextSequence)) refuse('integrity');
    const records = [
      { kind: 'state' as const, seq: 0, gen: b.generation, bytes: b.snapshot },
      ...b.sources.map((s) => s.record),
      ...tail.records,
    ];
    documentState(records.slice(0, 1), true);
    const consumed: SpoolReplayStart['consumed'][number][] = [],
      ids = new Set<string>();
    for (const s of b.sources) {
      const capsule = decodeSourceCapsule(s.record.bytes, c.route);
      try {
        if (
          ids.has(capsule.id) ||
          s.consumed.length >= capsule.sources.length ||
          s.consumed.some((i) => i >= capsule.sources.length)
        )
          refuse('integrity');
        ids.add(capsule.id);
        consumed.push(...s.consumed.map((index) => ({ id: capsule.id, index })));
        verifyInboundCoverage(
          records,
          capsule.sources.map((s) => s.bytes),
        );
      } finally {
        eraseCapsule(capsule);
      }
    }
    const start: SpoolReplayStart = {
      position: b.own.position,
      link: b.own.link,
      attempts: b.own.attempts,
      consumed,
      ...(b.own.receipt ? { receipt: b.own.receipt } : {}),
    };
    const census = inspectInbound(records, c.route, c.inbound, start);
    const witness = await verifyBaselineAuthority(b, census.delivery.spool, c);
    if (!sameSpoolWitness(witness, tail.counter.spool)) refuse('integrity');
    const own = emptyInbound();
    own.peers = new Map();
    let historyHeads: { credentialId: string; position: number; link: string }[] = [];
    if (b.history) {
      const installed = await verifyHistoryInstall(c.inbound, b.history.bytes, undefined, c);
      try {
        verifyInboundCoverage(records, [installed.update]);
        own.installedHistory = installed.installed;
        historyHeads = installed.heads ?? [];
      } finally {
        installed.update.fill(0);
      }
    }
    for (const s of b.streams) {
      const base = publisherContext(c.inbound, s.publisher);
      if (s.receipt) await verifyReceipt(s.receipt, s.publisher, s.position, s.link, records, c);
      else if (s.position) {
        const cut = [...(base.baselineHeads ?? []), ...historyHeads].find(
          (h) => h.credentialId === s.publisher && h.position === s.position && h.link === s.link,
        );
        if (!cut) refuse('integrity');
      }
      const state = s.publisher === c.route.credential ? own : emptyInbound();
      state.retiredThrough = s.position;
      state.prefix = { position: s.position, link: s.link, observedThrough: s.observedThrough };
      if (s.startingPoint) state.startingPoint = { ...s.startingPoint };
      if (s.receipt) state.retained.set(s.position, s.receipt);
      if (s.publisher !== c.route.credential) own.peers.set(s.publisher, state);
    }
    if (
      !b.streams.some(
        (s) =>
          s.publisher === c.route.credential &&
          s.position === b.own.position &&
          s.link === b.own.link,
      )
    )
      refuse('integrity');
    const deliveryStart = emptyDelivery();
    deliveryStart.acceptedThrough = b.own.position;
    if (b.own.receipt) {
      await verifyReceipt(
        b.own.receipt,
        c.route.credential,
        b.own.position,
        b.own.link,
        records,
        c,
      );
      deliveryStart.responses.set(b.own.position, [b.own.receipt.proof]);
    }
    await verifySpool(
      census.delivery.spool,
      c.route,
      keys(c),
      c.signer,
      guardedSubtle(c.assertCurrent),
    );
    const delivery = await verifyDelivery(
      census.delivery,
      c.route,
      c.inbound.authority,
      c.signer,
      guardedSubtle(c.assertCurrent),
      undefined,
      {
        state: deliveryStart,
        spool: { ...census.delivery.spool, positions: [] },
        envelopes: new Map(),
        expected: new Map(),
      },
    );
    const inbound = await verifyInboundLedger(census, records, c.inbound, c, undefined, {
      state: own,
      after: b.cut.sequence,
    });
    advanceSelfReceive(
      census.delivery,
      delivery,
      inbound,
      c.route,
      (u) => verifyInboundCoverage(records, u),
      b.own.position,
    );
    for (const bytes of census.delivery.spool.sources.values()) {
      const capsule = decodeSourceCapsule(bytes, c.route);
      try {
        verifyInboundCoverage(
          records,
          capsule.sources.map((s) => s.bytes),
        );
      } finally {
        eraseCapsule(capsule);
      }
    }
    c.assertCurrent();
    return { census, delivery, inbound, snapshot: documentState(records, false) };
  } catch (e) {
    if (e instanceof RetiredHistoryRequired) refuse('history-required');
    throw e;
  } finally {
    payload?.fill(0);
    mac?.fill(0);
    clearContext(c);
  }
}
