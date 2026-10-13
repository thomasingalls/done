/** Explicit development experiment. Results never replace the live reader or authorize deletion. */
import {
  LocalBaselineError,
  prepareLocalBaseline,
  replayFullLocalHistory,
  replayLocalBaseline,
  type LocalBaselineContext,
  type LocalReplayInput,
  type BaselineAuthentication,
} from './localBaselineReplay';
import { decodeLocalBaseline } from './localBaselineRecord';
import { selectEnvelopeSources } from './accountEnvelopePreparation';
import { nextSpoolPosition } from './spoolRecord';
import { eraseVerified, sameBytes } from './verifiedRecords';
import { MaintenanceInterrupted } from './contentMaintenance';

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
const projection = (r: Replay, after: number) => ({
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
            const select = (r: Replay) =>
              selectEnvelopeSources(r.census.delivery.spool, held.route, true, crypto.subtle);
            const a = await select(reference),
              b = await select(replayed);
            current();
            const matches =
              sameBytes(reference.snapshot, replayed.snapshot) &&
              JSON.stringify(ordered([projection(reference, baseline.own.position), a])) ===
                JSON.stringify(ordered([projection(replayed, baseline.own.position), b]));
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
