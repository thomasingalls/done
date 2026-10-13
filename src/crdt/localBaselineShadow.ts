/** Private baseline verification: full-history comparison or explicitly opted-in reduced replay. */
import {
  LocalBaselineError,
  prepareLocalBaseline,
  replayFullLocalHistory,
  replayLocalBaseline,
  type LocalBaselineContext,
  type LocalReplayInput,
  type BaselineAuthentication,
  type AuthenticatedLocalBaseline,
} from './localBaselineReplay';
import { decodeLocalBaseline, type BaselineAnchor } from './localBaselineRecord';
import { selectEnvelopeSources } from './accountEnvelopePreparation';
import { nextSpoolPosition, positionSources, type SpoolState } from './spoolRecord';
import { decodeSourceCapsule, eraseCapsule, type CaptureRoute } from './sourceCapture';
import { copyRecords, eraseVerified, sameBytes } from './verifiedRecords';
import { MaintenanceInterrupted } from './contentMaintenance';
import { createCpuBudget, type CpuCheckpoint } from './cpuBudget';

export type BaselineShadowResult =
  | {
      kind: 'matched';
      mode: 'created' | 'continued';
      baselineBytes: number;
      suffixRows: number;
      authorityEpoch: number;
      historySequence: number;
    }
  | { kind: 'skipped'; reason: 'activity-or-journal' | 'ineligible' | 'history-required' | 'scope' }
  | { kind: 'refused'; reason: 'draft-replay' | 'comparison-mismatch' };
type Replay = Awaited<ReturnType<typeof replayFullLocalHistory>>;
/** Detached logical data returned only after the carrier authenticates replay (and compares full history when retained).
 * No physical placement/allocation or write authority; never pass records to a storage mutation. */
export interface AccountBaselineRead {
  kind: 'baseline-plus-suffix';
  anchor: BaselineAnchor;
  firstSuffix: number;
  /** Epoch through which the authenticated origin checked authority boundaries. */
  authorityEpoch: number;
  records: import('./contentRecord').OpenedRecord[];
  ledger: Pick<Replay, 'census' | 'delivery' | 'inbound'>;
}
const ordered = (v: unknown): unknown => {
  if (v instanceof Uint8Array) return [...v];
  if (v instanceof Map)
    return [...v].sort(([a], [b]) => String(a).localeCompare(String(b))).map(ordered);
  if (Array.isArray(v)) return v.map(ordered);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, value]) => [k, ordered(value)]),
    );
  return v;
};
const stream = (s: Replay['inbound']) => [s.prefix, s.startingPoint ?? null, s.conflict];
// Compare the entire remaining catalogue, not only the next bounded publication batch.
const outstanding = async (spool: SpoolState, route: CaptureRoute, checkpoint: CpuCheckpoint) => {
  const consumed = new Map<string, Set<number>>();
  for (const ref of [
    ...(spool.origin?.consumed ?? []),
    ...spool.positions.flatMap(positionSources),
  ]) {
    const pause = checkpoint();
    if (pause) await pause;
    const indexes = consumed.get(ref.id) ?? new Set<number>();
    indexes.add(ref.index);
    consumed.set(ref.id, indexes);
  }
  const result = new Map<string, { bytes: Uint8Array; consumed: number[] }>();
  for (const [id, bytes] of spool.sources) {
    const pause = checkpoint();
    if (pause) await pause;
    const capsule = decodeSourceCapsule(bytes, route);
    try {
      const indexes = [...(consumed.get(id) ?? [])].sort((a, b) => a - b);
      if (indexes.length < capsule.sources.length) result.set(id, { bytes, consumed: indexes });
    } finally {
      eraseCapsule(capsule);
    }
  }
  return result;
};
const projection = async (
  r: Replay,
  after: number,
  route: CaptureRoute,
  checkpoint: CpuCheckpoint,
) => ({
  outstanding: await outstanding(r.census.delivery.spool, route, checkpoint),
  delivery: [
    r.delivery.acceptedThrough,
    r.delivery.finalThrough,
    r.delivery.conflict,
    r.delivery.refusals,
  ],
  submissions: new Map([...r.delivery.submissions].filter(([n]) => n > after)),
  responses: new Map([...r.delivery.responses].filter(([n]) => n > after)),
  attempts: r.census.delivery.spool.attempts,
  next: nextSpoolPosition(r.census.delivery.spool),
  positions: r.census.delivery.spool.positions.filter((p) => p.position > after),
  own: stream(r.inbound),
  peers: new Map([...(r.inbound.peers ?? [])].map(([id, s]) => [id, stream(s)])),
  history: r.inbound.installedHistory ?? null,
});

/** Compare all retained obligations and next selection, not just visible text or one send batch. */
async function matchesBaselineReplay(
  reference: Replay,
  replayed: Replay,
  after: number,
  route: CaptureRoute,
  assertCurrent: () => void,
) {
  const checkpoint = createCpuBudget(assertCurrent);
  const a = await selectEnvelopeSources(
      reference.census.delivery.spool,
      route,
      true,
      crypto.subtle,
      checkpoint,
    ),
    b = await selectEnvelopeSources(
      replayed.census.delivery.spool,
      route,
      true,
      crypto.subtle,
      checkpoint,
    );
  const first = await projection(reference, after, route, checkpoint);
  const second = await projection(replayed, after, route, checkpoint);
  assertCurrent();
  return (
    sameBytes(reference.snapshot, replayed.snapshot) &&
    JSON.stringify(ordered([first, a])) === JSON.stringify(ordered([second, b]))
  );
}

export async function compareBaselineReplay(
  reference: Replay,
  replayed: Replay,
  after: number,
  route: CaptureRoute,
  assertCurrent: () => void = () => {},
) {
  if (!(await matchesBaselineReplay(reference, replayed, after, route, assertCurrent)))
    throw new LocalBaselineError('integrity');
}

/** Persisted anchors are authoritative: any failed replay/comparison refuses this owner. */
export async function verifyCompleteLocalBaseline(
  input: LocalReplayInput,
  context: LocalBaselineContext,
  auth: BaselineAuthentication,
  stored: { baseline: AuthenticatedLocalBaseline; anchor: BaselineAnchor },
  read = false,
  reduced = false,
): Promise<AccountBaselineRead | undefined> {
  let reference: Replay | undefined, replayed: Replay | undefined;
  const baseline = decodeLocalBaseline(stored.baseline.payload);
  try {
    if (
      reduced &&
      (!read ||
        !baseline.journalEra ||
        input.records.some((r) => r.seq < baseline.cut.nextSequence))
    )
      throw new LocalBaselineError('integrity');
    if (!reduced) reference = await replayFullLocalHistory(input, context);
    replayed = await replayLocalBaseline(
      stored.baseline,
      stored.anchor,
      {
        records: input.records.filter((r) => r.seq >= baseline.cut.nextSequence),
        counter: input.counter,
      },
      context,
      auth,
    );
    if (reference)
      await compareBaselineReplay(
        reference,
        replayed,
        baseline.own.position,
        context.route,
        context.assertCurrent,
      );
    context.assertCurrent();
    if (read && baseline.journalEra)
      return {
        kind: 'baseline-plus-suffix',
        anchor: { ...stored.anchor },
        firstSuffix: baseline.cut.nextSequence,
        authorityEpoch: baseline.authorityState.epoch,
        records: copyRecords([
          { kind: 'state', seq: 0, gen: baseline.generation, bytes: baseline.snapshot },
          ...baseline.sources.map((s) => s.record),
          ...input.records.filter((r) => r.seq >= baseline.cut.nextSequence),
        ]),
        ledger: structuredClone({
          census: replayed.census,
          delivery: replayed.delivery,
          inbound: replayed.inbound,
        }),
      };
    return undefined;
  } finally {
    eraseVerified(reference);
    eraseVerified(replayed);
    eraseVerified(baseline);
  }
}

export function createLocalBaselineShadow() {
  let retained: Awaited<ReturnType<typeof prepareLocalBaseline>> | undefined;
  let revision = {};
  const invalidate = () => {
    revision = {};
    retained?.baseline.payload.fill(0);
    retained?.baseline.mac.fill(0);
    retained = undefined;
  };
  return {
    invalidate,
    // A completed candidate remains independently authenticated. A new current context must
    // prove ancestry/cuts before it can continue it. Never let an in-flight old check publish.
    authorityChanged() {
      revision = {};
    },
    async run(
      input: LocalReplayInput,
      context: LocalBaselineContext,
      auth: BaselineAuthentication,
      confirm: () => Promise<void>,
    ): Promise<BaselineShadowResult> {
      const began = revision;
      const current = () => {
        context.assertCurrent();
        if (began !== revision) throw new MaintenanceInterrupted();
      };
      const held = { ...context, assertCurrent: current };
      let reference: Replay | undefined, replayed: Replay | undefined;
      let candidate: Awaited<ReturnType<typeof prepareLocalBaseline>> | undefined;
      let report: BaselineShadowResult;
      try {
        try {
          reference = await replayFullLocalHistory(input, held);
          if (!retained) candidate = await prepareLocalBaseline(input, held, auth);
          const using = retained ?? candidate!;
          const baseline = decodeLocalBaseline(using.baseline.payload);
          try {
            const suffix = input.records.filter((r) => r.seq >= baseline.cut.nextSequence);
            replayed = await replayLocalBaseline(
              using.baseline,
              using.anchor,
              { records: suffix, counter: input.counter },
              held,
              auth,
            );
            const matches = await matchesBaselineReplay(
              reference,
              replayed,
              baseline.own.position,
              held.route,
              current,
            );
            current();
            report = matches
              ? {
                  kind: 'matched',
                  mode: retained ? 'continued' : 'created',
                  baselineBytes: using.baseline.payload.length,
                  suffixRows: suffix.length,
                  authorityEpoch: context.route.epoch,
                  historySequence: replayed.inbound.installedHistory?.sequence ?? 0,
                }
              : { kind: 'refused', reason: 'comparison-mismatch' };
          } finally {
            eraseVerified(baseline);
          }
        } catch (e) {
          // The normal carrier verifier already succeeded. Draft failures are diagnostic only;
          // they never install a result, conceal a carrier failure or close a healthy owner.
          current();
          if (e instanceof MaintenanceInterrupted) throw e;
          report =
            e instanceof LocalBaselineError && e.reason !== 'integrity'
              ? { kind: 'skipped', reason: e.reason }
              : { kind: 'refused', reason: 'draft-replay' };
        }
        // This is outside the draft-error handler: actual fresh custody failures still propagate.
        await confirm();
        current();
        if (report.kind === 'matched' && candidate) {
          retained = candidate;
          candidate = undefined;
        } else if (report.kind !== 'matched') invalidate();
        return Object.freeze(report);
      } catch (e) {
        invalidate();
        throw e;
      } finally {
        eraseVerified(reference);
        eraseVerified(replayed);
        candidate?.baseline.payload.fill(0);
        candidate?.baseline.mac.fill(0);
      }
    },
  };
}
