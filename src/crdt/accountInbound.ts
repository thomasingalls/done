import {
  historyAuthority,
  historyGeneration,
  historyReader,
  historyEnvelopeRoute,
  verifyHistoryDecision,
  type AdmissionHistory,
} from '../../account-protocol/admissionHistory';
/** Low-level first-epoch evidence verification, not a receive owner or an authority installer.
 * Context MUST come from authenticated custody/lineage/baseline and retained prefix ownership.
 * Successful values are detached evidence. A future commit must independently recheck current authority.
 */
import { generationKey } from './generationKeys';
import { hex, unhex } from '../../account-protocol/recovery';
import {
  decodeNetworkEnvelope,
  openNetworkEnvelope,
  type EnvelopeBody,
} from '../../account-protocol/envelope';
import {
  captureAuthority,
  verifyPositionResponse,
  ZERO_REFUSAL,
  type Bytes,
  type DecisionAuthority,
} from '../../account-protocol/positionDecision';
import { READ_PAGE_LIMIT, READ_REQUEST_LIMIT } from '../../account-protocol/deliveryTransport';
import {
  checkInboundExtent,
  decodeInboundPage,
  decodeInboundRequest,
  inboundHex,
  inboundInteger,
  inboundPageMessage,
  inboundRequestMessage,
} from '../../account-protocol/inboundTransport';
import {
  encodeInboundRecord,
  decodeInboundRecord,
  INBOUND_ENVELOPE_LIMIT,
  INBOUND_RECORD_LIMIT,
  INBOUND_UPDATE_BYTES,
  INBOUND_UPDATE_LIMIT,
  type InboundRecord,
} from './inboundRecord';
import { MAX_BATCH_BYTES, MAX_BATCH_RECORDS } from './contentRecord';
import { guardedSubtle } from './custodyCrypto';
import { Y } from './yjs';

export interface InboundContext {
  baseline: { kind: 'promotion-genesis' | 'content-checkpoint'; id: string };
  service: { id: string; origin: string };
  authority: DecisionAuthority;
  /** Verified admission-only lineage, supplied by the custody owner. */
  history?: AdmissionHistory;
  creatingCredential: string;
  reader: { id: string; publicKey: string; active: boolean };
  publisher: { id: string; publicKey: string; principal: string; system: boolean; active: boolean };
  generation: number;
  generationKey: Bytes;
  /** Authenticated owner-retained historical openers; never learned from a page. */
  retainedGenerationKeys?: ReadonlyMap<number, Bytes>;
  prefix: { position: number; link: string; observedThrough: number };
  /** Independently retained accepted entry at the queried OLD position, not data from this answer. */
  retained?: { previous: string; envelope: Bytes; proof: Bytes };
}
export interface InboundLifetime {
  /** Synchronous owner assertion, called around crypto and before returning even an empty/duplicate result. */
  assertCurrent(): void;
  now?(): number;
}
export type InboundResult =
  | { readonly kind: 'empty' | 'duplicate'; readonly through: number; readonly position: number }
  | {
      readonly kind: 'received';
      readonly record: Bytes;
      readonly updates: readonly Bytes[];
      readonly actor: Readonly<{ id: string; kind: 'human' | 'system' }>;
      readonly position: number;
      readonly link: string;
      readonly through: number;
    }
  | {
      readonly kind: 'conflict';
      readonly record: Bytes;
      readonly position: number;
      readonly through: number;
    };
export class InboundError extends Error {
  constructor(
    readonly reason:
      | 'authority'
      | 'scope'
      | 'request'
      | 'expired'
      | 'prefix'
      | 'unverified'
      | 'unsupported'
      | 'actor'
      | 'size'
      | 'record',
  ) {
    super('Inbound verification refused: ' + reason);
  }
}
function fail(reason: InboundError['reason']): never {
  throw new InboundError(reason);
}
const captureBytes = (bytes: Bytes, limit: number): Bytes => {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > limit) return fail('size');
  return bytes.slice();
};
function captureContext(input: InboundContext): InboundContext {
  // Validate without copying any key until all other potentially failing fields have been captured.
  const a = captureAuthority(input.authority),
    baseline = { ...input.baseline },
    service = { ...input.service },
    reader = { ...input.reader },
    publisher = { ...input.publisher },
    prefix = { ...input.prefix };
  inboundHex(baseline.id, 32);
  inboundHex(service.id, 16);
  inboundHex(a.workspace, 16);
  for (const member of [reader, publisher]) {
    inboundHex(member.id, 16);
    inboundHex(member.publicKey, 32);
    if (member.active !== true) fail('authority');
  }
  inboundHex(publisher.principal, 16);
  inboundHex(input.creatingCredential, 16);
  if (
    !['promotion-genesis', 'content-checkpoint'].includes(baseline.kind) ||
    (baseline.kind === 'content-checkpoint' && (!input.history || a.tip < 3)) ||
    (!input.history && a.tip !== 1) ||
    (!input.history && input.generation !== 1) ||
    publisher.id !== input.creatingCredential ||
    typeof publisher.system !== 'boolean'
  )
    fail('unsupported');
  if (input.history) {
    const h = input.history;
    historyAuthority(h, a);
    if (input.generation !== historyGeneration(h)) fail('authority');
    if (
      input.creatingCredential !== h.credential ||
      !historyReader(h, reader.id, reader.publicKey, a) ||
      publisher.id !== h.credential ||
      publisher.publicKey !== h.signingKey ||
      publisher.principal !== h.principal
    )
      fail('authority');
  }
  if (typeof service.origin !== 'string' || new URL(service.origin).origin !== service.origin)
    fail('authority');
  inboundInteger(prefix.position);
  inboundInteger(prefix.observedThrough);
  inboundHex(prefix.link, 32);
  if (
    prefix.observedThrough < prefix.position ||
    (prefix.position === 0 && prefix.link !== ZERO_REFUSAL)
  )
    fail('prefix');
  const retained = input.retained
    ? {
        previous: inboundHex(input.retained.previous, 32),
        envelope: captureBytes(input.retained.envelope, INBOUND_ENVELOPE_LIMIT),
        proof: captureBytes(input.retained.proof, 4096),
      }
    : undefined;
  if (!(input.generationKey instanceof Uint8Array) || input.generationKey.length !== 32)
    fail('authority');
  const retainedGenerationKeys = new Map<number, Bytes>();
  const retainedKeys = input.retainedGenerationKeys ?? new Map<number, Bytes>();
  if (retainedKeys.size > 128) fail('authority');
  for (const [generation, key] of retainedKeys) {
    if (
      !Number.isSafeInteger(generation) ||
      generation < 1 ||
      generation >= input.generation ||
      !(key instanceof Uint8Array) ||
      key.length !== 32
    )
      fail('authority');
  }
  for (const [generation, key] of retainedKeys) retainedGenerationKeys.set(generation, key.slice());
  return {
    baseline,
    service,
    authority: a,
    ...(input.history ? { history: input.history } : {}),
    reader,
    publisher,
    creatingCredential: input.creatingCredential,
    generation: input.generation,
    generationKey: input.generationKey.slice(),
    retainedGenerationKeys,
    prefix,
    ...(retained ? { retained } : {}),
  };
}
function validateBody(body: EnvelopeBody, publisher: InboundContext['publisher']): number {
  const actorAllowed =
    (body.actor_kind === 'human' && body.actor_id === publisher.principal) ||
    (body.actor_kind === 'system' && body.actor_id === 'system' && publisher.system);
  if (!actorAllowed) fail('actor');
  const size = body.updates.reduce((n, u) => n + u.length, 0);
  const fits =
    body.updates.length <= INBOUND_UPDATE_LIMIT &&
    body.updates.length + 1 <= MAX_BATCH_RECORDS &&
    size <= INBOUND_UPDATE_BYTES;
  if (!fits) fail('size');
  for (const update of body.updates) Y.decodeUpdate(update);
  return size;
}
async function verify(
  input: InboundContext,
  requestInput: Bytes,
  pageInput: Bytes,
  lifetime: InboundLifetime,
  stored?: Bytes,
): Promise<InboundResult> {
  const assertCurrent = lifetime.assertCurrent.bind(lifetime),
    now = lifetime.now ? lifetime.now.bind(lifetime) : Date.now;
  const guard = () => {
    const result: unknown = assertCurrent();
    if (result !== undefined) fail('authority');
  };
  guard();
  const request = captureBytes(requestInput, READ_REQUEST_LIMIT),
    pageBytes = captureBytes(pageInput, READ_PAGE_LIMIT),
    expectedRecord = stored ? captureBytes(stored, INBOUND_RECORD_LIMIT) : undefined;
  const c = captureContext(input),
    subtle = guardedSubtle(guard);
  let body: EnvelopeBody | undefined,
    transfer = false;
  try {
    const r = decodeInboundRequest(request),
      p = decodeInboundPage(pageBytes),
      a = c.authority;
    if (
      r.serviceId !== c.service.id ||
      r.origin !== c.service.origin ||
      r.workspace !== a.workspace ||
      r.reader !== c.reader.id ||
      r.publisher !== c.publisher.id ||
      r.lineage !== a.lineage ||
      r.head !== a.head ||
      r.epoch !== a.tip
    )
      fail('scope');
    if (r.limit !== 1) fail('unsupported');
    checkInboundExtent(p, r);
    const current = () => {
      guard();
      if (!expectedRecord) {
        const time = now();
        if (!Number.isSafeInteger(time) || time < 0 || r.expires > time + 60000) fail('request');
        if (r.expires <= time) fail('expired');
      }
    };
    current();
    if (p.request !== hex(new Uint8Array(await subtle.digest('SHA-256', request)))) fail('request');
    const readerKey = await subtle.importKey(
      'raw',
      unhex(c.reader.publicKey, 32),
      'Ed25519',
      false,
      ['verify'],
    );
    const readerVerified = await subtle.verify(
      'Ed25519',
      readerKey,
      unhex(r.signature, 64),
      inboundRequestMessage(r),
    );
    if (!readerVerified) fail('unverified');
    const acceptanceKey = await subtle.importKey(
      'raw',
      unhex(a.acceptanceKey, 32),
      'Ed25519',
      false,
      ['verify'],
    );
    const pageVerified = await subtle.verify(
      'Ed25519',
      acceptanceKey,
      unhex(p.signature, 64),
      inboundPageMessage(p),
    );
    if (!pageVerified) fail('unverified');
    if (p.through < c.prefix.observedThrough || r.after > c.prefix.position) fail('prefix');
    if (
      c.history &&
      (a.tip === 1
        ? p.through > c.history.boundary.position
        : p.through < c.history.boundary.position)
    )
      fail('prefix');
    if (!p.entries.length) {
      if (r.after !== c.prefix.position || expectedRecord) fail('record');
      current();
      return Object.freeze({ kind: 'empty', through: p.through, position: c.prefix.position });
    }
    const entry = p.entries[0]!,
      position = r.after + 1,
      old = position <= c.prefix.position;
    if (entry.envelope.length > INBOUND_ENVELOPE_LIMIT) fail('size');
    const e = decodeNetworkEnvelope(entry.envelope),
      currentRoute = {
        v: 2 as const,
        workspace_id: a.workspace,
        credential_id: c.publisher.id,
        epoch: a.tip,
        gen: c.history ? historyGeneration(c.history, a.tip) : c.generation,
      };
    const routeFor = (epoch: number) =>
      c.history ? historyEnvelopeRoute(c.history, currentRoute, epoch) : currentRoute;
    if (e.v !== 2 || (!c.history && e.epoch !== 1)) fail('unsupported');
    const route = routeFor(e.epoch);
    if (e.gen !== route.gen) fail('scope');
    const keys = new Map(c.retainedGenerationKeys);
    keys.set(c.generation, c.generationKey);
    const opener = (generation: number) => generationKey(keys, generation);
    if (e.workspace_id !== a.workspace || e.credential_id !== c.publisher.id || e.seq !== position)
      fail('scope');
    const previous = old ? c.retained?.previous : c.prefix.link;
    if (!previous || (position === 1 && previous !== ZERO_REFUSAL)) fail('prefix');
    const publicKey = await subtle.importKey(
      'raw',
      unhex(c.publisher.publicKey, 32),
      'Ed25519',
      false,
      ['verify'],
    );
    const subject = (wire: Bytes) => {
      const v = decodeNetworkEnvelope(wire);
      return {
        workspace: a.workspace,
        credential: c.publisher.id,
        position,
        epoch: v.epoch,
        digest: hex(v.digest),
        parent: ZERO_REFUSAL,
        previous,
      };
    };
    const decision = (wire: Bytes, expected: ReturnType<typeof subject>) =>
      c.history
        ? verifyHistoryDecision(wire, expected, a, c.history, subtle)
        : verifyPositionResponse(wire, expected, a, subtle);
    // A stale duplicate/conflict requires its independently retained ORIGINAL acceptance, too.
    if (old) {
      if (!c.retained) fail('prefix');
      const original = decodeNetworkEnvelope(c.retained.envelope);
      if (original.seq !== position) fail('prefix');
      const evidence = await decision(c.retained.proof, subject(c.retained.envelope));
      guard();
      if (
        evidence.kind !== 'accepted' ||
        evidence.head.final ||
        (position === c.prefix.position && evidence.head.link !== c.prefix.link)
      )
        fail('prefix');
      const held = await openNetworkEnvelope(
        c.retained.envelope,
        routeFor(original.epoch),
        publicKey,
        opener(routeFor(decodeNetworkEnvelope(c.retained!.envelope).epoch).gen),
        subtle,
      );
      try {
        validateBody(held, c.publisher);
      } finally {
        for (const update of held.updates) update.fill(0);
      }
    }
    const proof = await decision(entry.proof, subject(entry.envelope));
    guard();
    if (proof.kind !== 'accepted') fail('unverified');
    if (proof.head.final) fail('unsupported');
    body = await openNetworkEnvelope(entry.envelope, route, publicKey, opener(route.gen), subtle);
    const updateBytes = validateBody(body, c.publisher);
    if (old && hex(c.retained!.envelope) === hex(entry.envelope)) {
      if (expectedRecord) fail('record');
      current();
      return Object.freeze({ kind: 'duplicate', through: p.through, position });
    }
    if (old && hex(decodeNetworkEnvelope(c.retained!.envelope).digest) === hex(e.digest))
      fail('record');
    const kind = old ? 'conflict' : 'received';
    const event: InboundRecord = {
      baseline: c.baseline.id,
      lineage: a.lineage,
      head: a.head,
      reader: c.reader.id,
      publisher: c.publisher.id,
      kind,
      position,
      previous,
      link: proof.head.link,
      request,
      page: pageBytes,
    };
    const record = encodeInboundRecord(event);
    if (record.length + (kind === 'received' ? updateBytes : 0) > MAX_BATCH_BYTES) fail('size');
    if (expectedRecord && hex(record) !== hex(expectedRecord)) fail('record');
    current();
    if (kind === 'conflict') return Object.freeze({ kind, record, position, through: p.through });
    transfer = true;
    return Object.freeze({
      kind,
      record,
      updates: Object.freeze([...body.updates]),
      actor: Object.freeze({ id: body.actor_id, kind: body.actor_kind as 'human' | 'system' }),
      position,
      link: proof.head.link,
      through: p.through,
    });
  } finally {
    c.generationKey.fill(0);
    for (const key of c.retainedGenerationKeys?.values() ?? []) key.fill(0);
    if (!transfer) for (const update of body?.updates ?? []) update.fill(0);
  }
}
/** request MUST be the owner's captured outstanding request, never selected by the response. */
export const verifyInboundPage = (
  context: InboundContext,
  request: Bytes,
  page: Bytes,
  lifetime: InboundLifetime,
): Promise<InboundResult> => verify(context, request, page, lifetime);
/** Recheck original signatures/bytes after request expiry using the independently replayed pre-event prefix.
 * This verifies one record only; the future owner must verify witness completeness and content coverage.
 */
export async function verifyStoredInbound(
  context: InboundContext,
  bytes: Bytes,
  lifetime: InboundLifetime,
): Promise<InboundResult> {
  const captured = captureBytes(bytes, INBOUND_RECORD_LIMIT),
    event = decodeInboundRecord(captured);
  return verify(context, event.request, event.page, lifetime, captured);
}
