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

export interface AdmissionHistory {
  readonly first: Readonly<DecisionAuthority>;
  readonly current: Readonly<DecisionAuthority>;
  readonly credential: string;
  readonly principal: string;
  readonly signingKey: string;
  readonly boundary: Readonly<{ position: number; link: string }>;
  readonly authorities: readonly Readonly<DecisionAuthority>[];
  readonly boundaries: readonly Readonly<{ position: number; link: string }>[];
  readonly readers: readonly Readonly<{ id: string; publicKey: string }>[];
}
const verified = new WeakSet<AdmissionHistory>();
const publisherRoots = new WeakMap<AdmissionHistory, AdmissionHistory>();
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
  verified.add(result);
  return result;
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
  if (at.tip < 3) return id === h.credential && publicKey === h.signingKey;
  return h.readers.some((r) => r.id === id && r.publicKey === publicKey);
}
/** Derive a publisher route only from already verified certification, never a caller's key hint. */
export function historyPublisher(history: AdmissionHistory, credential: string): AdmissionHistory {
  const checked = requireHistory(history);
  const h = publisherRoots.get(checked) ?? checked;
  if (credential === h.credential) return h;
  const member = h.readers.find((r) => r.id === credential);
  if (h.current.tip !== 3 || !member) throw Error('Uncertified publisher');
  const empty = Object.freeze({ position: 0, link: ZERO_REFUSAL });
  const result = Object.freeze({
    ...h,
    first: h.current,
    credential,
    signingKey: member.publicKey,
    boundary: empty,
    authorities: Object.freeze([h.current]),
    boundaries: Object.freeze([]),
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
    r.gen !== 1 ||
    !h.authorities.some((a) => a.tip === r.epoch) ||
    !h.authorities.some((a) => a.tip === epoch) ||
    epoch > r.epoch
  )
    throw Error('Envelope is outside verified admission history');
  return { ...r, epoch };
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
    epoch: 1,
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
          maxEpoch = h.boundaries.findIndex((b) => decoded.seq <= b.position) + 1;
        if (!maxEpoch || decoded.epoch > maxEpoch)
          throw Error('Envelope crosses authority boundary');
        const e = await verifyNetworkEnvelope(
          bytes,
          historyEnvelopeRoute(h, { ...route, epoch: maxEpoch }, decoded.epoch),
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
