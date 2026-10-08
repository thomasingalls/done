import {
  parseCertificationSuccessor,
  type CertificationSuccessor,
} from '../../account-protocol/contentDelivery';
/** Private v9 installed authority. Genesis/slot custody remains bound to the original receipt. */
import { parseSuccessor, type AdmissionSuccessor } from '../../account-protocol/successor';
import {
  verifyAdmissionHistory,
  historyGeneration,
  verifyCertificationHistory,
  createAdmissionPrefixVerifier,
} from '../../account-protocol/admissionHistory';
import { closed } from '../../account-protocol/preparation';
import { unhex } from '../../account-protocol/recovery';
import { decodeInboundRequest } from '../../account-protocol/inboundTransport';
import type { PromotionRecord } from './promotionRecord';
import { captureRoute, captureError, type CaptureRoute } from './sourceCapture';
import { emptySpoolWitness, sameSpoolWitness, type SpoolWitness } from './contentRecord';
import { extendSpoolWitness, type SpoolState } from './spoolRecord';
import { decodeInboundRecord } from './inboundRecord';
import type { VerificationMemo } from './verificationMemo';
import {
  installedMembershipHistory,
  verifyInstalledMembership,
  type InstalledMembership,
} from './accountMembership';

export interface InstalledSuccessor {
  artifact: AdmissionSuccessor;
  before: SpoolWitness;
  certification?: CertificationSuccessor;
}
export function parseInstalledSuccessor(input: unknown): InstalledSuccessor {
  const r = closed(input, [
      'artifact',
      'before',
      ...(Object.hasOwn(input as object, 'certification') ? ['certification'] : []),
    ]),
    w = closed(r['before'], ['events', 'hash']);
  if (!Number.isSafeInteger(w['events']) || (w['events'] as number) < 0)
    throw Error('Invalid successor ledger boundary');
  unhex(w['hash'], 32);
  const before = { events: w['events'] as number, hash: w['hash'] as string };
  if (!before.events && !sameSpoolWitness(before, emptySpoolWitness()))
    throw Error('Invalid empty successor ledger boundary');
  const certification = Object.hasOwn(r, 'certification')
    ? parseCertificationSuccessor(r['certification'])
    : undefined;
  if (
    certification &&
    (before.events !== 0 || certification.epoch.heads.some((h) => h.position !== 0))
  )
    throw Error('Initial certification installation requires an empty ledger');
  return {
    artifact: parseSuccessor(r['artifact']),
    before,
    ...(certification ? { certification } : {}),
  };
}
export async function heldCaptureRoute(
  marker: PromotionRecord,
  activeGeneration = 1,
): Promise<CaptureRoute> {
  const route = captureRoute(marker);
  if (marker.membership && (marker.v !== 9 || !marker.successor?.certification))
    throw Error('Membership adoption requires certified receiving custody');
  if (!marker.successor) return route;
  if (marker.successor.certification) {
    let history = await verifyCertificationHistory(
      marker.successor.certification,
      marker.successor.artifact,
      { pin: marker.pin, request: marker.admission!.request, receipt: marker.admission!.receipt! },
      { epoch: 3, head: marker.successor.certification.head },
    );
    if (marker.membership)
      history = await installedMembershipHistory(
        marker.membership,
        {
          pin: marker.pin,
          request: marker.admission!.request,
          receipt: marker.admission!.receipt!,
        },
        history,
        activeGeneration,
      );
    return {
      ...route,
      epoch: history.current.tip,
      generation: historyGeneration(history),
      history,
    };
  }
  const history = await verifyAdmissionHistory(
    marker.successor.artifact,
    {
      pin: marker.pin,
      request: marker.admission!.request,
      receipt: marker.admission!.receipt!,
    },
    { epoch: 2, head: marker.successor.artifact.head },
  );
  return { ...route, epoch: 2, history };
}
/** Rechecked against actual retained ciphertext, not an install-time boolean or vector-only claim. */
export async function verifyInstalledSuccessor(
  spool: SpoolState,
  route: CaptureRoute,
  installed: InstalledSuccessor | undefined,
  subtle: SubtleCrypto,
  reuse?: { memo: VerificationMemo; current(): void },
  membership?: InstalledMembership,
): Promise<void> {
  if (membership) {
    if (!installed?.certification || !route.history)
      throw Error('Membership adoption requires original certification');
    await verifyInstalledMembership(spool, route.history, membership, 3, subtle, reuse);
    return;
  }
  if (!installed) {
    if (route.history) captureError('Successor evidence missing');
    return;
  }
  const history = route.history;
  if (
    !history ||
    history.current.head !== (installed.certification?.head ?? installed.artifact.head) ||
    route.epoch !== (installed.certification ? 3 : 2)
  )
    captureError('Installed authority differs from retained history');
  const cut = installed.before;
  if (cut.events > spool.events.length) captureError('Pre-adoption ledger is incomplete');
  let witness = emptySpoolWitness();
  for (const [index, bytes] of spool.events.entries()) {
    const v = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const epoch =
      v[0] === 'done/account-inbound/v1'
        ? decodeInboundRequest(decodeInboundRecord(bytes).request).epoch
        : v[5];
    if (epoch !== (index < cut.events ? 1 : installed.certification ? 3 : 2))
      captureError('Ledger crosses installed authority boundary');
    if (index >= cut.events) continue;
    const before = witness,
      check = () => extendSpoolWitness(before, bytes, subtle);
    witness = reuse
      ? await reuse.memo.check(
          'witness:' + index,
          JSON.stringify(before),
          [bytes],
          check,
          reuse.current,
        )
      : await check();
  }
  if (!sameSpoolWitness(witness, cut)) captureError('Pre-adoption ledger commitment changed');
  const wires = spool.positions.slice(0, history!.boundary.position).map((p) => {
    if (!p.wire) return captureError('Admission prefix requires retained envelopes');
    return p.wire;
  });
  const check = async () => {
    const prefix = createAdmissionPrefixVerifier(history!, subtle);
    for (const wire of wires) await prefix.append(wire);
    prefix.finish();
  };
  if (reuse)
    await reuse.memo.check('admission-prefix', history!.current.head, wires, check, reuse.current);
  else await check();
}
