/** Witnessed additive snapshot installation. It grants no cursor advance or deletion permission. */
import { historyMembershipAt } from '../../account-protocol/admissionHistory';
import { membershipState } from '../../account-protocol/membership';
import {
  parseHistoryCheckpoint,
  parseHistoryCheckpointAdmission,
  verifyHistoryCheckpointAdmission,
  historyCheckpointHash,
  type HistoryCheckpoint,
  type HistoryCheckpointAdmission,
} from '../../account-protocol/historyCheckpoint';
import {
  inboundHex,
  inboundInteger,
  parseInboundArray,
} from '../../account-protocol/inboundTransport';
import { openHistoryCheckpoint } from './historyCheckpoint';
import { generationKey } from './generationKeys';
import { MAX_BATCH_BYTES } from './contentRecord';
import { Y } from './yjs';
import type { InboundContext, InboundLifetime } from './accountInbound';
import type { Bytes } from './custodyCrypto';

export class HistoryInstallSizeError extends Error {
  constructor() {
    super('History installation exceeds supported size');
  }
}

export const HISTORY_INSTALL_TAG = 'done/history-install/v1';
export interface HistoryInstall {
  baseline: string;
  workspace: string;
  lineage: string;
  epoch: number;
  head: string;
  reader: string;
  checkpoint: HistoryCheckpoint;
  admission: HistoryCheckpointAdmission;
}
export interface InstalledHistory {
  sequence: number;
  hash: string;
}
export function encodeHistoryInstall(e: HistoryInstall): Bytes {
  const bytes = new TextEncoder().encode(
    JSON.stringify([
      HISTORY_INSTALL_TAG,
      1,
      inboundHex(e.baseline, 32),
      inboundHex(e.workspace, 16),
      inboundHex(e.lineage, 32),
      // Position 5 is the installation authority used by the membership witness boundary verifier.
      inboundInteger(e.epoch, 1),
      inboundHex(e.head, 32),
      inboundHex(e.reader, 16),
      parseHistoryCheckpoint(e.checkpoint),
      parseHistoryCheckpointAdmission(e.admission),
    ]),
  );
  if (bytes.length > MAX_BATCH_BYTES) throw new HistoryInstallSizeError();
  return bytes;
}
export function decodeHistoryInstall(bytes: Bytes): HistoryInstall {
  const v = parseInboundArray(bytes, MAX_BATCH_BYTES);
  if (v.length !== 10 || v[0] !== HISTORY_INSTALL_TAG || v[1] !== 1)
    throw Error('Invalid history installation');
  return {
    baseline: inboundHex(v[2], 32),
    workspace: inboundHex(v[3], 16),
    lineage: inboundHex(v[4], 32),
    epoch: inboundInteger(v[5], 1),
    head: inboundHex(v[6], 32),
    reader: inboundHex(v[7], 16),
    checkpoint: parseHistoryCheckpoint(v[8]),
    admission: parseHistoryCheckpointAdmission(v[9]),
  };
}
export function checkpointAuthority(base: InboundContext, epoch = base.authority.tip) {
  const authority = base.history ? historyMembershipAt(base.history, epoch) : base.checkpointAnchor;
  if (!authority || membershipState(authority).epoch !== epoch)
    throw Error('Unknown history installation authority');
  return authority;
}
/** Authenticate historical eligibility and actual decrypted coverage on every cold replay. */
export async function verifyHistoryInstall(
  base: InboundContext,
  input: Bytes,
  previous: InstalledHistory | undefined,
  lifetime: InboundLifetime,
) {
  previous = previous ? { ...previous } : undefined;
  const event = decodeHistoryInstall(input),
    installed = membershipState(checkpointAuthority(base, event.epoch)),
    cp = event.checkpoint,
    authority = checkpointAuthority(base, cp.manifest.epoch);
  lifetime.assertCurrent();
  if (
    event.baseline !== base.baseline.id ||
    event.workspace !== base.authority.workspace ||
    event.lineage !== base.authority.lineage ||
    event.reader !== base.reader.id ||
    event.head !== installed.head ||
    event.epoch > base.authority.tip ||
    cp.manifest.epoch > event.epoch ||
    !installed.certificate.members.some(
      (m) => m.id === event.reader && m.sPub === base.reader.publicKey,
    )
  )
    throw Error('History installation scope changed');
  const key = generationKey(
    new Map([...(base.retainedGenerationKeys ?? []), [base.generation, base.generationKey]]),
    cp.manifest.generation,
  ).slice();
  let doc: Awaited<ReturnType<typeof openHistoryCheckpoint>> | undefined;
  let update: Bytes | undefined;
  try {
    await verifyHistoryCheckpointAdmission(event.admission, cp, authority);
    const hash = await historyCheckpointHash(cp),
      sequence = cp.manifest.sequence;
    if (
      previous &&
      (sequence <= previous.sequence ||
        (sequence === previous.sequence + 1 && cp.manifest.parent !== previous.hash))
    )
      throw Error('History installation regressed or forked');
    doc = await openHistoryCheckpoint(cp, key, authority);
    update = new Uint8Array(Y.encodeStateAsUpdate(doc));
    // Keep the existing native admission bound. A larger snapshot is refused before any write.
    if (update.length + input.length > MAX_BATCH_BYTES) throw new HistoryInstallSizeError();
    lifetime.assertCurrent();
    return { update, installed: { hash, sequence } };
  } catch (cause) {
    update?.fill(0);
    throw cause;
  } finally {
    doc?.destroy();
    key.fill(0);
  }
}
