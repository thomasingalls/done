/** Verified context for the ONE admission-only successor. No storage, installation or send authority. */
import { verifySuccessor, type SuccessorBase, type AuthorityAnchor } from './successor.ts';
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
import { verifyNetworkEnvelope, ENVELOPE_WIRE_LIMIT, type EnvelopeRoute } from './envelope.ts';
import { hex, unhex } from './recovery.ts';

export interface AdmissionHistory {
  readonly first: Readonly<DecisionAuthority>;
  readonly current: Readonly<DecisionAuthority>;
  readonly credential: string;
  readonly principal: string;
  readonly signingKey: string;
  readonly boundary: Readonly<{ position: number; link: string }>;
}
const verified = new WeakSet<AdmissionHistory>();
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
  const result = Object.freeze({
    first,
    current: captureAuthority({ ...first, tip: 2, head: successor.head }),
    credential: member.id,
    principal: e.principalId,
    signingKey: member.sPub,
    boundary: Object.freeze({ position: boundary.position, link: boundary.link }),
  });
  verified.add(result);
  return result;
}
/** Both historical and current contexts must name an exact authenticated head, never just a tip. */
export function historyAuthority(
  history: AdmissionHistory,
  input: DecisionAuthority,
): Readonly<DecisionAuthority> {
  const h = requireHistory(history),
    a = captureAuthority(input),
    expected = a.tip === 1 ? h.first : h.current;
  if (
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
    (r.epoch !== 1 && r.epoch !== 2) ||
    (epoch !== 1 && epoch !== 2) ||
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
      const old = response.head.epoch === 1;
      if (
        response.head.epoch > current.tip ||
        response.head.epoch !== (response.head.position <= h.boundary.position ? 1 : 2) ||
        (response.head.position === h.boundary.position && response.head.link !== h.boundary.link)
      )
        return { kind: 'unknown' };
      issuance = old ? h.first : h.current;
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
          e = await verifyNetworkEnvelope(bytes, route, key, subtle);
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
