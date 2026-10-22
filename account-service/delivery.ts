import { reuseInboundAuthority, type InboundAuthorityReuse } from './inboundAuthorityReuse.ts';
import { isPrunedDecision, verifyPrunedDecision } from './prunedDecision.ts';
import { recoveryRows, type RecoveryRow } from './recoveryStore.ts';
import type {
  VerifiedMembership,
  RotatedRecipientCertificate,
} from '../account-protocol/membership.ts';
import { removalRow, rotationRows, type RotationRow, type RemovalRow } from './removalStore.ts';
import { verifyRemovalPreparation, type RemovalPreparation } from '../account-protocol/rotation.ts';
import { resolveMembershipDeliveryAuthority } from './membershipHistory.ts';
import {
  historyPublisher,
  historyMembership,
  historyGeneration,
  historyMinimumGeneration,
  type AdmissionHistory,
} from '../account-protocol/admissionHistory.ts';
import type { MembershipRecipientCertificate } from '../account-protocol/membershipDelivery.ts';
import { rethrowAuthorization, type OperationAuthorization } from './authorization.ts';
import {
  membershipRows,
  membershipTransferRows,
  membershipCancellationRows,
  type MembershipRow,
  type MembershipTransferRow,
  type MembershipCancellationRow,
} from './membershipStore.ts';
import {
  causeCode,
  reportDiagnostic,
  type Diagnostic,
  type DiagnosticSink,
} from '../account-protocol/diagnostics.ts';
import { LedgerIntegrityError } from './publisherTips.ts';
import type { DeliveryVerification } from './deliveryVerification.ts';
import type { ContentTransferRow } from './contentTransfer.ts';
import {
  CONTENT_DELIVERY_LIMIT,
  verifyContentDelivery,
  verifyCertificationSuccessor,
  type CertificationSuccessor,
} from '../account-protocol/contentDelivery.ts';
import {
  verifySuccessor,
  SUCCESSOR_LIMIT,
  type AdmissionSuccessor,
} from '../account-protocol/successor.ts';
import { parseRetainedActivation } from '../account-protocol/activation.ts';
/** Private first-lineage service decisions and authenticated readback. No content decryption. */
import {
  decodeReadRequest,
  encodeReadPage,
  readRequestMessage,
  readScopeMatches,
  readTimeValid,
  READ_REQUEST_LIMIT,
  type ReadPage,
} from '../account-protocol/deliveryTransport.ts';
import {
  decodeInboundRequest,
  encodeInboundPage,
  inboundRequestMessage,
  type InboundReadRequest,
  type InboundReadPage,
} from '../account-protocol/inboundTransport.ts';
import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {
  parseAdmissionRequest,
  parseReceipt,
  verifyAdmissionRequest,
  verifyReceipt,
  requestDigest,
} from '../account-protocol/admission.ts';
import { parsePendingState, closed } from '../account-protocol/preparation.ts';
import { hex, lp, unhex } from '../account-protocol/recovery.ts';
import {
  decodeNetworkEnvelope,
  ADMITTED_ENVELOPE_WIRE_LIMIT,
} from '../account-protocol/envelope.ts';
import {
  decodeSubmission,
  verifySubmission,
  SUBMISSION_LIMIT,
} from '../account-protocol/submission.ts';
import {
  decodePositionResponse,
  headMessage,
  acceptanceLink,
  verifyPositionResponse,
  ZERO_REFUSAL,
  type PositionResponse,
  type DecisionAuthority,
  type Bytes,
} from '../account-protocol/positionDecision.ts';
import type { AuthorityPin } from '../account-protocol/authority.ts';
import {
  parseWitness,
  witnessMessage,
  ZERO_LEDGER,
  type WitnessScope,
  type DeliveryWitness,
} from './deliveryWitness.ts';
export interface DeliveryIssuer {
  authorize?: OperationAuthorization;
  pin: AuthorityPin;
  check(seal: unknown, id: string, pub: string): void;
  issue(seal: unknown, id: string, pub: string, response: PositionResponse): Bytes;
  witness(
    seal: unknown,
    id: string,
    pub: string,
    scope: WitnessScope,
    value: Omit<DeliveryWitness, 'signature'>,
  ): DeliveryWitness;
}
export type ServiceDeliveryResult =
  | { kind: 'decision'; bytes: Bytes }
  | {
      kind: 'unknown';
      reason:
        | 'ledger-integrity'
        | 'invalid-request'
        | 'envelope-size'
        | 'unavailable'
        | 'unsupported-epoch'
        | 'out-of-order'
        | 'parent-required'
        | 'unissued-parent'
        | 'removal-pending'
        | 'state-changed'
        | 'storage-unavailable';
    };
export type DeliveryHook = (
  point: 'before-commit' | 'after-commit' | 'after-verify',
  operation: string,
) => void;
const unknown = (
  reason: Extract<ServiceDeliveryResult, { kind: 'unknown' }>['reason'],
): ServiceDeliveryResult => ({ kind: 'unknown', reason });
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const mismatch = 'epoch-generation-mismatch';
export interface DecisionRow {
  account_id: string;
  ordinal: number;
  position: number;
  digest: string;
  envelope_epoch: number;
  kind: 'accepted' | 'refused';
  submission: Uint8Array;
  response: Uint8Array;
}
interface Promotion {
  account_id: string;
  workspace_id: string;
  lineage_id: string;
  request_digest: string;
  request: string;
  offer: string;
  result: string | null;
  acceptance_seal: string;
  state: string;
  delivery_witness: string | null;
  activation: string | null;
  successor_head: string | null;
  removal_parent?: string | null;
}
export interface SuccessorRow {
  workspace_id: string;
  preparation_id: string;
  artifact: string;
  boundary_witness: string | null;
}
export interface WorkspaceAuthoritySnapshot {
  promotion: Promotion;
  account: { id: string; state: string };
  credential: { id: string; state: string };
  recovery: { attempt_id: string; state: string; draft: string; result: string | null };
  attempt: { id: string; account_id: string; mode: string; state: string; result: string | null };
  successor: SuccessorRow | null;
  transfer: ContentTransferRow | null;
  continuations?: MembershipRow[];
  membershipTransfers?: MembershipTransferRow[];
  membershipCancellations?: MembershipCancellationRow[];
  removalPreparation?: RemovalRow;
  rotations?: RotationRow[];
  recoveries?: RecoveryRow[];
}
export const PUBLISHER_SCHEMA = `
  CREATE TABLE publisher_decisions (
    credential_id TEXT NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(id),
    ordinal INTEGER NOT NULL CHECK(ordinal>0), position INTEGER NOT NULL CHECK(position>0),
    digest TEXT NOT NULL, envelope_epoch INTEGER NOT NULL CHECK(envelope_epoch>0),
    kind TEXT NOT NULL CHECK(kind IN ('accepted','refused')), submission BLOB NOT NULL, response BLOB NOT NULL,
    PRIMARY KEY(account_id,credential_id,position,digest,envelope_epoch), UNIQUE(account_id,credential_id,ordinal));
  CREATE UNIQUE INDEX publisher_accepted_position ON publisher_decisions(account_id,credential_id,position) WHERE kind='accepted';
  CREATE TABLE publisher_witnesses (account_id TEXT NOT NULL REFERENCES accounts(id), credential_id TEXT NOT NULL,
    witness TEXT NOT NULL, PRIMARY KEY(account_id,credential_id));`;
export interface Snapshot extends WorkspaceAuthoritySnapshot {
  publisher?: string;
  publisherWitness?: string | null;
  rows: DecisionRow[];
}
/** Caller owns a read or write transaction for a coherent authority snapshot. */
export function snapshotWorkspaceAuthority(
  db: DatabaseSync,
  workspace: string,
): WorkspaceAuthoritySnapshot | null {
  const promotion = db
    .prepare("SELECT * FROM promotions WHERE workspace_id=? AND state!='cancelled'")
    .get(workspace) as unknown as Promotion | undefined;
  if (!promotion) return null;
  const account = db
    .prepare('SELECT id,state FROM accounts WHERE id=?')
    .get(promotion.account_id) as Snapshot['account'];
  const credential = db
    .prepare('SELECT id,state FROM credentials WHERE account_id=?')
    .get(promotion.account_id) as Snapshot['credential'];
  const recovery = db
    .prepare('SELECT attempt_id,state,draft,result FROM recovery WHERE account_id=?')
    .get(promotion.account_id) as Snapshot['recovery'];
  const attempt =
    recovery &&
    (db
      .prepare('SELECT id,account_id,mode,state,result FROM attempts WHERE id=?')
      .get(recovery.attempt_id) as Snapshot['attempt']);
  if (
    promotion.state !== 'admitted' ||
    !promotion.result ||
    account?.state !== 'active' ||
    credential?.state !== 'confirmed' ||
    recovery?.state !== 'done' ||
    !recovery.result ||
    attempt?.state !== 'done' ||
    attempt.mode !== 'register' ||
    attempt.account_id !== account.id
  )
    return null;
  // This is a WebAuthn credential, not the workspace's certified signing member.
  // Bind it to the completed registration that authorized this recovery/promotion.
  const registration = closed(JSON.parse(attempt.result ?? 'null'), [
    'ok',
    'stage',
    'attemptId',
    'accountId',
    'credentialId',
    'receiptId',
  ]);
  if (
    registration['ok'] !== true ||
    registration['stage'] !== 'credential-confirmed' ||
    registration['attemptId'] !== attempt.id ||
    registration['accountId'] !== account.id ||
    registration['credentialId'] !== credential.id
  )
    return null;
  const successor =
    (db
      .prepare('SELECT * FROM workspace_successors WHERE workspace_id=?')
      .get(workspace) as unknown as SuccessorRow | undefined) ?? null;
  const recoveries = recoveryRows(db, workspace);
  if ((promotion.successor_head === null) !== (successor === null && !recoveries.length))
    throw Error('Incomplete current authority');
  const transfer =
    (db
      .prepare('SELECT * FROM content_transfers WHERE workspace_id=?')
      .get(workspace) as unknown as ContentTransferRow | undefined) ?? null;
  if (transfer && !successor) throw Error('Delivery without admission');
  const removalPreparation = removalRow(db, workspace);
  if (
    (promotion.removal_parent == null) !== (removalPreparation === null) ||
    (removalPreparation && promotion.removal_parent !== removalPreparation.parent)
  )
    throw Error('Incomplete removal preparation');
  const rotations = rotationRows(db, workspace);
  const continuations = membershipRows(db, workspace);
  const membershipTransfers = membershipTransferRows(db, workspace);
  const membershipCancellations = membershipCancellationRows(db, workspace);
  return {
    promotion,
    account,
    credential,
    recovery,
    attempt,
    successor,
    transfer,
    ...(removalPreparation ? { removalPreparation } : {}),
    ...(rotations.length ? { rotations } : {}),
    ...(recoveries.length ? { recoveries } : {}),
    ...(continuations.length ? { continuations } : {}),
    ...(membershipTransfers.length ? { membershipTransfers } : {}),
    ...(membershipCancellations.length ? { membershipCancellations } : {}),
  };
}
export function snapshot(
  db: DatabaseSync,
  workspace: string,
  publisher?: string,
  afterOrdinal = 0,
): Snapshot | null {
  const base = snapshotWorkspaceAuthority(db, workspace);
  if (!base) return null;
  const original = JSON.parse(base.promotion.request).candidate.signer;
  if (publisher && publisher !== original) {
    const rows = db
      .prepare(
        'SELECT account_id,ordinal,position,digest,envelope_epoch,kind,submission,response FROM publisher_decisions WHERE account_id=? AND credential_id=?' +
          (afterOrdinal ? ' AND ordinal>?' : '') +
          ' ORDER BY ordinal',
      )
      .all(
        base.account.id,
        publisher,
        ...(afterOrdinal ? [afterOrdinal] : []),
      ) as unknown as DecisionRow[];
    const retained = db
      .prepare('SELECT witness FROM publisher_witnesses WHERE account_id=? AND credential_id=?')
      .get(base.account.id, publisher);
    return {
      ...base,
      publisher,
      publisherWitness: (retained?.['witness'] as string) ?? null,
      rows,
    };
  }
  const rows = db
    .prepare(
      'SELECT * FROM delivery_decisions WHERE account_id=?' +
        (afterOrdinal ? ' AND ordinal>?' : '') +
        ' ORDER BY ordinal',
    )
    .all(base.account.id, ...(afterOrdinal ? [afterOrdinal] : [])) as unknown as DecisionRow[];
  return { ...base, rows };
}
export function snapshotBytes(s: Snapshot | null): string {
  if (!s) return 'null';
  return JSON.stringify({
    ...s,
    rows: s.rows.map((r) => ({
      ...r,
      submission: hex(new Uint8Array(r.submission)),
      response: hex(new Uint8Array(r.response)),
    })),
  });
}
export type SnapshotPurpose = 'membership-discovery';
export function snapshotBytesForPurpose(s: Snapshot | null, purpose?: SnapshotPurpose): string {
  // A joined publisher authenticates its own ledger. The first publisher's ordinary writing
  // changes only this witness, not the retained membership authority or requesting ledger.
  return snapshotBytes(
    purpose === 'membership-discovery' && s?.publisher
      ? { ...s, promotion: { ...s.promotion, delivery_witness: null } }
      : s,
  );
}

export function read(
  db: DatabaseSync,
  workspace: string,
  publisher?: string,
  reuse?: DeliveryVerification,
  options?: { after?: number; limit?: number; position?: number; purpose?: SnapshotPurpose },
) {
  db.exec('BEGIN');
  try {
    const s = reuse?.tips
      ? reuse.tips.capture(workspace, publisher, options)
      : snapshot(db, workspace, publisher);
    db.exec('COMMIT');
    return s;
  } finally {
    if (db.isTransaction) db.exec('ROLLBACK');
  }
}
export async function verifyWorkspaceAuthority(
  s: WorkspaceAuthoritySnapshot,
  issuer: Pick<DeliveryIssuer, 'pin' | 'check'>,
) {
  // Continuation mutation is a private development entry point until general history/transport
  // composition lands. The old 1–3 reader must never silently treat the old anchor as current.
  if (
    s.recoveries?.length ||
    s.rotations?.length ||
    s.continuations?.length ||
    s.membershipTransfers?.length ||
    s.membershipCancellations?.length
  )
    throw Error('Membership continuation requires its owned history path');
  const p = s.promotion,
    request = parseAdmissionRequest(JSON.parse(p.request)),
    receipt = parseReceipt(JSON.parse(p.result!));
  const saved = JSON.parse(s.recovery.result!),
    state = parsePendingState({
      v: 1,
      accountId: s.account.id,
      attemptId: s.attempt.id,
      status: 'eligible',
      draft: JSON.parse(s.recovery.draft),
      confirmation: {
        recoveryId: saved.recoveryId,
        draftDigest: saved.draftDigest,
        recoveryStateDigest: saved.recoveryStateDigest,
        receiptId: saved.receiptId,
      },
    });
  await verifyAdmissionRequest(request, state);
  await verifyReceipt(receipt, request, issuer.pin);
  const activation = parseRetainedActivation(JSON.parse(p.activation ?? 'null'));
  if (
    !activation.proofHash ||
    JSON.stringify(receipt.activation) !==
      JSON.stringify({ context: activation.challenge.context, proofHash: activation.proofHash })
  )
    throw Error('Activation record changed');
  if (receipt.activation.context.credentialId !== s.credential.id)
    throw Error('Activation credential changed');
  const epoch = receipt.offer.epoch;
  if (
    p.workspace_id !== request.candidate.workspaceId ||
    p.account_id !== request.candidate.accountId ||
    p.lineage_id !== epoch.lineageId ||
    p.request_digest !== (await requestDigest(request)) ||
    p.offer !== JSON.stringify(receipt.offer)
  )
    throw Error('Service membership changed');
  const member = request.certification.members[0],
    seal = JSON.parse(p.acceptance_seal);
  issuer.check(seal, p.request_digest, epoch.acceptancePublicKey);
  const key = await crypto.subtle.importKey('raw', unhex(member.sPub, 32), 'Ed25519', false, [
    'verify',
  ]);
  const firstA: DecisionAuthority = {
    workspace: p.workspace_id,
    lineage: p.lineage_id,
    head: receipt.offer.head,
    tip: epoch.epoch,
    acceptanceKey: epoch.acceptancePublicKey,
  };
  let successor: AdmissionSuccessor | null = null;
  if (s.successor) {
    if (Buffer.byteLength(s.successor.artifact) > SUCCESSOR_LIMIT)
      throw Error('Oversized retained successor');
    if (
      s.successor.boundary_witness !== null &&
      Buffer.byteLength(s.successor.boundary_witness) > 1024
    )
      throw Error('Oversized retained boundary witness');
    successor = await verifySuccessor(
      JSON.parse(s.successor.artifact),
      { pin: issuer.pin, request, receipt },
      { epoch: 1, head: firstA.head },
    );
    if (
      s.successor.workspace_id !== p.workspace_id ||
      (!s.transfer?.artifact && successor.head !== p.successor_head) ||
      successor.epoch.preparation.context.attemptId !== s.successor.preparation_id
    )
      throw Error('Current authority pointer changed');
  }
  const secondA = successor ? { ...firstA, tip: 2, head: successor.head } : firstA;
  let certificationSuccessor: CertificationSuccessor | null = null;
  if (s.transfer) {
    const row = s.transfer;
    if (
      !successor ||
      row.workspace_id !== p.workspace_id ||
      Buffer.byteLength(row.delivery) > CONTENT_DELIVERY_LIMIT ||
      (row.artifact && Buffer.byteLength(row.artifact) > CONTENT_DELIVERY_LIMIT) ||
      (row.boundary_witness && Buffer.byteLength(row.boundary_witness) > 1024) ||
      (!row.artifact && row.boundary_witness)
    )
      throw Error('Invalid retained transfer');
    const base = { pin: issuer.pin, request, receipt };
    const { delivery } = await verifyContentDelivery(JSON.parse(row.delivery), base, successor);
    if (row.artifact) {
      certificationSuccessor = await verifyCertificationSuccessor(
        JSON.parse(row.artifact),
        base,
        successor,
        delivery,
      );
      if (p.successor_head !== certificationSuccessor.head)
        throw Error('Current certification pointer changed');
    }
  }
  const a = certificationSuccessor
    ? { ...firstA, tip: 3, head: certificationSuccessor.head }
    : secondA;
  const certification = certificationSuccessor?.epoch.delivery.certificate ?? request.certification;
  const members = await Promise.all(
    certification.members.map(async (member) => ({
      id: member.id,
      key:
        member.id === request.certification.members[0].id
          ? key
          : await crypto.subtle.importKey('raw', unhex(member.sPub, 32), 'Ed25519', false, [
              'verify',
            ]),
    })),
  );
  const scope: WitnessScope = {
    workspace: a.workspace,
    credential: member.id,
    lineage: a.lineage,
    head: a.head,
    request: p.request_digest,
  };
  return {
    pin: { ...issuer.pin },
    a,
    scope,
    key,
    seal,
    generation: epoch.generation,
    credential: member.id,
    members,
    certification,
    firstA,
    secondA,
    successor,
    certificationSuccessor,
    certificationBoundary: s.transfer?.boundary_witness
      ? parseWitness(JSON.parse(s.transfer.boundary_witness))
      : null,
    boundaryWitness: s.successor?.boundary_witness
      ? parseWitness(JSON.parse(s.successor.boundary_witness))
      : null,
    request,
    receipt,
  };
}
export interface LedgerBoundary {
  successor: {
    head: string;
    epoch: { heads: { credentialId: string; position: number; link: string }[] };
  };
  witness: DeliveryWitness | null;
  authority: DecisionAuthority;
}
export type DeliveryAuthority = Omit<
  Awaited<ReturnType<typeof verifyWorkspaceAuthority>>,
  'certification' | 'generation'
> & {
  generation: number;
  certification:
    | Awaited<ReturnType<typeof verifyWorkspaceAuthority>>['certification']
    | MembershipRecipientCertificate
    | RotatedRecipientCertificate;
  removal?: RemovalPreparation;
  rotationParents?: ReadonlyMap<string, VerifiedMembership>;
  historicalMembers?: readonly { id: string; key: CryptoKey }[];
  joinedPublisher?: boolean;
  history?: AdmissionHistory;
  ledgerBoundaries?: ReadonlyMap<string, LedgerBoundary[]>;
};
type Authority = DeliveryAuthority;
export const verifyCurrentWorkspaceAuthority = async (
  s: WorkspaceAuthoritySnapshot,
  issuer: Pick<DeliveryIssuer, 'pin' | 'check'>,
): Promise<Authority> => {
  const auth: Authority =
    s.recoveries?.length ||
    s.rotations?.length ||
    s.continuations?.length ||
    s.membershipTransfers?.length ||
    s.membershipCancellations?.length ||
    s.removalPreparation
      ? await resolveMembershipDeliveryAuthority(s, issuer)
      : await verifyWorkspaceAuthority(s, issuer);
  if (!s.removalPreparation) return auth;
  if (!auth.history) throw Error('Removal needs verified membership');
  const row = s.removalPreparation;
  const removal = await verifyRemovalPreparation(
    JSON.parse(row.artifact),
    historyMembership(auth.history),
  );
  if (
    row.workspace_id !== auth.a.workspace ||
    row.parent !== auth.a.head ||
    row.target_id !== removal.request.targetId
  )
    throw Error('Retained removal scope changed');
  return { ...auth, removal };
};
/** A publisher starts at its own verified certification; it has no earlier ledger. */
export function selectPublisher(auth: Authority, publisher?: string): Authority {
  const id = publisher ?? auth.credential;
  const member = (auth.historicalMembers ?? auth.members).find((m) => m.id === id);
  if (auth.history && member) {
    const history = historyPublisher(auth.history, id);
    const finalAuthority = history.finalization
      ? history.authorities.find((a) => a.tip === history.finalization!.epoch)
      : undefined;
    return {
      ...auth,
      joinedPublisher: id !== auth.request.candidate.signer,
      credential: member.id,
      key: member.key,
      history,
      scope: { ...auth.scope, credential: member.id, head: finalAuthority?.head ?? auth.a.head },
    };
  }
  if (!publisher || publisher === auth.credential) return auth;
  const boundary = auth.certificationSuccessor?.epoch.heads.find(
    (h) => h.credentialId === publisher,
  );
  if (
    !member ||
    !boundary ||
    boundary.position !== 0 ||
    boundary.link !== ZERO_REFUSAL ||
    auth.a.tip !== 3
  )
    throw Error('Uncertified publisher');
  return {
    ...auth,
    joinedPublisher: true,
    credential: member.id,
    key: member.key,
    scope: { ...auth.scope, credential: member.id },
  };
}
function generationRefusal(
  auth: Authority,
  epoch: number,
  generation: number,
  issuance = auth.a.tip,
) {
  if (generation !== (auth.history ? historyGeneration(auth.history, epoch) : auth.generation))
    return mismatch;
  return auth.history && generation < historyMinimumGeneration(auth.history, issuance)
    ? 'retired-generation'
    : null;
}
async function verifyWire(bytes: Bytes, auth: Authority, maxEpoch = auth.a.tip) {
  const decoded = decodeSubmission(bytes),
    e = decodeNetworkEnvelope(decoded.envelope);
  if (e.epoch < (auth.history?.first.tip ?? (auth.joinedPublisher ? 3 : 1)) || e.epoch > maxEpoch)
    throw Error('Unsupported epoch');
  // These bounded admission/certification transitions preserve the original publisher and key.
  // A refusal successor is checked at its own mint epoch before current eligibility.
  const mintAuthority = auth.history
    ? auth.history.authorities.find((a) => a.tip === e.epoch)
    : e.epoch === 1
      ? auth.firstA
      : e.epoch === 2
        ? auth.secondA
        : auth.a;
  if (!mintAuthority) throw Error('Unknown envelope issuance authority');
  // The signed declared generation is checked as policy only after signature verification.
  const submission = await verifySubmission(
    bytes,
    {
      v: 2,
      workspace_id: auth.a.workspace,
      credential_id: auth.credential,
      epoch: e.epoch,
      gen: e.gen,
    },
    auth.key,
    mintAuthority,
  );
  return {
    submission,
    e,
    subject: {
      workspace: e.workspace_id,
      credential: e.credential_id,
      position: e.seq,
      digest: hex(e.digest),
      epoch: e.epoch,
    },
  };
}
const subjectKey = (e: { position: number; digest: string; epoch: number }) =>
  JSON.stringify([e.position, e.digest, e.epoch]);
function extend(
  previous: string,
  ordinal: number,
  submission: Uint8Array,
  response: Uint8Array,
  originalHash = hash(submission),
) {
  return hash(
    lp('done/service-delivery-chain/v1', previous, String(ordinal), originalHash, hash(response)),
  );
}
async function verifyLedgerWitness(
  witness: DeliveryWitness | null,
  auth: Authority,
  count: number,
  commitment: string,
): Promise<void> {
  if ((witness?.events ?? 0) !== count) throw Error('Incomplete delivery ledger');
  if (witness) {
    const key = await crypto.subtle.importKey(
      'raw',
      unhex(auth.a.acceptanceKey, 32),
      'Ed25519',
      false,
      ['verify'],
    );
    if (
      !(await crypto.subtle.verify(
        'Ed25519',
        key,
        unhex(witness.signature, 64),
        witnessMessage(auth.scope, witness),
      ))
    )
      throw Error('Delivery witness signature');
  }
  if (commitment !== (witness?.hash ?? ZERO_LEDGER)) throw Error('Delivery ledger commitment');
}
export async function census(s: Snapshot, auth: Authority, reuse?: DeliveryVerification) {
  const prefix = reuse?.tips?.prefix(s);
  let count = prefix?.count ?? 0,
    commitment = prefix?.commitment ?? ZERO_LEDGER,
    through = prefix?.through ?? 0,
    previous = prefix?.previous ?? ZERO_REFUSAL;
  const accepted = new Map<number, Bytes>(),
    refused = new Map<string, Bytes>(),
    issued = new Map<string, number>(),
    closedPositions = new Set<number>();
  const witness =
    (s.publisher ? s.publisherWitness : s.promotion.delivery_witness) == null
      ? null
      : parseWitness(
          JSON.parse((s.publisher ? s.publisherWitness : s.promotion.delivery_witness)!),
        );
  // Authority freshly authenticates scope.request (the complete request digest) on every request.
  // Bind generation and predecessor too; SQL columns, ordering, parent issuance and witness replay.
  const scope = JSON.stringify([auth.a, auth.scope, auth.generation]);
  const boundaries = auth.ledgerBoundaries?.get(auth.credential) ?? [
    ...(!auth.joinedPublisher && auth.successor
      ? [{ successor: auth.successor, witness: auth.boundaryWitness, authority: auth.firstA }]
      : []),
    ...(auth.certificationSuccessor
      ? [
          {
            successor: auth.certificationSuccessor,
            witness: auth.joinedPublisher ? null : auth.certificationBoundary,
            authority: auth.secondA,
          },
        ]
      : []),
  ];
  if (
    boundaries.some(
      (b, i) => i > 0 && (b.witness?.events ?? 0) < (boundaries[i - 1]!.witness?.events ?? 0),
    )
  )
    throw Error('Reversed authority boundaries');
  const boundaryScope = JSON.stringify(boundaries);
  const checkedBoundaries = new Set<string>(
    boundaries.filter((b) => (b.witness?.events ?? 0) < count).map((b) => b.successor.head),
  );
  const checkBoundary = async () => {
    for (const b of boundaries) {
      if (count !== (b.witness?.events ?? 0)) continue;
      const expected = b.successor.epoch.heads.find((v) => v.credentialId === auth.credential)!;
      if (!expected || expected.position !== through || expected.link !== previous)
        throw Error('Successor accepted prefix changed');
      await verifyLedgerWitness(
        b.witness,
        { ...auth, a: b.authority, scope: { ...auth.scope, head: b.authority.head } },
        count,
        commitment,
      );
      checkedBoundaries.add(b.successor.head);
    }
  };
  await checkBoundary();
  for (const row of s.rows) {
    const bytes = new Uint8Array(row.submission),
      response = new Uint8Array(row.response),
      before = previous;
    const verify = async () => {
      const issuance =
        boundaries.find((b) => row.ordinal <= (b.witness?.events ?? 0))?.authority ?? auth.a;
      if (isPrunedDecision(bytes) && row.kind !== 'accepted')
        throw Error('Refusal evidence cannot be pruned');
      const opened = isPrunedDecision(bytes)
        ? await verifyPrunedDecision(bytes, response, auth, row.ordinal, issuance.tip)
        : { ...(await verifyWire(bytes, auth, issuance.tip)), originalHash: hash(bytes) };
      const proof = await verifyPositionResponse(
        response,
        { ...opened.subject, previous: before, parent: opened.submission.parentId },
        issuance,
      );
      return { ...opened, proof, issuance };
    };
    const { e, submission, subject, proof, issuance, originalHash } =
      reuse && !reuse.tips
        ? await reuse.check(
            s.account.id + ':' + auth.credential + ':' + row.ordinal,
            scope + ':' + boundaryScope + ':' + previous,
            [bytes, response],
            verify,
          )
        : await verify();
    if (
      row.account_id !== s.account.id ||
      row.ordinal !== count + 1 ||
      row.position !== e.seq ||
      row.digest !== hex(e.digest) ||
      row.envelope_epoch !== e.epoch ||
      e.seq !== through + 1
    )
      throw Error('Delivery ledger position');
    if (
      submission.parentId !== ZERO_REFUSAL
        ? issued.get(submission.parentId) !== e.seq
        : closedPositions.has(e.seq)
    )
      throw Error('Unissued ledger parent');
    if (row.kind === 'accepted') {
      if (
        proof.kind !== 'accepted' ||
        proof.head.final ||
        (auth.history?.finalization &&
          (e.seq > auth.history.finalization.position ||
            e.epoch >= auth.history.finalization.epoch)) ||
        generationRefusal(auth, e.epoch, e.gen, issuance.tip) !== null ||
        refused.has(subjectKey(subject))
      )
        throw Error('Invalid accepted decision');
      through = e.seq;
      previous = proof.head.link;
      accepted.set(e.seq, response);
    } else if (row.kind === 'refused') {
      if (
        proof.kind !== 'refused' ||
        proof.refusal.reason !== generationRefusal(auth, e.epoch, e.gen, issuance.tip) ||
        refused.has(subjectKey(subject))
      )
        throw Error('Invalid closure decision');
      issued.set(proof.refusalId, e.seq);
      closedPositions.add(e.seq);
      refused.set(subjectKey(subject), response);
    } else throw Error('Unknown service decision');
    count++;
    commitment = extend(commitment, count, bytes, response, originalHash);
    await checkBoundary();
  }
  if (checkedBoundaries.size !== boundaries.length) throw Error('Missing successor boundary');
  await verifyLedgerWitness(witness, auth, count, commitment);
  const result = {
    count,
    commitment,
    through,
    previous,
    accepted,
    refused,
    issued,
    closedPositions,
  };
  reuse?.tips?.remember(s, auth, result);
  return result;
}
export async function verifiedCensus(s: Snapshot, auth: Authority, reuse?: DeliveryVerification) {
  try {
    return await census(s, auth, reuse);
  } catch (cause) {
    if (reuse?.tips && !(cause instanceof LedgerIntegrityError)) reuse.tips.failure(s);
    throw cause;
  }
}
export function unchanged(
  db: DatabaseSync,
  s: Snapshot,
  reuse?: DeliveryVerification,
  purpose?: SnapshotPurpose,
) {
  return reuse?.tips
    ? reuse.tips.guard(s, purpose)
    : snapshotBytesForPurpose(snapshot(db, s.promotion.workspace_id, s.publisher), purpose) ===
        snapshotBytesForPurpose(s, purpose);
}
/** Freshly authenticate the predecessor's signed link and every row actually served. */
export async function verifyServed(
  s: Snapshot,
  auth: Authority,
  after: number,
  reuse?: DeliveryVerification,
) {
  const selected = reuse?.tips?.served(s);
  if (!selected) return s.rows;
  try {
    let previous = ZERO_REFUSAL;
    const result = [];
    for (const row of selected) {
      reuse!.tips!.checkedServed();
      if (row.account_id !== s.account.id || row.kind !== 'accepted' || row.ordinal < 1)
        throw Error('Invalid served row');
      const response = new Uint8Array(row.response),
        decoded = decodePositionResponse(response);
      if (
        decoded.kind !== 'accepted' ||
        decoded.head.final ||
        decoded.head.workspace !== auth.a.workspace ||
        decoded.head.credential !== auth.credential ||
        decoded.head.position !== row.position
      )
        throw Error('Invalid served head');
      const boundaries = auth.ledgerBoundaries?.get(auth.credential) ?? [
        ...(!auth.joinedPublisher && auth.successor
          ? [{ witness: auth.boundaryWitness, authority: auth.firstA }]
          : []),
        ...(auth.certificationSuccessor
          ? [
              {
                witness: auth.joinedPublisher ? null : auth.certificationBoundary,
                authority: auth.secondA,
              },
            ]
          : []),
      ];
      const issuance =
        boundaries.find((b) => row.ordinal <= (b.witness?.events ?? 0))?.authority ?? auth.a;
      if (decoded.head.epoch !== issuance.tip) throw Error('Invalid served epoch');
      if (row.position === after) {
        const key = await crypto.subtle.importKey(
          'raw',
          unhex(issuance.acceptanceKey, 32),
          'Ed25519',
          false,
          ['verify'],
        );
        if (
          !(await crypto.subtle.verify(
            'Ed25519',
            key,
            unhex(decoded.head.signature, 64),
            headMessage(decoded.head),
          ))
        )
          throw Error('Invalid predecessor');
      } else {
        if (
          row.position !== after + result.length + 1 ||
          (after && !result.length && selected[0]?.position !== after)
        )
          throw Error('Missing served predecessor');
        const opened = isPrunedDecision(row.submission)
          ? await verifyPrunedDecision(
              new Uint8Array(row.submission),
              response,
              auth,
              row.ordinal,
              issuance.tip,
            )
          : await verifyWire(new Uint8Array(row.submission), auth, issuance.tip);
        const proof = await verifyPositionResponse(
          response,
          { ...opened.subject, previous, parent: opened.submission.parentId },
          issuance,
        );
        if (
          proof.kind !== 'accepted' ||
          row.digest !== opened.subject.digest ||
          row.envelope_epoch !== opened.e.epoch ||
          row.position !== opened.e.seq ||
          generationRefusal(auth, opened.e.epoch, opened.e.gen, issuance.tip) !== null
        )
          throw Error('Invalid served decision');
        result.push(row);
      }
      previous = decoded.head.link;
    }
    return result;
  } catch (cause) {
    reuse!.tips!.failure(s);
    throw cause;
  }
}
export async function decideSubmission(
  db: DatabaseSync,
  input: unknown,
  issuer: DeliveryIssuer,
  hook: DeliveryHook,
  reuse?: DeliveryVerification,
  diagnostics?: DiagnosticSink,
): Promise<ServiceDeliveryResult> {
  let phase: Diagnostic['phase'] = 'request';
  const note = (cause: unknown) =>
    reportDiagnostic(diagnostics, { operation: 'submit', phase, code: causeCode(cause) });
  let workspace: string, publisher: string, bytes: Bytes;
  try {
    const r = closed(input, ['workspaceId', 'bytes']);
    unhex(r['workspaceId'], 16);
    if (!(r['bytes'] instanceof Uint8Array) || r['bytes'].length > SUBMISSION_LIMIT)
      throw Error('Submission size');
    workspace = r['workspaceId'] as string;
    bytes = new Uint8Array(r['bytes']);
    publisher = decodeNetworkEnvelope(decodeSubmission(bytes).envelope).credential_id;
  } catch (cause) {
    note(cause);
    return unknown('invalid-request');
  }
  // Retries after a competing commit reread and reverify; no async work holds a SQL transaction.
  let releaseCold: (() => void) | undefined;
  try {
    for (let retry = 0; retry < 4; retry++) {
      let s: Snapshot | null;
      try {
        phase = 'storage';
        s = read(db, workspace, publisher, reuse, {
          position: decodeNetworkEnvelope(decodeSubmission(bytes).envelope).seq,
        });
      } catch (cause) {
        note(cause);
        return unknown(
          cause instanceof LedgerIntegrityError ? 'ledger-integrity' : 'storage-unavailable',
        );
      }
      if (!s) return unknown('unavailable');
      let auth: Authority, ledger: Awaited<ReturnType<typeof census>>;
      try {
        phase = 'verify';
        auth = selectPublisher(await verifyCurrentWorkspaceAuthority(s, issuer), s.publisher);
        if (!releaseCold && reuse?.tips) {
          const pending = reuse.tips.enter(workspace, publisher);
          const waited = pending instanceof Promise;
          releaseCold = await pending;
          if (waited) {
            // Scheduling did not attempt a native guard. Recapture and authenticate this
            // request afresh on its turn; the four competing-commit attempts stay intact.
            retry--;
            continue;
          }
        }
        ledger = await verifiedCensus(s, auth, reuse);
        if (auth.removal?.request.targetId === auth.credential) {
          const cut = auth.removal.cutoff.find((h) => h.credentialId === auth.credential)!;
          if (ledger.through !== cut.position || ledger.previous !== cut.link)
            throw Error('Prepared removal cutoff changed');
        }
      } catch (cause) {
        note(cause);
        reuse?.clear();
        return unknown(cause instanceof LedgerIntegrityError ? 'ledger-integrity' : 'unavailable');
      }
      const envelope = decodeNetworkEnvelope(decodeSubmission(bytes).envelope);
      if (envelope.epoch < 1 || envelope.epoch > auth.a.tip) return unknown('unsupported-epoch');
      let verified: Awaited<ReturnType<typeof verifyWire>>;
      try {
        verified = await verifyWire(bytes, auth);
      } catch (cause) {
        note(cause);
        return unknown('invalid-request');
      }
      const { e, subject, submission } = verified;
      let proposed: PositionResponse | undefined, result: ServiceDeliveryResult;
      if (submission.parentId !== ZERO_REFUSAL && ledger.issued.get(submission.parentId) !== e.seq)
        result = unknown('unissued-parent');
      else if (ledger.refused.has(subjectKey(subject)))
        result = { kind: 'decision', bytes: ledger.refused.get(subjectKey(subject))!.slice() };
      else if (ledger.accepted.has(e.seq))
        result = { kind: 'decision', bytes: ledger.accepted.get(e.seq)!.slice() };
      else if (auth.history?.finalization) result = unknown('unavailable');
      else if (auth.removal?.request.targetId === auth.credential)
        result = unknown('removal-pending');
      else if (e.seq !== ledger.through + 1) result = unknown('out-of-order');
      else if (submission.parentId === ZERO_REFUSAL && ledger.closedPositions.has(e.seq))
        result = unknown('parent-required');
      // Admission only: census and exact historical decision retries must remain readable.
      else if (submission.envelope.length > ADMITTED_ENVELOPE_WIRE_LIMIT) {
        reportDiagnostic(diagnostics, {
          operation: 'submit',
          phase: 'verify',
          code: 'envelope-size',
        });
        result = unknown('envelope-size');
      } else {
        proposed =
          generationRefusal(auth, e.epoch, e.gen) !== null
            ? {
                kind: 'refused',
                refusal: {
                  ...subject,
                  reason: generationRefusal(auth, e.epoch, e.gen)!,
                  parent: submission.parentId,
                  signature: '00'.repeat(64),
                },
              }
            : {
                kind: 'accepted',
                head: {
                  workspace,
                  credential: auth.credential,
                  position: e.seq,
                  epoch: auth.a.tip,
                  link: await acceptanceLink(subject, ledger.previous),
                  final: false,
                  signature: '00'.repeat(64),
                },
                leaf: { epoch: e.epoch, digest: hex(e.digest) },
              };
        result = unknown('storage-unavailable');
      }
      try {
        phase = 'commit';
        hook('after-verify', 'decide-submission');
        db.exec('BEGIN IMMEDIATE');
        if (!unchanged(db, s, reuse)) {
          db.exec('ROLLBACK');
          continue;
        }
        const completeAuthorization = issuer.authorize?.(db, {
          kind: 'workspace',
          workspaceId: workspace,
          credentialId: publisher,
          action: 'submit',
        });
        // Reopen custody after asynchronous verification and before fixed-purpose signing.
        issuer.check(auth.seal, s.promotion.request_digest, auth.a.acceptanceKey);
        if (proposed) {
          const response = issuer.issue(
              auth.seal,
              s.promotion.request_digest,
              auth.a.acceptanceKey,
              proposed,
            ),
            ordinal = ledger.count + 1,
            witness = issuer.witness(
              auth.seal,
              s.promotion.request_digest,
              auth.a.acceptanceKey,
              auth.scope,
              { events: ordinal, hash: extend(ledger.commitment, ordinal, bytes, response) },
            );
          const values = [
            s.account.id,
            ordinal,
            e.seq,
            hex(e.digest),
            e.epoch,
            proposed.kind,
            bytes,
            response,
          ];
          if (s.publisher) {
            db.prepare('INSERT INTO publisher_decisions VALUES (?,?,?,?,?,?,?,?,?)').run(
              s.publisher,
              ...values,
            );
            db.prepare(
              'INSERT INTO publisher_witnesses VALUES (?,?,?) ON CONFLICT(account_id,credential_id) DO UPDATE SET witness=excluded.witness',
            ).run(s.account.id, s.publisher, JSON.stringify(witness));
          } else {
            db.prepare('INSERT INTO delivery_decisions VALUES (?,?,?,?,?,?,?,?)').run(...values);
            db.prepare('UPDATE promotions SET delivery_witness=? WHERE account_id=?').run(
              JSON.stringify(witness),
              s.account.id,
            );
          }
          result = { kind: 'decision', bytes: response };
        }
        phase = 'commit';
        hook('before-commit', 'decide-submission');
        completeAuthorization?.();
        db.exec('COMMIT');
        if (proposed) reuse?.tips?.committed(s);
        hook('after-commit', 'decide-submission');
        return result;
      } catch (cause) {
        note(cause);
        reuse?.clear();
        if (db.isTransaction) db.exec('ROLLBACK');
        rethrowAuthorization(cause);
        return unknown(
          cause instanceof LedgerIntegrityError ? 'ledger-integrity' : 'storage-unavailable',
        );
      }
    }
    return unknown('state-changed');
  } finally {
    releaseCold?.();
  }
}

export interface ReadIssuer extends DeliveryIssuer {
  page(seal: unknown, id: string, pub: string, value: ReadPage): Bytes;
}
export interface InboundReadIssuer extends DeliveryIssuer {
  inboundPage(seal: unknown, id: string, pub: string, value: InboundReadPage): Bytes;
}
/** Reuses decision authority and the witnessed census; a workspace selector is never read authority. */
export async function readAccepted(
  db: DatabaseSync,
  input: unknown,
  issuer: ReadIssuer,
  hook: DeliveryHook,
  reuse?: DeliveryVerification,
  diagnostics?: DiagnosticSink,
): Promise<ServiceDeliveryResult> {
  let phase: Diagnostic['phase'] = 'request';
  const note = (cause: unknown) =>
    reportDiagnostic(diagnostics, { operation: 'read', phase, code: causeCode(cause) });
  let bytes: Bytes, request: ReturnType<typeof decodeReadRequest>;
  try {
    if (!(input instanceof Uint8Array) || input.length > READ_REQUEST_LIMIT)
      throw Error('Read bytes required');
    bytes = new Uint8Array(input);
    request = decodeReadRequest(bytes);
  } catch (cause) {
    note(cause);
    return unknown('invalid-request');
  }
  let releaseCold: (() => void) | undefined;
  try {
    for (let retry = 0; retry < 4; retry++) {
      try {
        phase = 'storage';
        const s = read(db, request.workspace, request.credential, reuse, {
          after: request.after,
          limit: request.limit,
        });
        if (!s) return unknown('unavailable');
        phase = 'verify';
        const auth = selectPublisher(await verifyCurrentWorkspaceAuthority(s, issuer), s.publisher);
        if (
          auth.history?.finalization ||
          !readScopeMatches(request, issuer.pin, auth.a, auth.credential) ||
          !readTimeValid(request, Date.now()) ||
          !(await crypto.subtle.verify(
            'Ed25519',
            auth.key,
            unhex(request.signature, 64),
            readRequestMessage(request),
          ))
        )
          return unknown('invalid-request');
        if (!releaseCold && reuse?.tips) {
          const pending = reuse.tips.enter(request.workspace, request.credential);
          const waited = pending instanceof Promise;
          releaseCold = await pending;
          if (waited) {
            // Scheduling did not attempt a native guard. Recapture and authenticate this
            // request afresh on its turn; the four competing-commit attempts stay intact.
            retry--;
            continue;
          }
        }
        const ledger = await verifiedCensus(s, auth, reuse);
        if (request.after > ledger.through) return unknown('out-of-order');
        const page: ReadPage = {
          request: hash(bytes),
          through: ledger.through,
          next: request.after,
          entries: [],
          signature: '00'.repeat(64),
        };
        for (const row of await verifyServed(s, auth, request.after, reuse)) {
          if (row.kind !== 'accepted' || row.position <= request.after) continue;
          if (isPrunedDecision(row.submission)) return unknown('unavailable');
          const entry = {
            envelope: decodeSubmission(new Uint8Array(row.submission)).envelope,
            proof: new Uint8Array(row.response),
          };
          page.entries.push(entry);
          page.next++;
          try {
            encodeReadPage(page);
          } catch {
            page.entries.pop();
            page.next--;
            break;
          }
          if (page.entries.length === request.limit) break;
        }
        if (page.next < page.through && !page.entries.length) return unknown('unavailable');
        phase = 'commit';
        hook('after-verify', 'read-accepted');
        db.exec('BEGIN');
        if (!unchanged(db, s, reuse)) {
          db.exec('ROLLBACK');
          continue;
        }
        if (!readTimeValid(request, Date.now())) {
          db.exec('ROLLBACK');
          return unknown('invalid-request');
        }
        issuer.check(auth.seal, s.promotion.request_digest, auth.a.acceptanceKey);
        const completeAuthorization = issuer.authorize?.(db, {
          kind: 'workspace',
          workspaceId: request.workspace,
          credentialId: request.credential,
          action: 'read',
        });
        const answer = issuer.page(
          auth.seal,
          s.promotion.request_digest,
          auth.a.acceptanceKey,
          page,
        );
        completeAuthorization?.();
        db.exec('COMMIT');
        return { kind: 'decision', bytes: answer };
      } catch (cause) {
        note(cause);
        reuse?.clear();
        if (db.isTransaction) db.exec('ROLLBACK');
        rethrowAuthorization(cause);
        return unknown(cause instanceof LedgerIntegrityError ? 'ledger-integrity' : 'unavailable');
      }
    }
    return unknown('state-changed');
  } finally {
    releaseCold?.();
  }
}

function resolveInboundRoles(auth: Authority, request: InboundReadRequest) {
  // Membership comes only from the verified admission/epoch. These are separate
  // lookups even though the closed first epoch certifies only its creating member.
  const reader = auth.members.find((member) => member.id === request.reader);
  const publisher = (auth.historicalMembers ?? auth.members).find(
    (member) => member.id === request.publisher,
  );
  if (!reader || !publisher) throw Error('Unsupported inbound member');
  return { reader, publisher };
}

/** V2 is a separate purpose and route; it cannot reinterpret a v1 spool read. */
export async function readInbound(
  db: DatabaseSync,
  input: unknown,
  issuer: InboundReadIssuer,
  hook: DeliveryHook,
  reuse?: DeliveryVerification,
  diagnostics?: DiagnosticSink,
  authorityReuse?: InboundAuthorityReuse,
): Promise<ServiceDeliveryResult> {
  let phase: Diagnostic['phase'] = 'request';
  const note = (cause: unknown) =>
    reportDiagnostic(diagnostics, { operation: 'read-v2', phase, code: causeCode(cause) });
  let bytes: Bytes, request: InboundReadRequest;
  try {
    if (!(input instanceof Uint8Array) || input.length > READ_REQUEST_LIMIT)
      throw Error('Read bytes required');
    bytes = new Uint8Array(input);
    request = decodeInboundRequest(bytes);
  } catch (cause) {
    note(cause);
    return unknown('invalid-request');
  }
  const live = () => {
    const now = Date.now();
    return request.expires > now && request.expires <= now + 60000;
  };
  let releaseCold: (() => void) | undefined;
  try {
    for (let retry = 0; retry < 4; retry++) {
      try {
        phase = 'storage';
        const s = read(db, request.workspace, request.publisher, reuse, {
          after: request.after,
          limit: request.limit,
        });
        if (!s) return unknown('unavailable');
        const auth = selectPublisher(
            await reuseInboundAuthority(authorityReuse, s, issuer, verifyCurrentWorkspaceAuthority),
            s.publisher,
          ),
          { reader, publisher } = resolveInboundRoles(auth, request);
        if (
          request.serviceId !== issuer.pin.serviceId ||
          request.origin !== issuer.pin.origin ||
          request.workspace !== auth.a.workspace ||
          request.lineage !== auth.a.lineage ||
          request.head !== auth.a.head ||
          request.epoch !== auth.a.tip ||
          (!auth.history && ![1, 2, 3].includes(auth.a.tip)) ||
          !live() ||
          !(await crypto.subtle.verify(
            'Ed25519',
            reader.key,
            unhex(request.signature, 64),
            inboundRequestMessage(request),
          ))
        )
          return unknown('invalid-request');
        // Each certified publisher has an independently witnessed position sequence.
        if (publisher.id !== auth.scope.credential) return unknown('unavailable');
        if (!releaseCold && reuse?.tips) {
          const pending = reuse.tips.enter(request.workspace, request.publisher);
          const waited = pending instanceof Promise;
          releaseCold = await pending;
          if (waited) {
            // Scheduling did not attempt a native guard. Recapture and authenticate this
            // request afresh on its turn; the four competing-commit attempts stay intact.
            retry--;
            continue;
          }
        }
        const ledger = await verifiedCensus(s, auth, reuse);
        if (request.after > ledger.through) return unknown('out-of-order');
        const page: InboundReadPage = {
          request: hash(bytes),
          through: ledger.through,
          next: request.after,
          entries: [],
          signature: '00'.repeat(64),
        };
        for (const row of await verifyServed(s, auth, request.after, reuse)) {
          if (row.kind !== 'accepted' || row.position <= request.after) continue;
          if (isPrunedDecision(row.submission)) return unknown('unavailable');
          page.entries.push({
            envelope: decodeSubmission(new Uint8Array(row.submission)).envelope,
            proof: new Uint8Array(row.response),
          });
          page.next++;
          try {
            encodeInboundPage(page);
          } catch {
            page.entries.pop();
            page.next--;
            break;
          }
          if (page.entries.length === request.limit) break;
        }
        if (!page.entries.length && page.next < page.through) return unknown('unavailable');
        phase = 'commit';
        hook('after-verify', 'read-inbound');
        db.exec('BEGIN IMMEDIATE');
        const current = unchanged(db, s, reuse);
        if (!current) {
          db.exec('ROLLBACK');
          continue;
        }
        if (!live()) {
          db.exec('ROLLBACK');
          return unknown('invalid-request');
        }
        issuer.check(auth.seal, s.promotion.request_digest, auth.a.acceptanceKey);
        const completeAuthorization = issuer.authorize?.(db, {
          kind: 'workspace',
          workspaceId: request.workspace,
          credentialId: request.reader,
          action: 'read',
        });
        const answer = issuer.inboundPage(
          auth.seal,
          s.promotion.request_digest,
          auth.a.acceptanceKey,
          page,
        );
        // Fixed-purpose signing is synchronous; expiry/closed custody can still
        // change during a slow signing call. Withhold bytes on its far side too.
        issuer.check(auth.seal, s.promotion.request_digest, auth.a.acceptanceKey);
        if (!live()) {
          db.exec('ROLLBACK');
          return unknown('invalid-request');
        }
        completeAuthorization?.();
        db.exec('COMMIT');
        return { kind: 'decision', bytes: answer };
      } catch (cause) {
        note(cause);
        reuse?.clear();
        if (db.isTransaction) db.exec('ROLLBACK');
        rethrowAuthorization(cause);
        return unknown(cause instanceof LedgerIntegrityError ? 'ledger-integrity' : 'unavailable');
      }
    }
    return unknown('state-changed');
  } finally {
    releaseCold?.();
  }
}
