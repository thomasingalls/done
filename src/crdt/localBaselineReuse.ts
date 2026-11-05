/** Private reduced-owner continuation. Only a full authenticated replay may seed this cache. */
import type { LocalBaselineContext } from './localBaselineReplay';
import type { AccountBaselineRead } from './localBaselineShadow';
import { type ContentCounter, type OpenedRecord, corrupt, sameSpoolWitness } from './contentRecord';
import {
  appendedRecords,
  extendAccountLedger,
  indexVerifiedLedger,
  sameAccountLedger,
  type AccountLedgerView,
} from './incrementalAccountLedger';
import { copyRecords, createVerifiedRecords, eraseVerified } from './verifiedRecords';
import { createInboundCoverage, verifyInboundLedger } from './inboundLedger';
import { advanceSelfReceive } from './accountSyncState';
import { decodeSourceCapsule, eraseCapsule } from './sourceCapture';
import { createVerificationMemo } from './verificationMemo';
import { guardedSubtle } from './custodyCrypto';
import { cpuCheckpoint } from './cpuBudget';
import { WARM_AUDIT_MS, WARM_AUDIT_ROWS } from './warmContent';
import { countLedgerWork } from './accountLedgerMetrics';
import type { SessionTask } from './writeSession';

// The owning extension replaces these immutable verifier-owned capabilities on adoption.
// Scalar scope is captured too; fresh authority authentication remains the caller's obligation.
function authority(c: LocalBaselineContext): unknown[] {
  const i = c.installation;
  return [
    c.inbound,
    c.inbound.generation,
    c.inbound.generationKey,
    c.inbound.retainedGenerationKeys,
    c.inbound.baselineHeads,
    c.inbound.checkpointAnchor,
    c.inbound.history,
    c.inbound.retained,
    c.signer,
    c.route.history,
    i.membership,
    i.kind === 'original' ? i.successor : i.initialEpoch,
    JSON.stringify([
      c.identity,
      c.route.workspace,
      c.route.principal,
      c.route.credential,
      c.route.epoch,
      c.route.generation,
      i.kind,
      c.inbound.authority,
      c.inbound.service,
      c.inbound.reader,
      c.inbound.publisher,
      c.inbound.baseline,
      c.inbound.prefix,
      c.inbound.creatingCredential,
    ]),
  ];
}
export function baselineAuthorityPin(context: LocalBaselineContext) {
  context.assertCurrent();
  const pin = authority(context);
  return (current: LocalBaselineContext) => {
    current.assertCurrent();
    return authority(current).every((v, n) => v === pin[n]);
  };
}
class FullReplayRequired extends Error {}

export async function createBaselineReuse(
  task: SessionTask,
  initial: AccountBaselineRead,
  context: LocalBaselineContext,
  counter: ContentCounter,
  identity: object,
) {
  const pinned = baselineAuthorityPin(context),
    verified = createVerifiedRecords<AccountLedgerView>({ ownResults: true }),
    coverage = createInboundCoverage({ incremental: true, direct: true }),
    memo = createVerificationMemo(),
    prefix = copyRecords(initial.records.filter((r) => r.seq < initial.firstSuffix)),
    header = {
      kind: initial.kind,
      anchor: { ...initial.anchor },
      firstSuffix: initial.firstSuffix,
      authorityEpoch: initial.authorityEpoch,
    };
  const verifiedAt = performance.now();
  let alive = true,
    added = 0,
    lastIdentity = identity;
  let lastCounter = structuredClone(counter);
  const clear = () => {
    alive = false;
    verified.clear();
    coverage.clear();
    memo.clear();
    eraseVerified(prefix);
  };
  const matches = (c: LocalBaselineContext) => {
    c.assertCurrent();
    return alive && pinned(c);
  };
  const current = () => {
    task.step(() => {});
    context.assertCurrent();
    if (!alive) throw Error('Baseline reuse closed');
  };
  try {
    await verified.verify(
      initial.records,
      identity,
      async (records) => {
        const ledger = structuredClone(initial.ledger);
        const indexes = await indexVerifiedLedger(
          ledger,
          records,
          context.route,
          counter,
          guardedSubtle(current),
        );
        return { ...ledger, ...(indexes ? { indexes } : {}) };
      },
      current,
      undefined,
      cpuCheckpoint(task),
    );
  } catch (e) {
    clear();
    throw e;
  }
  return {
    clear,
    matches,
    hasIdentity: (id: object) => alive && id === lastIdentity,
    pendingRows: () => added,
    due: () => added >= WARM_AUDIT_ROWS || performance.now() - verifiedAt >= WARM_AUDIT_MS,
    delay: () =>
      added >= WARM_AUDIT_ROWS ? 0 : Math.max(0, verifiedAt + WARM_AUDIT_MS - performance.now()),
    /** Full replay must agree with the last checked logical view before it replaces that view. */
    compare(full: AccountBaselineRead) {
      const prior = verified.read(full.records);
      try {
        if (!sameAccountLedger(prior, full.ledger))
          corrupt('Baseline incremental reference mismatch.');
      } finally {
        eraseVerified(prior);
      }
    },
    async advance(
      task: SessionTask,
      physical: readonly OpenedRecord[],
      c: LocalBaselineContext,
      allocation: ContentCounter,
      id: object,
    ): Promise<AccountBaselineRead | undefined> {
      if (!matches(c)) return;
      const check = () => {
        task.step(() => {});
        if (!matches(c)) throw Error('Baseline authority changed');
      };
      if (id === lastIdentity) {
        if (
          lastCounter.v !== 2 ||
          allocation.v !== 2 ||
          !sameSpoolWitness(lastCounter.spool, allocation.spool)
        )
          corrupt('Baseline witness changed without appended records.');
        countLedgerWork('baselineWarmReuses');
        return; // Caller retains its already detached unchanged logical projection.
      }
      if (physical.some((r) => r.seq < header.firstSuffix)) corrupt('Reduced prefix reappeared.');
      const records = [...prefix, ...physical];
      let appended = 0;
      try {
        await verified.verify(
          records,
          id,
          async () => {
            throw new FullReplayRequired();
          },
          check,
          async (previous, before, candidate) => {
            const suffix = appendedRecords(before, candidate);
            if (!suffix) return;
            const next = await extendAccountLedger(
              previous,
              before,
              candidate,
              c.route,
              allocation,
              c.inbound,
              c.signer,
              guardedSubtle(check),
              { memo, current: check },
            );
            if (!next) return;
            const checking = coverage.bind(candidate);
            // Unlike the ordinary census, baseline replay also proves every unallocated source.
            const sourceSequences = new Set([...next.indexes!.sources.values()].map((s) => s.seq));
            for (const row of suffix)
              if (row.kind === 'outbound') {
                // The reducer has classified these bytes; only newly indexed capsules need this proof.
                if (!sourceSequences.has(row.seq)) continue;
                const capsule = decodeSourceCapsule(row.bytes, c.route);
                try {
                  checking.check(
                    candidate,
                    capsule.sources.map((s) => s.bytes),
                  );
                } finally {
                  eraseCapsule(capsule);
                }
                const pause = cpuCheckpoint(task)?.();
                if (pause) await pause;
              }
            const inbound = await verifyInboundLedger(
              next.census,
              candidate,
              c.inbound,
              { ...c, assertCurrent: check },
              {
                memo,
                coverage: checking,
                checkpoint: async () => {
                  const pause = cpuCheckpoint(task)?.();
                  if (pause) await pause;
                },
              },
              { state: previous.inbound, after: before.at(-1)?.seq ?? 0 },
            );
            advanceSelfReceive(
              next.census.delivery,
              next.delivery,
              inbound,
              c.route,
              (updates) => checking.check(candidate, updates),
              previous.delivery.acceptedThrough,
            );
            appended = suffix.length;
            return { ...next, inbound };
          },
          cpuCheckpoint(task),
        );
        check();
        const ledger = verified.read(records, ({ census, delivery, inbound }) => ({
          census,
          delivery,
          inbound,
        }));
        added += appended;
        lastIdentity = id;
        lastCounter = structuredClone(allocation);
        // Crypto memo inputs are operation-local; retained semantic indexes are separately bounded.
        memo.clear();
        countLedgerWork('baselineIncrementalReuses');
        return { ...header, anchor: { ...header.anchor }, records: copyRecords(records), ledger };
      } catch (e) {
        clear();
        if (e instanceof FullReplayRequired) return;
        throw e;
      }
    },
  };
}
