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
  type InboundReadRequest,
  type InboundReadPage,
} from '../../account-protocol/inboundTransport';
import {
  encodeInboundRecord,
  decodeInboundRecord,
  captureScopedInboundReceiptSyntax,
  inboundReceiptViews,
  inboundEntryMemoSlot,
  INBOUND_PAGE_HEADER_BYTES,
  INBOUND_ENVELOPE_LIMIT,
  INBOUND_RECORD_LIMIT,
  INBOUND_UPDATE_BYTES,
  INBOUND_UPDATE_LIMIT,
  type InboundRecord,
  type InboundOriginalSyntax,
  type InboundReceiptSyntax,
} from './inboundRecord';
import { MAX_BATCH_BYTES, MAX_BATCH_RECORDS } from './contentRecord';
import { RECEIVE_GROUP_LIMIT } from './receiveLimits';
import { guardedSubtle, utf8 } from './custodyCrypto';
import { sameBytes, eraseVerified } from './verifiedRecords';
import type { VerificationMemo } from './verificationMemo';
import { Y } from './yjs';
import { captureInboundReceiptVersion, type InboundReceiptVersion } from './inboundReceiptVersion';

export interface InboundContext extends InboundReceiptVersion {
  baseline: {
    kind: 'promotion-genesis' | 'content-checkpoint' | 'history-checkpoint' | 'recovery-checkpoint';
    id: string;
  };
  /** Exact cuts of a semantically admitted replacement snapshot, supplied only by its native owner. */
  baselineHeads?: readonly { credentialId: string; position: number; link: string }[];
  service: { id: string; origin: string };
  authority: DecisionAuthority;
  /** Verified admission-only lineage, supplied by the custody owner. */
  history?: AdmissionHistory;
  /** Original single-device custody, before an admission history exists. */
  checkpointAnchor?: import('../../account-protocol/membership').VerifiedMembership;
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
  const floor = captureInboundReceiptVersion(input),
    a = captureAuthority(input.authority),
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
    ![
      'promotion-genesis',
      'content-checkpoint',
      'history-checkpoint',
      'recovery-checkpoint',
    ].includes(baseline.kind) ||
    (baseline.kind === 'history-checkpoint' && !input.history) ||
    (baseline.kind === 'recovery-checkpoint' && (!input.history || a.tip < 2)) ||
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
    ...floor,
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
function assertInboundScope(c: InboundContext, r: InboundReadRequest) {
  const a = c.authority;
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
}
async function authenticateInboundWire(
  c: InboundContext,
  r: InboundReadRequest,
  p: InboundReadPage,
  request: Bytes,
  subtle: SubtleCrypto,
) {
  const a = c.authority;
  if (p.request !== hex(new Uint8Array(await subtle.digest('SHA-256', request)))) fail('request');
  const readerKey = await subtle.importKey('raw', unhex(c.reader.publicKey, 32), 'Ed25519', false, [
    'verify',
  ]);
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
  assertInboundPagePrefix(c, r, p);
}
function assertInboundPagePrefix(c: InboundContext, r: InboundReadRequest, p: InboundReadPage) {
  const a = c.authority;
  if (p.through < c.prefix.observedThrough || r.after > c.prefix.position) fail('prefix');
  if (c.history) {
    // A stored page is bounded by its own authenticated epoch. Later membership cuts cannot
    // retroactively require an old reply to have observed writing accepted after that reply.
    const at = c.history.authorities.findIndex((authority) => authority.tip === a.tip);
    const entering = at > 0 ? c.history.boundaries[at - 1]!.position : 0;
    const genesisCut = c.history.boundaries[0]?.position;
    if (p.through < entering || (a.tip === 1 && genesisCut !== undefined && p.through > genesisCut))
      fail('prefix');
  }
}
async function openInboundEntry(
  c: InboundContext,
  entry: { envelope: Bytes; proof: Bytes },
  position: number,
  previous: string,
  subtle: SubtleCrypto,
  guard: () => void,
  retained = false,
) {
  const a = c.authority;
  if (entry.envelope.length > INBOUND_ENVELOPE_LIMIT) fail('size');
  const envelope = decodeNetworkEnvelope(entry.envelope),
    currentRoute = {
      v: 2 as const,
      workspace_id: a.workspace,
      credential_id: c.publisher.id,
      epoch: a.tip,
      gen: c.history ? historyGeneration(c.history, a.tip) : c.generation,
    };
  if (envelope.v !== 2 || (!c.history && envelope.epoch !== 1)) fail('unsupported');
  const route = c.history
    ? historyEnvelopeRoute(c.history, currentRoute, envelope.epoch)
    : currentRoute;
  if (
    envelope.gen !== route.gen ||
    envelope.workspace_id !== a.workspace ||
    envelope.credential_id !== c.publisher.id ||
    envelope.seq !== position
  )
    fail('scope');
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
  const proof = await decision(entry.proof, subject(entry.envelope));
  guard();
  if (proof.kind !== 'accepted') fail(retained ? 'prefix' : 'unverified');
  if (proof.head.final) fail(retained ? 'prefix' : 'unsupported');
  const publicKey = await subtle.importKey(
      'raw',
      unhex(c.publisher.publicKey, 32),
      'Ed25519',
      false,
      ['verify'],
    ),
    keys = new Map(c.retainedGenerationKeys);
  keys.set(c.generation, c.generationKey);
  const body = await openNetworkEnvelope(
    entry.envelope,
    route,
    publicKey,
    generationKey(keys, route.gen),
    subtle,
  );
  try {
    return { body, proof, envelope, updateBytes: validateBody(body, c.publisher) };
  } catch (cause) {
    for (const update of body.updates) update.fill(0);
    throw cause;
  }
}
/** Private call construction only. Saved originals may have no legacy per-position encoding to
 * compare; that never makes their expired request live, or permits an empty/duplicate receipt. */
type InboundVerificationMode =
  | { readonly kind: 'live' }
  | {
      readonly kind: 'stored';
      readonly expectedRecord?: Bytes;
      readonly originals?: InboundOriginalSyntax;
    }
  | {
      readonly kind: 'storedPhysical';
      readonly record: Bytes;
      readonly event: InboundRecord;
      readonly originals: InboundOriginalSyntax;
    };
async function verify(
  input: InboundContext,
  requestInput: Bytes,
  pageInput: Bytes,
  lifetime: InboundLifetime,
  mode: InboundVerificationMode = { kind: 'live' },
  selection?: {
    index: number;
    authenticate: typeof authenticateInboundWire;
  },
): Promise<InboundResult> {
  const storedMode = mode.kind !== 'live';
  const assertCurrent = lifetime.assertCurrent.bind(lifetime),
    now = lifetime.now ? lifetime.now.bind(lifetime) : Date.now;
  const guard = () => {
    const result: unknown = assertCurrent();
    if (result !== undefined) fail('authority');
  };
  guard();
  const originals = storedMode ? mode.originals : undefined;
  if (originals && (requestInput !== originals.requestBytes || pageInput !== originals.pageBytes))
    fail('record');
  const request = originals?.requestBytes ?? captureBytes(requestInput, READ_REQUEST_LIMIT),
    pageBytes = originals?.pageBytes ?? captureBytes(pageInput, READ_PAGE_LIMIT),
    expectedRecord =
      mode.kind === 'stored' && mode.expectedRecord
        ? captureBytes(mode.expectedRecord, INBOUND_RECORD_LIMIT)
        : undefined;
  const c = captureContext(input),
    subtle = guardedSubtle(guard);
  let body: EnvelopeBody | undefined,
    transfer = false;
  try {
    const r = originals?.request ?? decodeInboundRequest(request),
      p = originals?.page ?? decodeInboundPage(pageBytes),
      a = c.authority;
    assertInboundScope(c, r);
    if (!selection) {
      if (r.limit !== 1) fail('unsupported');
    } else if (
      r.limit < 2 ||
      !Number.isSafeInteger(selection.index) ||
      selection.index < 0 ||
      (p.entries.length > 0 && selection.index >= p.entries.length) ||
      r.after + selection.index !== c.prefix.position
    )
      fail('prefix');
    checkInboundExtent(p, r);
    const current = () => {
      guard();
      if (!storedMode) {
        const time = now();
        if (!Number.isSafeInteger(time) || time < 0 || r.expires > time + 60000) fail('request');
        if (r.expires <= time) fail('expired');
      }
    };
    current();
    await (selection?.authenticate ?? authenticateInboundWire)(c, r, p, request, subtle);
    if (!p.entries.length) {
      if (r.after !== c.prefix.position || storedMode) fail('record');
      current();
      return Object.freeze({ kind: 'empty', through: p.through, position: c.prefix.position });
    }
    const index = selection?.index ?? 0,
      entry = p.entries[index]!,
      position = r.after + index + 1,
      old = position <= c.prefix.position,
      previous = old ? c.retained?.previous : c.prefix.link;
    if (!previous || (position === 1 && previous !== ZERO_REFUSAL)) fail('prefix');
    if (old) {
      if (!c.retained) fail('prefix');
      if (decodeNetworkEnvelope(c.retained.envelope).seq !== position) fail('prefix');
      const held = await openInboundEntry(c, c.retained, position, previous, subtle, guard, true);
      try {
        if (position === c.prefix.position && held.proof.head.link !== c.prefix.link)
          fail('prefix');
      } finally {
        for (const update of held.body.updates) update.fill(0);
      }
    }
    const checked = await openInboundEntry(c, entry, position, previous, subtle, guard),
      { proof, envelope: e, updateBytes } = checked;
    body = checked.body;
    if (old && hex(c.retained!.envelope) === hex(entry.envelope)) {
      if (storedMode) fail('record');
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
      ...(selection ? { entry: index } : {}),
    };
    if (mode.kind === 'storedPhysical') {
      if (
        c.inboundReceiptVersion !== 1 ||
        kind !== 'received' ||
        [
          'baseline',
          'lineage',
          'head',
          'reader',
          'publisher',
          'kind',
          'position',
          'previous',
          'link',
          'entry',
        ].some(
          (field) =>
            event[field as keyof InboundRecord] !== mode.event[field as keyof InboundRecord],
        )
      )
        fail('record');
    }
    const record = mode.kind === 'storedPhysical' ? mode.record : encodeInboundRecord(event);
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
/** One bounded forward range. Header crypto is shared only within this call's owned snapshots;
 * each position, link, envelope, actor and lifetime still verifies before any result escapes.
 * No native progress or persisted trust is produced here. */
export const verifyInboundRange = (
  input: InboundContext,
  request: Bytes,
  page: Bytes,
  lifetime: InboundLifetime,
): Promise<readonly InboundResult[]> => verifyRange(input, request, page, lifetime);
/** Native preparation only: verify a fitting prefix within this turn's position allowance.
 * An unselected raw tail is not verified, trusted or handed to the next owner. Every continuation
 * authenticates the original again against its independently supplied current native prefix. */
export const prepareInboundRange = (
  input: InboundContext,
  request: Bytes,
  page: Bytes,
  lifetime: InboundLifetime,
  positions = RECEIVE_GROUP_LIMIT,
): Promise<readonly InboundResult[]> => verifyRange(input, request, page, lifetime, positions);
async function verifyRange(
  input: InboundContext,
  requestInput: Bytes,
  pageInput: Bytes,
  lifetime: InboundLifetime,
  positions?: number,
): Promise<readonly InboundResult[]> {
  const assertCurrent = lifetime.assertCurrent.bind(lifetime),
    guard = () => {
      const result: unknown = assertCurrent();
      if (result !== undefined) fail('authority');
    };
  guard();
  const request = captureBytes(requestInput, READ_REQUEST_LIMIT),
    page = captureBytes(pageInput, READ_PAGE_LIMIT),
    context = captureContext(input),
    ownedLifetime = {
      assertCurrent: guard,
      ...(lifetime.now ? { now: lifetime.now.bind(lifetime) } : {}),
    },
    results: InboundResult[] = [];
  let transferred = false,
    authenticated = false,
    bytes = 0,
    records = 0;
  try {
    const r = decodeInboundRequest(request),
      p = decodeInboundPage(page);
    if (
      positions !== undefined &&
      (!Number.isSafeInteger(positions) || positions < 1 || positions > RECEIVE_GROUP_LIMIT)
    )
      fail('size');
    const start = positions === undefined ? 0 : context.prefix.position - r.after;
    if (
      context.retained ||
      !Number.isSafeInteger(start) ||
      start < 0 ||
      (positions === undefined && r.after !== context.prefix.position) ||
      (positions !== undefined && (r.limit < 2 || start >= Math.max(1, p.entries.length)))
    )
      fail('prefix');
    // Conservative size hint only: an indexed receipt repeats the original request/page as hex.
    // The margin covers closed JSON fields. This grants no evidence or cursor progress; the fresh
    // narrower read still needs the full verifier. Exact bounds remain enforced below/in the codec.
    if (
      positions !== undefined &&
      2 * (request.length + page.length) + 1024 > INBOUND_RECORD_LIMIT
    ) {
      guard();
      transferred = true;
      return Object.freeze(results);
    }
    // These bytes and authority were captured once above and never leave this call. Prefix and
    // lifetime checks still run for every entry, including after the two wire signatures reuse.
    const authenticate: typeof authenticateInboundWire = async (...args) => {
      guard();
      if (!authenticated) {
        await authenticateInboundWire(...args);
        guard();
        authenticated = true;
      } else assertInboundPagePrefix(args[0], args[1], args[2]);
    };
    for (let index = start; index < Math.max(1, p.entries.length); index++) {
      if (positions !== undefined && results.length === positions) break;
      const result = await verify(
        context,
        request,
        page,
        ownedLifetime,
        undefined,
        r.limit > 1 ? { index, authenticate } : undefined,
      );
      // Own plaintext before a final guard or aggregate bound can reject it.
      results.push(result);
      if (result.kind === 'received') {
        bytes += result.record.length + result.updates.reduce((n, b) => n + b.length, 0);
        records += result.updates.length + 1;
        if (bytes > MAX_BATCH_BYTES || records > MAX_BATCH_RECORDS) {
          if (positions === undefined) fail('size');
          // Only a valid fitting prefix escapes. Erase this verified but unused result immediately.
          results.pop();
          result.record.fill(0);
          for (const update of result.updates) update.fill(0);
          break;
        }
        context.prefix = {
          position: result.position,
          link: result.link,
          observedThrough: result.through,
        };
      } else if (result.kind !== 'empty') fail('prefix');
      guard();
    }
    guard();
    transferred = true;
    return Object.freeze(results);
  } finally {
    request.fill(0);
    page.fill(0);
    context.generationKey.fill(0);
    for (const key of context.retainedGenerationKeys?.values() ?? []) key.fill(0);
    if (!transferred)
      for (const result of results) {
        if ('record' in result) result.record.fill(0);
        if (result.kind === 'received') for (const update of result.updates) update.fill(0);
      }
  }
}
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
  return verify(
    context,
    event.request,
    event.page,
    lifetime,
    { kind: 'stored', expectedRecord: captured },
    event.entry === undefined
      ? undefined
      : { index: event.entry, authenticate: authenticateInboundWire },
  );
}

/** Detached evidence for one physical saved receipt. Logical entries share its exact owned
 * originals. Callers still verify completeness/coverage and current native commit authority. */
export interface VerifiedStoredInboundReceipt {
  readonly record: Bytes;
  readonly entries: readonly {
    readonly index: number;
    readonly event: InboundRecord;
    readonly original: { readonly envelope: Bytes; readonly proof: Bytes };
    readonly result: InboundResult;
  }[];
}
/** Stored mode and owned syntax come only from these captured saved-byte arguments. Nothing
 * supplied by a network response, parser projection or lifetime flag selects either of them. */
export async function verifyStoredInboundReceipt(
  input: InboundContext,
  bytes: Bytes,
  lifetime: InboundLifetime,
  reuse?: { memo: VerificationMemo; sequence: number },
): Promise<VerifiedStoredInboundReceipt> {
  const assertCurrent = lifetime.assertCurrent.bind(lifetime),
    guard = () => {
      const result: unknown = assertCurrent();
      if (result !== undefined) fail('authority');
    };
  guard();
  const context = captureContext(input),
    ownedLifetime: InboundLifetime = {
      assertCurrent: guard,
      ...(lifetime.now ? { now: lifetime.now.bind(lifetime) } : {}),
    },
    entries: VerifiedStoredInboundReceipt['entries'][number][] = [];
  let captured: InboundReceiptSyntax | undefined,
    transferred = false,
    physicalMemo = false;
  let evidenceInputs: Bytes[] | undefined, memoProof: unknown, legacyMemoIndex: number | undefined;
  try {
    captured = captureScopedInboundReceiptSyntax(bytes, context);
    if (!captured) fail('record');
    const views = inboundReceiptViews(captured),
      physical = captured.receipt.kind === 'page';
    if (
      captured.receipt.kind === 'page' &&
      (context.retained || context.prefix.position !== captured.receipt.record.firstPosition - 1)
    )
      fail('prefix');
    const logical = [...views.entries()],
      syntax = captured;
    let authenticated = false,
      totalBytes = captured.bytes.length,
      totalRecords = 1;
    // No context except its fresh prefix changes inside this privately captured physical turn.
    const authenticate: typeof authenticateInboundWire = async (...args) => {
      guard();
      if (!authenticated) {
        await authenticateInboundWire(...args);
        guard();
        authenticated = true;
      } else assertInboundPagePrefix(args[0], args[1], args[2]);
    };
    const run = async () => {
      for (const { entryIndex, event } of logical) {
        const original = syntax.originals.page.entries[entryIndex];
        if (!original) fail('record');
        const result = await verify(
          context,
          event.request,
          event.page,
          ownedLifetime,
          physical
            ? {
                kind: 'storedPhysical',
                record: syntax.bytes,
                event,
                originals: syntax.originals,
              }
            : { kind: 'stored', expectedRecord: syntax.bytes, originals: syntax.originals },
          event.entry === undefined ? undefined : { index: entryIndex, authenticate },
        );
        entries.push(Object.freeze({ index: entryIndex, event, original, result }));
        if (!('record' in result) || (physical && result.kind !== 'received')) fail('record');
        if (result.kind === 'received') {
          totalBytes += result.updates.reduce((sum, update) => sum + update.length, 0);
          totalRecords += result.updates.length;
          context.prefix = {
            position: result.position,
            link: result.link,
            observedThrough: result.through,
          };
        }
        if (totalBytes > MAX_BATCH_BYTES || totalRecords > MAX_BATCH_RECORDS) fail('size');
        guard();
      }
    };
    const memo = reuse?.memo;
    if (!memo || (physical && !memo.checkReceipt)) {
      await run();
      guard();
      transferred = true;
      return Object.freeze({ record: captured.bytes, entries: Object.freeze(entries) });
    }
    const sequence = inboundInteger(reuse!.sequence, 1),
      keyEntries = [...(context.retainedGenerationKeys ?? [])].sort(([a], [b]) => a - b),
      memoContext = JSON.stringify({
        ...context,
        generationKey: undefined,
        retainedGenerationKeys: keyEntries.map(([generation]) => generation),
        retained: undefined,
      });
    // Own the comparison input independently: a memo erases its callback value after cloning it.
    evidenceInputs = [
      captured.bytes.slice(),
      context.generationKey,
      ...keyEntries.map(([, key]) => key),
      ...(context.retained
        ? [utf8(context.retained.previous), context.retained.envelope, context.retained.proof]
        : []),
    ];
    if (physical) {
      physicalMemo = true;
      const requestLength = captured.originals.requestBytes.length,
        pageLength = captured.originals.pageBytes.length;
      const proof = await memo.checkReceipt!(
        logical.map((e) => inboundEntryMemoSlot(sequence, e.entryIndex)),
        memoContext,
        evidenceInputs,
        async () => {
          await run();
          return {
            record: captured!.bytes,
            entries: entries.map((e) => {
              if (e.result.kind !== 'received') fail('record');
              const { record: _record, ...result } = e.result;
              return { index: e.index, original: e.original, result };
            }),
          };
        },
        guard,
      );
      memoProof = proof;
      guard();
      if (
        !proof ||
        !(proof.record instanceof Uint8Array) ||
        !sameBytes(proof.record, evidenceInputs[0]!) ||
        !Array.isArray(proof.entries) ||
        proof.entries.length !== logical.length
      )
        fail('record');
      const request = proof.record.subarray(
          INBOUND_PAGE_HEADER_BYTES,
          INBOUND_PAGE_HEADER_BYTES + requestLength,
        ),
        page = proof.record.subarray(INBOUND_PAGE_HEADER_BYTES + requestLength);
      if (page.length !== pageLength) fail('record');
      const restored: VerifiedStoredInboundReceipt['entries'][number][] = [];
      for (const [offset, view] of logical.entries()) {
        const e = proof.entries[offset]!;
        if (
          !e ||
          e.index !== view.entryIndex ||
          e.result.kind !== 'received' ||
          e.result.position !== view.event.position ||
          e.result.link !== view.event.link ||
          e.result.through !== captured.originals.page.through
        )
          fail('record');
        restored.push(
          Object.freeze({
            index: e.index,
            event: Object.freeze({ ...view.event, request, page }),
            original: e.original,
            result: Object.freeze({ ...e.result, record: proof.record }),
          }),
        );
        guard();
      }
      transferred = true;
      return Object.freeze({ record: proof.record, entries: Object.freeze(restored) });
    }
    const view = logical[0]!;
    const result = await memo.check(
      inboundEntryMemoSlot(sequence, view.entryIndex),
      memoContext,
      evidenceInputs,
      async () => {
        await run();
        return entries[0]!.result;
      },
      guard,
    );
    memoProof = result;
    guard();
    if (!('record' in result) || !sameBytes(result.record, captured.bytes)) fail('record');
    // The exact legacy encoding is preserved; its detached cache copy is not another retained row.
    const restored = Object.freeze({ ...result, record: captured.bytes });
    result.record.fill(0);
    const entry = Object.freeze({
      index: view.entryIndex,
      event: view.event,
      original: captured.originals.page.entries[view.entryIndex]!,
      result: restored,
    });
    guard();
    legacyMemoIndex = view.entryIndex;
    transferred = true;
    return Object.freeze({ record: captured.bytes, entries: Object.freeze([entry]) });
  } finally {
    context.generationKey.fill(0);
    for (const key of context.retainedGenerationKeys?.values() ?? []) key.fill(0);
    if (!transferred) eraseVerified(memoProof);
    if (physicalMemo) {
      captured?.bytes.fill(0);
      captured?.originals.requestBytes.fill(0);
      captured?.originals.pageBytes.fill(0);
    }
    for (const input of evidenceInputs ?? []) input.fill(0);
    const kept = transferred
      ? new Set(
          legacyMemoIndex === undefined ? entries.map((entry) => entry.index) : [legacyMemoIndex],
        )
      : undefined;
    for (const [index, original] of captured?.originals.page.entries.entries() ?? [])
      if (physicalMemo || !kept?.has(index)) {
        original.envelope.fill(0);
        original.proof.fill(0);
      }
    if (!transferred) {
      captured?.bytes.fill(0);
      captured?.originals.requestBytes.fill(0);
      captured?.originals.pageBytes.fill(0);
      for (const entry of entries) {
        if ('record' in entry.result) entry.result.record.fill(0);
        if (entry.result.kind === 'received')
          for (const update of entry.result.updates) update.fill(0);
      }
    }
  }
}

/** Transient history reconstruction only. No durable inbound record or authority is produced.
 * The cut must come from the caller's independently authenticated source inventory. */
export async function verifyHistoryPage(
  input: InboundContext,
  requestInput: Bytes,
  pageInput: Bytes,
  cutInput: { position: number; link: string },
  lifetime: InboundLifetime,
): Promise<{
  readonly updates: readonly Bytes[];
  readonly count: number;
  readonly position: number;
  readonly link: string;
  readonly through: number;
}> {
  const assertCurrent = lifetime.assertCurrent.bind(lifetime),
    now = lifetime.now ? lifetime.now.bind(lifetime) : Date.now;
  const guard = () => {
    if (assertCurrent() !== undefined) fail('authority');
  };
  guard();
  const request = captureBytes(requestInput, READ_REQUEST_LIMIT),
    pageBytes = captureBytes(pageInput, READ_PAGE_LIMIT),
    cut = { position: inboundInteger(cutInput.position), link: inboundHex(cutInput.link, 32) },
    c = captureContext(input),
    updates: Bytes[] = [];
  let transferred = false;
  try {
    const r = decodeInboundRequest(request),
      p = decodeInboundPage(pageBytes);
    assertInboundScope(c, r);
    checkInboundExtent(p, r);
    if (
      r.after !== c.prefix.position ||
      r.limit > cut.position - r.after ||
      p.next > cut.position ||
      !p.entries.length ||
      c.retained
    )
      fail('prefix');
    const current = () => {
      guard();
      const time = now();
      if (!Number.isSafeInteger(time) || time < 0 || r.expires > time + 60000) fail('request');
      if (r.expires <= time) fail('expired');
    };
    const subtle = guardedSubtle(current);
    current();
    await authenticateInboundWire(c, r, p, request, subtle);
    let position = r.after,
      link = c.prefix.link,
      bytes = 0;
    for (const entry of p.entries) {
      const checked = await openInboundEntry(c, entry, ++position, link, subtle, current);
      updates.push(...checked.body.updates);
      bytes += checked.updateBytes;
      if (bytes > MAX_BATCH_BYTES) fail('size');
      link = checked.proof.head.link;
    }
    if (position === cut.position && link !== cut.link) fail('prefix');
    current();
    transferred = true;
    return Object.freeze({
      updates: Object.freeze(updates),
      count: p.entries.length,
      position,
      link,
      through: p.through,
    });
  } finally {
    c.generationKey.fill(0);
    for (const key of c.retainedGenerationKeys?.values() ?? []) key.fill(0);
    request.fill(0);
    pageBytes.fill(0);
    if (!transferred) for (const update of updates) update.fill(0);
  }
}
