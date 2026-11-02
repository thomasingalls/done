import { requireFullSpool } from './retainedHistory';
/** Current membership is separate from the immutable installation/key/checkpoint binding. */
import { closed } from '../../account-protocol/preparation';
import { unhex } from '../../account-protocol/recovery';
import {
  parseMembershipChain,
  verifyMembershipChain,
} from '../../account-protocol/membershipLocator';
import {
  historyAuthority,
  historyGeneration,
  historyPublisher,
  createAdmissionPrefixVerifier,
  type AdmissionHistory,
} from '../../account-protocol/admissionHistory';
import type { SuccessorBase } from '../../account-protocol/successor';
import { decodeInboundRequest } from '../../account-protocol/inboundTransport';
import { emptySpoolWitness, sameSpoolWitness, type SpoolWitness } from './contentRecord';
import { extendSpoolWitness, type SpoolState } from './spoolRecord';
import { decodeInboundRecord, isInboundRecordTag } from './inboundRecord';
import type { VerificationMemo } from './verificationMemo';
import type { Bytes } from './custodyCrypto';

export interface InstalledMembership {
  v: 1;
  proofs: ReturnType<typeof parseMembershipChain>;
  cuts: { epoch: number; head: string; before: SpoolWitness }[];
}
export function parseInstalledMembership(input: unknown): InstalledMembership {
  const r = closed(input, ['v', 'proofs', 'cuts']),
    proofs = parseMembershipChain(r['proofs']);
  if (r['v'] !== 1 || !Array.isArray(r['cuts']) || !r['cuts'].length || r['cuts'].length > 128)
    throw Error('Invalid installed membership cuts');
  let epoch = 2,
    events = 0;
  const cuts = r['cuts'].map((input: unknown) => {
    const c = closed(input, ['epoch', 'head', 'before']),
      b = closed(c['before'], ['events', 'hash']);
    if (
      !Number.isSafeInteger(c['epoch']) ||
      (c['epoch'] as number) <= epoch ||
      !Number.isSafeInteger(b['events']) ||
      (b['events'] as number) < events
    )
      throw Error('Membership adoption regressed');
    unhex(c['head'], 32);
    unhex(b['hash'], 32);
    const before = { events: b['events'] as number, hash: b['hash'] as string };
    if (!before.events && !sameSpoolWitness(before, emptySpoolWitness()))
      throw Error('Invalid empty membership boundary');
    epoch = c['epoch'] as number;
    events = before.events;
    return { epoch, head: c['head'] as string, before };
  });
  const last = proofs.continuations.at(-1);
  if (!last || last.head !== cuts.at(-1)!.head || last.epoch.epoch !== epoch)
    throw Error('Membership adoption tip changed');
  return { v: 1, proofs, cuts };
}
export async function installedMembershipHistory(
  input: InstalledMembership,
  base: SuccessorBase,
  initial: AdmissionHistory,
  activeGeneration = 1,
): Promise<AdmissionHistory> {
  const installed = parseInstalledMembership(input),
    verified = await verifyMembershipChain(installed.proofs, base),
    history = historyPublisher(verified.history, initial.credential);
  if (historyGeneration(history) !== activeGeneration)
    throw Error('Rotation requires generation activation');
  historyAuthority(history, initial.current);
  if (installed.cuts[0]!.epoch <= initial.current.tip)
    throw Error('Membership adoption precedes installation');
  for (const cut of installed.cuts)
    historyAuthority(history, { ...history.current, tip: cut.epoch, head: cut.head });
  return history;
}
export const membershipEventEpoch = (bytes: Bytes): number => {
  const v = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  return isInboundRecordTag(v[0])
    ? decodeInboundRequest(decodeInboundRecord(bytes).request).epoch
    : v[5];
};
/** Prove local issuance boundaries and every service-accepted prefix from retained ciphertext. */
export async function verifyInstalledMembership(
  spool: SpoolState,
  history: AdmissionHistory,
  installed: InstalledMembership,
  initialEpoch: number | { epoch: number; cuts: InstalledMembership['cuts'] },
  subtle: SubtleCrypto,
  reuse?: { memo: VerificationMemo; current(): void },
) {
  requireFullSpool(spool);
  const cuts = [...(typeof initialEpoch === 'number' ? [] : initialEpoch.cuts), ...installed.cuts];
  if (
    cuts.some(
      (c, i) =>
        i > 0 && (c.epoch <= cuts[i - 1]!.epoch || c.before.events < cuts[i - 1]!.before.events),
    )
  )
    throw Error('Membership adoption boundaries regressed');
  if (
    cuts.at(-1)!.head !== history.current.head ||
    cuts.at(-1)!.epoch !== history.current.tip ||
    cuts.at(-1)!.before.events > spool.events.length
  )
    throw Error('Membership ledger is incomplete');
  let witness = emptySpoolWitness(),
    cutIndex = 0,
    epoch = typeof initialEpoch === 'number' ? initialEpoch : initialEpoch.epoch;
  for (let i = 0; i <= spool.events.length; i++) {
    while (cuts[cutIndex]?.before.events === i) {
      const cut = cuts[cutIndex++]!;
      if (!sameSpoolWitness(witness, cut.before))
        throw Error('Membership ledger commitment changed');
      epoch = cut.epoch;
    }
    if (i === spool.events.length) break;
    const bytes = spool.events[i]!;
    if (membershipEventEpoch(bytes) !== epoch) throw Error('Ledger crosses membership adoption');
    if (i >= cuts.at(-1)!.before.events) continue;
    const before = witness,
      check = () => extendSpoolWitness(before, bytes, subtle);
    witness = reuse
      ? await reuse.memo.check(
          'witness:' + i,
          JSON.stringify(before),
          [bytes],
          check,
          reuse.current,
        )
      : await check();
  }
  const wires = spool.positions.slice(0, history.boundary.position).map((p) => {
    if (!p.wire) throw Error('Membership prefix requires retained envelopes');
    return p.wire;
  });
  const check = async () => {
    const prefix = createAdmissionPrefixVerifier(history, subtle);
    for (const wire of wires) await prefix.append(wire);
    prefix.finish();
  };
  if (reuse)
    await reuse.memo.check('admission-prefix', history.current.head, wires, check, reuse.current);
  else await check();
}
