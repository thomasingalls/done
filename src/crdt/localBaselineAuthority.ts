/** Experimental continuation of authenticated local cuts. No install or deletion authority. */
import {
  historyAuthority,
  historyGeneration,
  createAdmissionPrefixVerifier,
} from '../../account-protocol/admissionHistory';
import { originalMembershipBoundaries } from './accountSuccessor';
import { membershipEventEpoch, type InstalledMembership } from './accountMembership';
import { sameSpoolWitness } from './contentRecord';
import { extendSpoolWitness, type SpoolState } from './spoolRecord';
import { guardedSubtle, hex, utf8 } from './custodyCrypto';
import type { LocalBaselineContext } from './localBaselineReplay';
import type { LocalBaseline } from './localBaselineRecord';

const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, value]) => [k, canonical(value)]),
        )
      : v;
const digest = async (v: unknown) =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(JSON.stringify(canonical(v))))));
const fail = (): never => {
  throw Error('Retained authority boundary changed');
};

function installation(c: LocalBaselineContext) {
  const i = c.installation;
  const epoch = i.kind === 'joined' ? i.initialEpoch : 1;
  let cuts: InstalledMembership['cuts'] = [];
  if (i.kind === 'original' && i.successor) {
    const s = i.successor;
    cuts = s.certification
      ? originalMembershipBoundaries(s).cuts
      : [{ epoch: 2, head: s.artifact.head, before: s.before }];
  }
  cuts = [...cuts, ...(i.membership?.cuts ?? [])];
  if (
    cuts.some(
      (x, n) =>
        x.epoch <= (cuts[n - 1]?.epoch ?? epoch) ||
        x.before.events < (cuts[n - 1]?.before.events ?? 0),
    )
  )
    fail();
  if (
    (cuts.at(-1)?.epoch ?? epoch) !== c.route.epoch ||
    (cuts.length && cuts.at(-1)!.head !== c.inbound.authority.head)
  )
    fail();
  for (const cut of cuts) {
    if (!c.route.history) fail();
    historyAuthority(c.route.history!, { ...c.inbound.authority, tip: cut.epoch, head: cut.head });
  }
  return { epoch, cuts };
}
/** Immutable owner scope; evolving authority is checked separately against verified ancestry. */
export function baselineScope(c: LocalBaselineContext) {
  const b = c.inbound;
  return digest([
    'done/local-baseline-scope/draft-2',
    c.identity,
    b.baseline,
    b.baselineHeads ?? [],
    b.service,
    b.authority.workspace,
    b.authority.lineage,
    b.authority.acceptanceKey,
    b.creatingCredential,
    b.reader,
    b.publisher,
    c.installation.kind,
    c.installation.kind === 'joined' ? c.installation.initialEpoch : 1,
  ]);
}
export async function baselineAuthorityState(
  c: LocalBaselineContext,
): Promise<LocalBaseline['authorityState']> {
  return {
    epoch: c.route.epoch,
    head: c.inbound.authority.head,
    generation: c.route.generation,
    cutsHash: await digest(installation(c)),
  };
}
/** All old local cuts must be unchanged. New cuts are checked at their exact event offsets. */
export async function verifyBaselineAuthority(
  b: LocalBaseline,
  spool: SpoolState,
  c: LocalBaselineContext,
) {
  const origin = b.authorityState,
    all = installation(c),
    history = c.route.history;
  if (origin.epoch > c.route.epoch) fail();
  if (history) {
    historyAuthority(history!, { ...c.inbound.authority, tip: origin.epoch, head: origin.head });
    if (historyGeneration(history!, origin.epoch) !== origin.generation) fail();
  } else if (
    origin.epoch !== c.route.epoch ||
    origin.head !== c.inbound.authority.head ||
    origin.generation !== c.route.generation
  )
    fail();
  const previous = all.cuts.filter((x) => x.epoch <= origin.epoch);
  if ((await digest({ epoch: all.epoch, cuts: previous })) !== origin.cutsHash) fail();
  const later = all.cuts.filter((x) => x.epoch > origin.epoch);
  if (
    later.some(
      (x) =>
        x.before.events < b.cut.witness.events ||
        x.before.events > b.cut.witness.events + spool.events.length,
    )
  )
    fail();
  let witness = { ...b.cut.witness },
    epoch = origin.epoch,
    cut = 0;
  const subtle = guardedSubtle(c.assertCurrent);
  for (let n = 0; n <= spool.events.length; n++) {
    while (later[cut]?.before.events === witness.events) {
      const next = later[cut++]!;
      if (!sameSpoolWitness(witness, next.before)) fail();
      epoch = next.epoch;
    }
    if (n === spool.events.length) break;
    const bytes = spool.events[n]!;
    if (membershipEventEpoch(bytes) !== epoch) fail();
    witness = await extendSpoolWitness(witness, bytes, subtle);
  }
  if (cut !== later.length || epoch !== c.route.epoch) fail();
  if (history && origin.epoch < history.current.tip) {
    // A newly installed service boundary cannot retreat behind this already accepted prefix.
    const next = history.boundaries.filter(
      (_, n) => history.authorities[n + 1]!.tip > origin.epoch,
    );
    if (next.some((x) => x.position < b.own.position)) fail();
    if (next.length) {
      const prefix = createAdmissionPrefixVerifier(history, subtle, {
        position: b.own.position,
        link: b.own.link,
        verifiedThroughEpoch: origin.epoch,
      });
      for (const p of spool.positions) {
        if (p.position > history.boundary.position) break;
        if (!p.wire) fail();
        await prefix.append(p.wire!);
      }
      prefix.finish();
    }
  }
  c.assertCurrent();
  return witness;
}
