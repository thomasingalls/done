/** Verified admission/certification history. No storage, installation or send authority. */
import { verifySuccessor, type SuccessorBase, type AuthorityAnchor } from './successor.ts';
import { verifyCertificationSuccessor, parseCertificationSuccessor } from './contentDelivery.ts';
import {
  captureAuthority,
  captureSubject,
  decodePositionResponse,
  verifyPositionResponse,
  acceptanceLink,
  ZERO_REFUSAL,
  type Bytes,
  type DecisionAuthority,
  type DecisionEvidence,
  type PositionSubject,
} from './positionDecision.ts';
import {
  decodeNetworkEnvelope,
  verifyNetworkEnvelope,
  ENVELOPE_WIRE_LIMIT,
  type EnvelopeRoute,
} from './envelope.ts';
import { hex, unhex } from './recovery.ts';
import {
  verifyMembershipAnchor,
  membershipState,
  parseMembershipAdmission,
  parseMembershipCertification,
  parseMembershipCancellation,
  parseMembershipRotation,
  verifyMembershipAdmission,
  verifyMembershipCertification,
  verifyMembershipCancellation,
  verifyMembershipRotation,
  type VerifiedMembership,
} from './membership.ts';

export interface AdmissionHistory {
  readonly first: Readonly<DecisionAuthority>;
  readonly current: Readonly<DecisionAuthority>;
  readonly credential: string;
  readonly principal: string;
  readonly signingKey: string;
  readonly boundary: Readonly<{ position: number; link: string }>;
  readonly authorities: readonly Readonly<DecisionAuthority>[];
  readonly boundaries: readonly Readonly<{ position: number; link: string }>[];
  readonly finalization?: Readonly<{ position: number; link: string; epoch: number }>;
  readonly readers: readonly Readonly<{ id: string; publicKey: string }>[];
}
const verified = new WeakSet<AdmissionHistory>();
const publisherRoots = new WeakMap<AdmissionHistory, AdmissionHistory>();
const rosters = new WeakMap<
  AdmissionHistory,
  readonly Readonly<{ id: string; state: 'certified' | 'pending' }>[]
>();
interface PublisherTimeline {
  signingKey: string;
  authorities: AdmissionHistory['authorities'];
  boundaries: AdmissionHistory['boundaries'];
  finalization?: AdmissionHistory['finalization'];
}
interface ContinuationTimeline {
  membership: VerifiedMembership;
  generations: ReadonlyMap<number, number>;
  minimumGenerations: ReadonlyMap<number, number>;
  readers: ReadonlyMap<number, AdmissionHistory['readers']>;
  publishers: ReadonlyMap<string, PublisherTimeline>;
}
const timelines = new WeakMap<AdmissionHistory, ContinuationTimeline>();
const requireHistory = (history: AdmissionHistory) => {
  if (!verified.has(history)) throw Error('Unverified admission history');
  return history;
};
/** Captures through the protocol verifier before its first await; all returned fields are immutable. */
export async function verifyAdmissionHistory(
  input: unknown,
  base: SuccessorBase,
  held: AuthorityAnchor,
): Promise<AdmissionHistory> {
  const successor = await verifySuccessor(input, base, held),
    e = successor.epoch,
    member = e.certified.value.members[0],
    boundary = e.heads.find((h) => h.credentialId === member.id)!;
  const first = captureAuthority({
    workspace: e.workspaceId,
    lineage: e.lineageId,
    tip: 1,
    head: e.parent,
    acceptanceKey: e.acceptancePublicKey,
  });
  const current = captureAuthority({ ...first, tip: 2, head: successor.head });
  const cut = Object.freeze({ position: boundary.position, link: boundary.link });
  const result = Object.freeze({
    first,
    current,
    credential: member.id,
    principal: e.principalId,
    signingKey: member.sPub,
    boundary: cut,
    authorities: Object.freeze([first, current]),
    boundaries: Object.freeze([cut]),
    readers: Object.freeze([Object.freeze({ id: member.id, publicKey: member.sPub })]),
  });
  verified.add(result);
  rosters.set(result, Object.freeze(e.roster.map(({ id, state }) => Object.freeze({ id, state }))));
  return result;
}
/** Extend the same publisher history only after verifying the exact two-device certification. */
export async function verifyCertificationHistory(
  input: unknown,
  admissionInput: unknown,
  base: SuccessorBase,
  held: { epoch: 3; head: string },
): Promise<AdmissionHistory> {
  const captured = parseCertificationSuccessor(input);
  const capturedBase = structuredClone(base);
  if (held.epoch !== 3 || held.head !== captured.head) throw Error('Certification anchor changed');
  const admission = await verifySuccessor(admissionInput, capturedBase, {
    epoch: 2,
    head: captured.epoch.parent,
  });
  const prior = await verifyAdmissionHistory(admission, capturedBase, {
    epoch: 2,
    head: admission.head,
  });
  const certification = await verifyCertificationSuccessor(captured, capturedBase, admission);
  const current = captureAuthority({ ...prior.first, tip: 3, head: certification.head });
  const head = certification.epoch.heads.find((h) => h.credentialId === prior.credential)!;
  const boundary = Object.freeze({ position: head.position, link: head.link });
  const result = Object.freeze({
    ...prior,
    current,
    boundary,
    authorities: Object.freeze([...prior.authorities, current]),
    boundaries: Object.freeze([...prior.boundaries, boundary]),
    readers: Object.freeze(
      certification.epoch.roster.map((m) => Object.freeze({ id: m.id, publicKey: m.sPub })),
    ),
  });
  const membership = await verifyMembershipAnchor(capturedBase, admission, certification, {
    epoch: 3,
    head: certification.head,
  });
  const publishers = new Map<string, PublisherTimeline>();
  for (const m of result.readers)
    publishers.set(
      m.id,
      m.id === result.credential
        ? {
            signingKey: m.publicKey,
            authorities: result.authorities,
            boundaries: result.boundaries,
          }
        : {
            signingKey: m.publicKey,
            authorities: Object.freeze([current]),
            boundaries: Object.freeze([]),
          },
    );
  timelines.set(result, {
    membership,
    generations: new Map([
      [1, 1],
      [2, 1],
      [3, 1],
    ]),
    minimumGenerations: new Map([
      [1, 1],
      [2, 1],
      [3, 1],
    ]),
    readers: new Map([
      [1, prior.readers],
      [2, prior.readers],
      [3, result.readers],
    ]),
    publishers,
  });
  verified.add(result);
  rosters.set(
    result,
    Object.freeze(certification.epoch.roster.map(({ id, state }) => Object.freeze({ id, state }))),
  );
  return result;
}
/** Extend exact signed ancestry; all per-publisher entry epochs and accepted cuts are retained. */
export async function extendMembershipHistory(
  input: unknown,
  prior: AdmissionHistory,
): Promise<AdmissionHistory> {
  const held = requireHistory(prior),
    root = publisherRoots.get(held) ?? held;
  const timeline = timelines.get(root);
  if (!timeline) throw Error('Continuation requires the certified anchor');
  const proof =
    (input as { kind?: unknown } | null)?.kind === 'membership-admission'
      ? parseMembershipAdmission(input)
      : (input as { kind?: unknown } | null)?.kind === 'membership-cancellation'
        ? parseMembershipCancellation(input)
        : (input as { kind?: unknown } | null)?.kind === 'membership-rotation'
          ? parseMembershipRotation(input)
          : parseMembershipCertification(input);
  const membership =
    proof.kind === 'membership-admission'
      ? await verifyMembershipAdmission(proof, timeline.membership)
      : proof.kind === 'membership-cancellation'
        ? await verifyMembershipCancellation(proof, timeline.membership)
        : proof.kind === 'membership-rotation'
          ? await verifyMembershipRotation(proof, timeline.membership)
          : await verifyMembershipCertification(proof, timeline.membership);
  const state = membershipState(membership);
  const current = captureAuthority({
    ...root.current,
    tip: state.epoch,
    head: state.head,
    acceptanceKey: state.acceptancePublicKey,
  });
  const publishers = new Map<string, PublisherTimeline>();
  for (const [id, publisher] of timeline.publishers) {
    const finalization = state.finalized.find((h) => h.credential === id);
    const h = state.heads.find((h) => h.credentialId === id) ?? finalization;
    if (!h) throw Error('Missing publisher transition boundary');
    publishers.set(id, {
      signingKey: publisher.signingKey,
      ...(finalization
        ? {
            finalization: Object.freeze({
              position: finalization.position,
              link: finalization.link,
              epoch: finalization.epoch,
            }),
          }
        : {}),
      authorities: Object.freeze([...publisher.authorities, current]),
      boundaries: Object.freeze([
        ...publisher.boundaries,
        Object.freeze({ position: h.position, link: h.link }),
      ]),
    });
  }
  const readers = Object.freeze(
    state.certificate.members.map((m) => Object.freeze({ id: m.id, publicKey: m.sPub })),
  );
  for (const m of readers)
    if (!publishers.has(m.id))
      publishers.set(m.id, {
        signingKey: m.publicKey,
        authorities: Object.freeze([current]),
        boundaries: Object.freeze([]),
      });
  const own = publishers.get(root.credential)!;
  const result = Object.freeze({
    ...root,
    current,
    readers,
    authorities: own.authorities,
    boundaries: own.boundaries,
    boundary: own.boundaries.at(-1)!,
    ...(own.finalization ? { finalization: own.finalization } : {}),
  });
  verified.add(result);
  rosters.set(
    result,
    Object.freeze(state.roster.map(({ id, state }) => Object.freeze({ id, state }))),
  );
  timelines.set(result, {
    membership,
    generations: new Map([...timeline.generations, [state.epoch, state.generation]]),
    minimumGenerations: new Map([
      ...timeline.minimumGenerations,
      [
        state.epoch,
        proof.kind === 'membership-admission'
          ? state.generation
          : (timeline.minimumGenerations.get(root.current.tip) ?? 1),
      ],
    ]),
    publishers,
    readers: new Map([...timeline.readers, [state.epoch, readers]]),
  });
  return historyPublisher(result, held.credential);
}
/** The continuation state is the same process-branded state that established this history. */
export function historyMembership(history: AdmissionHistory): VerifiedMembership {
  const h = requireHistory(history),
    state = timelines.get(publisherRoots.get(h) ?? h)?.membership;
  if (!state) throw Error('History has no certified membership anchor');
  return state;
}
/** Read the verified roster, including candidates not yet certified for sync. */
export function historyDevices(history: AdmissionHistory) {
  const checked = requireHistory(history);
  const roster = rosters.get(publisherRoots.get(checked) ?? checked);
  if (!roster) throw Error('Verified device roster is missing');
  return roster;
}
export function historyReader(
  history: AdmissionHistory,
  id: string,
  publicKey: string,
  authority: DecisionAuthority = history.current,
): boolean {
  const h = requireHistory(history),
    at = historyAuthority(h, authority);
  // Certification cannot retroactively authorize a reader in a pending roster.
  const timeline = timelines.get(publisherRoots.get(h) ?? h);
  if (timeline)
    return (
      timeline.readers.get(at.tip)?.some((r) => r.id === id && r.publicKey === publicKey) ?? false
    );
  if (at.tip < 3) return id === h.credential && publicKey === h.signingKey;
  return h.readers.some((r) => r.id === id && r.publicKey === publicKey);
}
/** Derive a publisher route only from already verified certification, never a caller's key hint. */
export function historyPublisher(history: AdmissionHistory, credential: string): AdmissionHistory {
  const checked = requireHistory(history);
  const h = publisherRoots.get(checked) ?? checked;
  if (credential === h.credential) return h;
  const publisher = timelines.get(h)?.publishers.get(credential);
  if (!publisher) throw Error('Uncertified publisher');
  const empty = Object.freeze({ position: 0, link: ZERO_REFUSAL });
  const { finalization: _ownFinalization, ...shared } = h;
  const result = Object.freeze({
    ...shared,
    ...(publisher.finalization ? { finalization: publisher.finalization } : {}),
    first: publisher.authorities[0]!,
    credential,
    signingKey: publisher.signingKey,
    boundary: publisher.boundaries.at(-1) ?? empty,
    authorities: publisher.authorities,
    boundaries: publisher.boundaries,
  });
  verified.add(result);
  publisherRoots.set(result, h);
  return result;
}
/** Both historical and current contexts must name an exact authenticated head, never just a tip. */
export function historyAuthority(
  history: AdmissionHistory,
  input: DecisionAuthority,
): Readonly<DecisionAuthority> {
  const h = requireHistory(history),
    a = captureAuthority(input),
    expected = h.authorities.find((v) => v.tip === a.tip);
  if (
    !expected ||
    a.workspace !== expected.workspace ||
    a.lineage !== expected.lineage ||
    a.tip !== expected.tip ||
    a.head !== expected.head ||
    a.acceptanceKey !== expected.acceptanceKey
  )
    throw Error('Authority is outside verified admission history');
  return expected;
}
/** Generation at an authenticated epoch; a current route cannot silently reuse its predecessor key. */
export function historyGeneration(history: AdmissionHistory, epoch = history.current.tip): number {
  const h = requireHistory(history);
  if (!h.authorities.some((a) => a.tip === epoch)) throw Error('Unknown history generation');
  return timelines.get(publisherRoots.get(h) ?? h)?.generations.get(epoch) ?? 1;
}
/** Admissions fence future uploads below the joining device's key, without rewriting accepted history. */
export function historyMinimumGeneration(
  history: AdmissionHistory,
  epoch = history.current.tip,
): number {
  const h = requireHistory(history);
  if (!h.authorities.some((a) => a.tip === epoch)) throw Error('Unknown history generation floor');
  return timelines.get(publisherRoots.get(h) ?? h)?.minimumGenerations.get(epoch) ?? 1;
}
/** Callers retain their own current route. This only resolves an old payload's compatible route. */
export function historyEnvelopeRoute(
  history: AdmissionHistory,
  input: EnvelopeRoute,
  epoch: number,
): EnvelopeRoute {
  const h = requireHistory(history),
    r = { ...input };
  if (
    r.v !== 2 ||
    r.workspace_id !== h.current.workspace ||
    r.credential_id !== h.credential ||
    r.gen !== historyGeneration(h, r.epoch) ||
    (h.finalization && epoch >= h.finalization.epoch) ||
    !h.authorities.some((a) => a.tip === r.epoch) ||
    !h.authorities.some((a) => a.tip === epoch) ||
    epoch > r.epoch
  )
    throw Error('Envelope is outside verified admission history');
  return { ...r, epoch, gen: historyGeneration(h, epoch) };
}
/** Original proof issuance and current eligibility are separate. Unknown evidence grants nothing. */
export async function verifyHistoryDecision(
  input: Bytes,
  expected: PositionSubject & { parent: string; previous: string },
  authority: DecisionAuthority,
  history: AdmissionHistory,
  subtle = crypto.subtle,
): Promise<DecisionEvidence> {
  const h = requireHistory(history),
    current = historyAuthority(h, authority),
    own = { ...captureSubject(expected), parent: expected.parent, previous: expected.previous };
  if (own.credential !== h.credential) throw Error('Unsupported admission publisher');
  if (
    h.finalization &&
    (own.position > h.finalization.position || own.epoch >= h.finalization.epoch)
  )
    return { kind: 'unknown' };
  if (!h.authorities.some((a) => a.tip === own.epoch)) return { kind: 'unknown' };
  // Parsing captures the wire before crypto; the existing verifier still checks every signature/link.
  let issuance = current;
  try {
    const response = decodePositionResponse(input);
    if (response.kind === 'accepted') {
      const index = h.boundaries.findIndex((b) => response.head.position <= b.position);
      const expected = index < 0 ? h.current : h.authorities[index]!;
      if (
        response.head.epoch > current.tip ||
        response.head.epoch !== expected.tip ||
        h.boundaries.some(
          (b) => response.head.position === b.position && response.head.link !== b.link,
        )
      )
        return { kind: 'unknown' };
      issuance = expected;
    }
  } catch {
    return { kind: 'unknown' };
  }
  return verifyPositionResponse(input, own, issuance, subtle);
}

/** Incremental, constant-retained-memory proof of the exact prefix named by the successor.
 * Each append verifies the creating signature and ciphertext digest. No decryption is needed here;
 * the custody owner must also establish source/content coverage before installing authority.
 */
export function createAdmissionPrefixVerifier(history: AdmissionHistory, subtle = crypto.subtle) {
  const h = requireHistory(history);
  let position = 0,
    link = ZERO_REFUSAL,
    busy = false,
    failed = false,
    finished = false;
  const route: EnvelopeRoute = {
    v: 2,
    workspace_id: h.first.workspace,
    credential_id: h.credential,
    epoch: h.first.tip,
    gen: 1,
  };
  return Object.freeze({
    async append(input: Bytes): Promise<void> {
      if (busy || failed || finished || position >= h.boundary.position) {
        failed = true;
        throw Error('Admission prefix operation is out of order');
      }
      busy = true;
      try {
        if (!(input instanceof Uint8Array) || input.length > ENVELOPE_WIRE_LIMIT)
          throw Error('Admission prefix envelope size');
        // Capture before key import; no caller-owned bytes survive the first await.
        const bytes = input.slice(),
          key = await subtle.importKey('raw', unhex(h.signingKey, 32), 'Ed25519', false, [
            'verify',
          ]),
          decoded = decodeNetworkEnvelope(bytes),
          boundaryIndex = h.boundaries.findIndex((b) => decoded.seq <= b.position),
          maxEpoch = h.authorities[boundaryIndex]?.tip;
        if (maxEpoch === undefined || decoded.epoch > maxEpoch)
          throw Error('Envelope crosses authority boundary');
        const e = await verifyNetworkEnvelope(
          bytes,
          historyEnvelopeRoute(
            h,
            { ...route, epoch: maxEpoch, gen: historyGeneration(h, maxEpoch) },
            decoded.epoch,
          ),
          key,
          subtle,
        );
        if (e.seq !== position + 1 || failed) throw Error('Admission prefix is incomplete');
        const next = await acceptanceLink(
          {
            workspace: e.workspace_id,
            credential: e.credential_id,
            position: e.seq,
            epoch: e.epoch,
            digest: hex(e.digest),
          },
          link,
          subtle,
        );
        if (failed) throw Error('Admission prefix was invalidated');
        link = next;
        position = e.seq;
        if (h.boundaries.some((b) => position === b.position && link !== b.link))
          throw Error('Admission prefix boundary changed');
      } catch (cause) {
        failed = true;
        throw cause;
      } finally {
        busy = false;
      }
    },
    finish(): Readonly<{ position: number; link: string }> {
      if (busy || failed || position !== h.boundary.position || link !== h.boundary.link) {
        failed = true;
        throw Error('Admission requires the complete matching accepted prefix');
      }
      finished = true;
      return Object.freeze({ position, link });
    },
  });
}
