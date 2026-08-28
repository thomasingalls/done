/**
 * The hosted-retention machine, as an executable model (TRD §14.7, §15 rows 15
 * and 16).
 *
 * **The finding this exists for is a false closure, not a broken construction.**
 * Rows 15 and 16 were jointly credited with covering a deliberate lapse. Row
 * 15's grammar has three kinds and none of them says *payment lapse*,
 * *synchronization stop* or *retention deadline*; row 16 selected a clock that
 * starts "when hosted synchronization stops" and no selected object recorded
 * that it had. `f-4259822-lapse-transition-kind-missing`. `P-4` decided the
 * carrier is a service-signed machine outside the authorization lineage, and
 * `S0-7` built it.
 *
 * **Why this is a test and not a vector.** Nothing here is a property of bytes.
 * The `EntitlementEvent` wire is deliberately unspecified — `P-4` gated it on
 * `D-31`, the pricing question the project defers on purpose — and everything
 * that does not depend on who initiates is a property of an *ordering*: one
 * clock under concurrency, a race decided the same way in both directions, a
 * partial deletion that resumes. There is nothing to publish as a value.
 *
 * **Time is abstract here, deliberately.** `RETENTION` is an opaque positive
 * offset. What this file claims is that the deadline is computed once from
 * `stopped_at` and never recomputed; that it is twelve months, and that every
 * document says twelve, is `scripts/check-retention.mjs`'s job and not this
 * one's. Two checks, two subjects.
 *
 * **What this does not test.** Whether a real store, biller or deletion worker
 * behaves as modelled — that is `L-3`. It models the decisions they make.
 *
 * **Amended 2026-08-29 at the `S0-7` return (`FU-04`/`ST-02`/`A-06`/`E1`, and
 * round 1's `C-7`; `FU-12`/`ST-07`).** The pre-return machine let a retirement
 * inherit a lapse's elapsed clock, so it could be born with its ceiling already
 * past — the `no-handoff` refusal unreachable, all six classes deleted at the
 * click instant with `handoffs.size === 0`, and the suite asserting that as a
 * positive. `P-4`'s ratified rule (option B, intrinsic acceptance) now holds:
 * the destructive boundary is `retired_at + RETENTION`, written exactly once at
 * the `cause` overwrite and never earlier than an inherited deadline; every
 * `retire` intent carries the erasure acceptance in its signed payload or is
 * malformed; and a ceiling erasure terminates in `deleted-without-receipt`,
 * a terminal state no reader can take for a receipt. **Elapsed time is never an
 * authority — the clock executes the owner's signed instruction.** The reseed
 * machine gained its durable branch set the same day: a second divergent
 * survivor is refused as stale with its session held, rebuilds against the
 * advanced revision, and joins the world the first one left.
 */

import { describe, expect, it } from 'vitest';

/**
 * §14.7's states. **None of them is spelled with a lineage word**, and that is
 * a design constraint rather than a naming preference: §13.5's lineage is
 * *never established*, *live* or *retired*, a lapsed workspace is `live` on that
 * axis, and reading the two as one axis is the entire finding.
 */
type Retention =
  | 'hosted'
  | 'grace'
  | 'stopped'
  | 'clearing'
  | 'cleared'
  | 'deleted-without-receipt';
type Cause = 'none' | 'entitlement' | 'retirement';
type Lineage = 'live' | 'retired';

const CLASSES = [
  'primary',
  'replicas',
  'checkpoints',
  'wraps',
  'backups',
  'recovery-anchor',
] as const;
type Class = (typeof CLASSES)[number];

/** Expiry keeps class 6; retirement does not. The cause selects the set. */
const classSet = (cause: Cause): readonly Class[] =>
  cause === 'retirement' ? CLASSES : CLASSES.filter((c) => c !== 'recovery-anchor');

/** An opaque offset. See the header: the *number* is checked elsewhere. */
const RETENTION = 1000;

type Reason =
  | 'terminal-lineage'
  | 'stale-sequence'
  | 'not-stopped'
  | 'class-not-in-set'
  | 'before-deadline'
  | 'no-handoff'
  | 'needs-reseed'
  | 'stale-revision'
  | 'genesis-against-live-lineage'
  | 'malformed-intent';

/**
 * Every operation returns a reason rather than a bare failure.
 *
 * **This project has been caught five times by a negative that refuses for the
 * wrong reason**, and a state machine with four guards on one call is exactly
 * where that happens again. Asserting the reason is what makes each falsifier
 * isolate the guard it names.
 */
type Result = { ok: true; world: World } | { ok: false; refused: Reason };

interface Mark {
  revision: number;
  state: Retention;
  stoppedAt: number | null;
  deadline: number | null;
  cause: Cause;
}

interface World {
  lineage: Lineage;
  state: Retention;
  cause: Cause;
  stoppedAt: number | null;
  /**
   * The destructive boundary. Written with `stopped_at` for a lapse; rewritten
   * **exactly once** at the `cause` overwrite to `retirement` — never earlier
   * than the inherited value, never recomputed after (`P-4`, ratified).
   */
  deadline: number | null;
  revision: number;
  /** The highest entitlement sequence accepted for this account. */
  sequence: number;
  ledger: Record<Class, 'pending' | 'done'>;
  /** `TerminalHandoff` receipts, one per class (`S0-6`). */
  handoffs: ReadonlySet<Class>;
  /** Hosted classes still present. */
  present: ReadonlySet<Class>;
  /**
   * The durable copy of the owner's signed erasure acceptance — intrinsic to
   * every accepted `retire` intent, and the only authority a ceiling erasure
   * executes. The clock is an executor, never an authority.
   */
  erasureAcceptance: boolean;
  /**
   * Set the first time a retirement class is erased without a receipt, which
   * only the owner's acceptance permits and §14.4 requires be recorded rather
   * than glossed. `restate` derives the terminal state from it.
   */
  deletedWithoutReceipt: boolean;
  /**
   * The durable reseed branch set (`FU-12`, the `S0-7` return): the prior
   * heads of every accepted `ReseedSession` under this live lineage. A second
   * divergent survivor joins this set — it never replaces a sibling and is
   * never lost to the compare-and-set that first refused it.
   */
  branches: ReadonlySet<string>;
}

/**
 * §14.4's audit fact, **derived rather than asserted**. A flag somebody sets by
 * hand is a flag that can disagree with what happened. For a retirement,
 * `cleared` itself now means *every deletion was receipt-authorized* — a
 * ceiling erasure terminates in `deleted-without-receipt` instead, so no
 * reader of the mark can take time's execution for a survivor's receipt.
 */
const handoffComplete = (w: World): boolean =>
  w.cause === 'retirement' && w.state === 'cleared' && !w.deletedWithoutReceipt;

const pending = (): Record<Class, 'pending' | 'done'> => ({
  primary: 'pending',
  replicas: 'pending',
  checkpoints: 'pending',
  wraps: 'pending',
  backups: 'pending',
  'recovery-anchor': 'pending',
});

const initial = (): World => ({
  lineage: 'live',
  state: 'hosted',
  cause: 'none',
  stoppedAt: null,
  deadline: null,
  revision: 0,
  sequence: 0,
  ledger: pending(),
  handoffs: new Set(),
  present: new Set(CLASSES),
  erasureAcceptance: false,
  deletedWithoutReceipt: false,
  branches: new Set(),
});

const mark = (w: World): Mark => ({
  revision: w.revision,
  state: w.state,
  stoppedAt: w.stoppedAt,
  deadline: w.deadline,
  cause: w.cause,
});

/**
 * `stopped_at` is written exactly once per entry into `stopped`, under a
 * compare-and-set on `revision`. A second writer observes the written value and
 * returns it rather than writing a second clock.
 *
 * **The destructive boundary is the one exception to "never recomputed", and
 * it moves in one direction, once** (`P-4`, ratified; the `S0-7` return). At
 * the `cause` overwrite to `retirement` — the client-signed event nothing may
 * overwrite — the boundary is written as `max(inherited deadline, retired_at +
 * RETENTION)`, which collapses to `retired_at + RETENTION` since a retirement
 * cannot precede the stop it inherits. So a retirement is never born with its
 * gate already disarmed, however long a lapse's clock had been running; and a
 * replayed retirement finds `cause` already `retirement` and recomputes
 * nothing.
 */
const stop = (w: World, cause: Exclude<Cause, 'none'>, now: number): World => {
  const stopped =
    w.stoppedAt === null ? { ...w, stoppedAt: now, deadline: now + RETENTION } : { ...w };
  const boundary =
    cause === 'retirement' && w.cause !== 'retirement'
      ? Math.max(stopped.deadline ?? 0, now + RETENTION)
      : stopped.deadline;
  return restate({ ...stopped, cause, deadline: boundary, revision: w.revision + 1 });
};

/**
 * The state is a function of the ledger *against the current cause's class set*,
 * and the cause can widen. A workspace whose hosted copy expired is `cleared`
 * and keeps its recovery anchor (PRD §6.10's dormant account); retiring it
 * afterwards adds class 6, so `cleared` becomes untrue and must become so
 * again by deletion rather than by having been true earlier.
 */
const restate = (w: World): World => ({
  ...w,
  state:
    w.stoppedAt === null
      ? w.state
      : classSet(w.cause).every((c) => w.ledger[c] === 'done')
        ? // A completed retirement whose classes were erased under the ceiling
          // terminates in its own state, never `cleared`: renaming it or
          // keeping only the audit bit is what P-4 falsifier 14 refuses.
          w.cause === 'retirement' && w.deletedWithoutReceipt
          ? 'deleted-without-receipt'
          : 'cleared'
        : classSet(w.cause).some((c) => w.ledger[c] === 'done')
          ? 'clearing'
          : 'stopped',
});

interface Entitlement {
  sequence: number;
  effect: 'grace-begins' | 'sync-stops' | 'restored';
  /** Bound, displayed, and never the clock. */
  effectiveAt: number;
}

const entitlement = (w: World, ev: Entitlement, now: number): Result => {
  // One rule gives both orderings of the race: nothing overwrites `retirement`.
  if (w.cause === 'retirement') return { ok: false, refused: 'terminal-lineage' };
  if (ev.sequence <= w.sequence) return { ok: false, refused: 'stale-sequence' };
  const seen = { ...w, sequence: ev.sequence };
  switch (ev.effect) {
    case 'grace-begins':
      return {
        ok: true,
        world:
          seen.state === 'hosted' ? { ...seen, state: 'grace', revision: seen.revision + 1 } : seen,
      };
    case 'sync-stops':
      // `now`, never `ev.effectiveAt`: a biller with a wrong clock would
      // otherwise backdate the deadline, which is early deletion wearing the
      // clothes of bookkeeping.
      return { ok: true, world: stop(seen, 'entitlement', now) };
    case 'restored':
      return resume(seen);
  }
};

interface Reseed {
  /** Null is a genesis claim, and §13.5 refuses it against a live lineage. */
  lineageId: string | null;
  epoch: number;
  priorHead: string;
  retentionRevision: number;
}

const resume = (w: World, reseed?: Reseed): Result => {
  if (w.cause === 'retirement') return { ok: false, refused: 'terminal-lineage' };
  const destroyed = w.state === 'clearing' || w.state === 'cleared';
  if (destroyed && reseed === undefined) return { ok: false, refused: 'needs-reseed' };
  if (reseed !== undefined) {
    if (reseed.lineageId === null) return { ok: false, refused: 'genesis-against-live-lineage' };
    // The refusal holds the session, never the divergent content behind it: a
    // stale survivor re-derives against the current revision and joins below.
    if (reseed.retentionRevision !== w.revision) return { ok: false, refused: 'stale-revision' };
  }
  return {
    ok: true,
    world: {
      ...w,
      state: 'hosted',
      cause: 'none',
      stoppedAt: null,
      deadline: null,
      revision: w.revision + 1,
      // **The ledger is reset, and forgetting this is a real bug rather than
      // tidiness.** A `done` surviving a resume means the *next* lapse skips
      // that class as already deleted, and the bytes it was supposed to delete
      // outlive their deadline.
      ledger: pending(),
      present: new Set(CLASSES),
      deletedWithoutReceipt: false,
      // FU-12: an accepted reseed **joins** the durable branch set. Acceptance
      // grows the set and never replaces a sibling — two divergent survivors
      // end as two branches of one live lineage, converging by merge.
      branches:
        reseed === undefined ? w.branches : new Set([...w.branches, reseed.priorHead]),
    },
  };
};

/** The intrinsic fields of a signed `retire` payload the model consumes. */
interface RetireIntent {
  /**
   * `P-4`'s ratified acceptance: *if no receiver completes a handoff within
   * the window, delete anyway.* Asking for deletion is accepting deletion —
   * the acceptance is intrinsic to every `retire`, inside its signed bytes.
   */
  acceptsDeletionWithoutReceipt: boolean;
}

/**
 * `retire` is the only thing that writes terminal lineage — and a payload
 * without the erasure acceptance in its signed bytes is **malformed, refused
 * at creation**: no acceptance-less retirement exists for the ceiling to
 * arbitrate (P-4 falsifier 15; flipping the acceptance in transit breaks the
 * intent's signature, which is the transition vectors' half).
 */
const retire = (w: World, now: number, intent: RetireIntent): Result => {
  if (!intent.acceptsDeletionWithoutReceipt) return { ok: false, refused: 'malformed-intent' };
  return {
    ok: true,
    world: { ...stop(w, 'retirement', now), lineage: 'retired', erasureAcceptance: true },
  };
};

const advance = (w: World, cls: Class, byReceipt: boolean): World => {
  const present = new Set(w.present);
  present.delete(cls);
  return restate({
    ...w,
    ledger: { ...w.ledger, [cls]: 'done' },
    present,
    revision: w.revision + 1,
    deletedWithoutReceipt: w.deletedWithoutReceipt || (w.cause === 'retirement' && !byReceipt),
  });
};

const deleteClass = (w: World, cls: Class, now: number): Result => {
  if (w.state === 'hosted' || w.state === 'grace') return { ok: false, refused: 'not-stopped' };
  if (!classSet(w.cause).includes(cls)) return { ok: false, refused: 'class-not-in-set' };
  if (w.ledger[cls] === 'done') return { ok: true, world: w }; // resumable, not restartable
  const past = w.deadline !== null && now >= w.deadline;
  if (w.cause === 'entitlement' && !past) return { ok: false, refused: 'before-deadline' };
  if (w.cause === 'retirement' && !w.handoffs.has(cls)) {
    // Before the boundary, `S0-6`'s gate is untouched: only a durable per-class
    // `TerminalHandoff` authorizes. At the boundary, what executes is the
    // owner's signed erasure acceptance — never elapsed time's own authority —
    // so a world that somehow carried no acceptance would keep its gate armed
    // forever rather than let the clock take over.
    if (!past || !w.erasureAcceptance) return { ok: false, refused: 'no-handoff' };
  }
  return { ok: true, world: advance(w, cls, w.handoffs.has(cls)) };
};

/**
 * The boundary's execution. Nothing survives it, whatever the cause — which is
 * what bounds §14.4's *a lost acknowledgement retains the bytes*, and what
 * stops it being the unbounded retention §16.6 calls a defect. For a
 * retirement this is the execution of the owner's intrinsic acceptance, and it
 * terminates in `deleted-without-receipt` — the bytes go, and the record still
 * says the handoff never completed rather than claiming it did.
 */
const enforceCeiling = (w: World, now: number): World => {
  if (w.deadline === null || now < w.deadline) return w;
  let next = w;
  for (const cls of classSet(w.cause)) {
    const r = deleteClass(next, cls, now);
    if (r.ok) next = r.world;
  }
  return next;
};

/** §13.5's ancestor rule at a second object. */
const acceptsMark = (seen: Mark, incoming: Mark): boolean =>
  incoming.revision > seen.revision ||
  (incoming.revision === seen.revision && JSON.stringify(incoming) === JSON.stringify(seen));

/** The deadline, where the caller already knows the clock is running. */
const deadlineOf = (w: World): number => {
  if (w.deadline === null) throw new Error('no clock is running');
  return w.deadline;
};

const expectOk = (r: Result): World => {
  if (!r.ok) throw new Error(`expected success, refused: ${r.refused}`);
  return r.world;
};

const lapsed = (now = 10): World =>
  expectOk(entitlement(initial(), { sequence: 1, effect: 'sync-stops', effectiveAt: now }, now));

/** The intrinsic acceptance every genuine `retire` carries (`P-4`, ratified). */
const ACCEPT: RetireIntent = { acceptsDeletionWithoutReceipt: true };

/** An accepted retirement — the only kind that exists (see `retire`). */
const retired = (w: World, now: number): World => expectOk(retire(w, now, ACCEPT));

// falsifies: f-4259822-lapse-transition-kind-missing
describe('§14.7 — one clock', () => {
  it('gives two concurrent stop events one stopped_at and one deadline', () => {
    const base = initial();
    // Both writers act against the same pre-stop world, as a race would.
    const first = expectOk(
      entitlement(base, { sequence: 1, effect: 'sync-stops', effectiveAt: 10 }, 10),
    );
    const second = expectOk(
      entitlement(first, { sequence: 2, effect: 'sync-stops', effectiveAt: 11 }, 11),
    );
    expect(second.stoppedAt).toBe(10);
    expect(second.deadline).toBe(10 + RETENTION);
    expect(second.deadline).toBe(first.deadline);
  });

  it('gives a second lapse a strictly later clock, never the first one back', () => {
    const first = lapsed(10);
    const back = expectOk(resume(first));
    expect(back.stoppedAt).toBeNull();
    const again = expectOk(
      entitlement(back, { sequence: 2, effect: 'sync-stops', effectiveAt: 500 }, 500),
    );
    expect(again.stoppedAt).toBe(500);
    expect(again.deadline).toBeGreaterThan(deadlineOf(first));
  });

  it('does not let a backdated or forward-dated effective time move the deadline', () => {
    const now = 900;
    for (const effectiveAt of [1, 5_000]) {
      const w = expectOk(
        entitlement(initial(), { sequence: 1, effect: 'sync-stops', effectiveAt }, now),
      );
      expect(w.deadline, `effectiveAt ${effectiveAt}`).toBe(now + RETENTION);
    }
  });

  it('changes no state when the deadline passes — only the ledger moves', () => {
    const w = lapsed(10);
    const after = { ...w }; // time passing is not an operation
    expect(after.state).toBe('stopped');
    expect(after.present.size).toBe(CLASSES.length);
    const cleared = enforceCeiling(w, deadlineOf(w) + 1);
    expect(cleared.state).toBe('cleared');
  });

  it('refuses a replayed entitlement event and changes nothing', () => {
    const w = lapsed(10);
    const replay = entitlement(w, { sequence: 1, effect: 'sync-stops', effectiveAt: 10 }, 99);
    expect(replay).toEqual({ ok: false, refused: 'stale-sequence' });
  });

  it('has a client reject a mark at a revision it has already passed', () => {
    const w = lapsed(10);
    const seen = mark(w);
    const rewritten: Mark = { ...seen, deadline: deadlineOf(w) - 500 };
    expect(acceptsMark(seen, rewritten)).toBe(false);
    expect(acceptsMark(seen, seen)).toBe(true);
    expect(acceptsMark(seen, { ...seen, revision: seen.revision + 1 })).toBe(true);
  });
});

// falsifies: f-4259822-lapse-transition-kind-missing
describe('§14.7 — the lineage stays live, and only retire moves it', () => {
  it('keeps the lineage live through lapse, expiry and a fully cleared store', () => {
    let w = lapsed(10);
    expect(w.lineage).toBe('live');
    w = enforceCeiling(w, deadlineOf(w) + 1);
    expect(w.state).toBe('cleared');
    expect(w.lineage).toBe('live');
  });

  it('writes terminal lineage only on retire', () => {
    expect(retired(initial(), 10).lineage).toBe('retired');
  });
});

// falsifies: f-4259822-retirement-safe-survivor-gate-undefined
describe('§14.7 — the six classes, and the cause that selects them', () => {
  it('deletes classes 1–5 on expiry and refuses the recovery anchor', () => {
    const w = lapsed(10);
    const past = deadlineOf(w) + 1;
    let next = w;
    for (const cls of CLASSES.filter((c) => c !== 'recovery-anchor')) {
      next = expectOk(deleteClass(next, cls, past));
    }
    // Refused *after* the deadline, so the deadline cannot be the reason. This
    // is the isolation the reason field exists for.
    expect(deleteClass(next, 'recovery-anchor', past)).toEqual({
      ok: false,
      refused: 'class-not-in-set',
    });
    expect(next.present).toEqual(new Set(['recovery-anchor']));
    // PRD §6.10's re-seed without a new code is true only because of that set.
    expect(next.present.has('recovery-anchor')).toBe(true);
  });

  it('refuses an expiry deletion before the deadline', () => {
    const w = lapsed(10);
    // A class that *is* in the set, so `class-not-in-set` cannot be the reason.
    expect(deleteClass(w, 'primary', deadlineOf(w) - 1)).toEqual({
      ok: false,
      refused: 'before-deadline',
    });
  });

  it('deletes a class on retirement only with a handoff for that class', () => {
    const w = retired(initial(), 10);
    const early = deadlineOf(w) - 1;
    expect(deleteClass(w, 'primary', early)).toEqual({ ok: false, refused: 'no-handoff' });
    // The paired positive: nothing else about the call changes.
    const withReceipt = { ...w, handoffs: new Set<Class>(['primary']) };
    expect(expectOk(deleteClass(withReceipt, 'primary', early)).present.has('primary')).toBe(false);
    // And the receipt is per class, not per retirement.
    expect(deleteClass(withReceipt, 'replicas', early)).toEqual({
      ok: false,
      refused: 'no-handoff',
    });
  });

  it('resumes a partial run at the first class that is not done, without re-deleting', () => {
    const w = lapsed(10);
    const past = deadlineOf(w) + 1;
    const partial = expectOk(
      deleteClass(expectOk(deleteClass(w, 'primary', past)), 'replicas', past),
    );
    const replay = expectOk(deleteClass(partial, 'primary', past));
    expect(replay).toEqual(partial); // idempotent: no revision burned, nothing re-deleted
    const finished = enforceCeiling(partial, past);
    expect(finished.state).toBe('cleared');
    expect(finished.present).toEqual(new Set(['recovery-anchor']));
  });

  it('lets nothing survive the boundary — and a receiptless erasure terminates in its own state', () => {
    /**
     * **Inverted at the `S0-7` return (P-4 falsifier 14).** The pre-return
     * positive asserted this world reached `cleared` — the terminal state a
     * reader could take for handoff completion — and that is now the permanent
     * negative: a ceiling erasure terminates in `deleted-without-receipt`,
     * with the handoff recorded incomplete. Renaming `cleared` back, or
     * keeping only the audit bit, fails here.
     */
    const w = retired(initial(), 10);
    expect(w.handoffs.size).toBe(0);
    const past = deadlineOf(w) + 1;
    const erased = enforceCeiling(w, past);
    expect(erased.present.size).toBe(0);
    expect(erased.state).toBe('deleted-without-receipt');
    // The bytes go and the audit record still says the handoff never completed.
    expect(handoffComplete(erased)).toBe(false);
    // And the receipt-authorized run stays distinguishable in the mark itself.
    const authorized = { ...w, handoffs: new Set<Class>(CLASSES) };
    let byReceipt: World = authorized;
    for (const cls of CLASSES) byReceipt = expectOk(deleteClass(byReceipt, cls, 11));
    expect(byReceipt.state).toBe('cleared');
    expect(handoffComplete(byReceipt)).toBe(true);
  });
});

// falsifies: f-4259822-retirement-safe-survivor-gate-undefined
describe('§14.7 — the ledger belongs to the cause, and to this stop', () => {
  /**
   * Both of these were model bugs before they were tests. Writing the machine
   * without them produced a `cleared` workspace that still held its recovery
   * anchor after the user asked for deletion, and a second lapse that skipped
   * every class the first one had already done — bytes outliving their
   * deadline by way of a stale `done`.
   */

  it('re-opens the ledger when retirement widens the class set after an expiry', () => {
    const expired = enforceCeiling(lapsed(10), 10 + RETENTION + 1);
    expect(expired.state).toBe('cleared');
    expect(expired.present).toEqual(new Set(['recovery-anchor']));
    const retiredAt = 10 + RETENTION + 2;
    const w = retired(expired, retiredAt);
    // `cleared` was true of five classes and is not true of six.
    expect(w.state).toBe('clearing');
    // The retirement's boundary is its own — the elapsed expiry clock did not
    // ride along — so the anchor's gate is armed at the birth instant (P-4).
    expect(deadlineOf(w)).toBe(retiredAt + RETENTION);
    expect(deleteClass(w, 'recovery-anchor', retiredAt + 1)).toEqual({
      ok: false,
      refused: 'no-handoff',
    });
    // A receipt finishes it as `cleared`; the boundary alone finishes it as
    // `deleted-without-receipt` — the two ends stay distinguishable.
    const byReceipt = expectOk(
      deleteClass({ ...w, handoffs: new Set<Class>(['recovery-anchor']) }, 'recovery-anchor', retiredAt + 1),
    );
    expect(byReceipt.present.size).toBe(0);
    expect(byReceipt.state).toBe('cleared');
    const byBoundary = enforceCeiling(w, deadlineOf(w));
    expect(byBoundary.present.size).toBe(0);
    expect(byBoundary.state).toBe('deleted-without-receipt');
  });

  it('deletes the classes again after a resume rather than reading a stale done', () => {
    const first = lapsed(10);
    const past = 10 + RETENTION + 1;
    const partly = expectOk(deleteClass(first, 'primary', past));
    expect(partly.ledger.primary).toBe('done');
    const back = expectOk(
      resume(partly, {
        lineageId: 'L1',
        epoch: 7,
        priorHead: 'h-a',
        retentionRevision: partly.revision,
      }),
    );
    expect(back.ledger.primary).toBe('pending');
    expect(back.present.has('primary')).toBe(true);
    const again = expectOk(
      entitlement(back, { sequence: 9, effect: 'sync-stops', effectiveAt: 900 }, 900),
    );
    expect(again.state).toBe('stopped'); // not `clearing` inherited from before
    const cleared = enforceCeiling(again, 900 + RETENTION + 1);
    expect(cleared.present).toEqual(new Set(['recovery-anchor']));
  });
});

// falsifies: f-4259822-lapse-transition-kind-missing
describe('§14.7 — resume, and the re-seed after destructive progress', () => {
  it('resumes with no re-seed before any destructive progress', () => {
    for (const w of [
      expectOk(entitlement(initial(), { sequence: 1, effect: 'grace-begins', effectiveAt: 5 }, 5)),
      lapsed(10),
    ]) {
      const back = expectOk(resume(w));
      expect(back.state).toBe('hosted');
      expect(back.present.size).toBe(CLASSES.length);
    }
  });

  it('refuses a resume after destructive progress unless a re-seed carries it', () => {
    const w = lapsed(10);
    const past = deadlineOf(w) + 1;
    const clearing = expectOk(deleteClass(w, 'primary', past));
    expect(clearing.state).toBe('clearing');
    expect(resume(clearing)).toEqual({ ok: false, refused: 'needs-reseed' });
    const seeded = expectOk(
      resume(clearing, {
        lineageId: 'L1',
        epoch: 7,
        priorHead: 'h-a',
        retentionRevision: clearing.revision,
      }),
    );
    expect(seeded.state).toBe('hosted');
  });

  it('refuses a re-seed that names a stale retention revision', () => {
    const w = lapsed(10);
    const past = deadlineOf(w) + 1;
    const clearing = expectOk(deleteClass(w, 'primary', past));
    // Everything else about the session is valid; only the revision is behind.
    expect(
      resume(clearing, {
        lineageId: 'L1',
        epoch: 7,
        priorHead: 'h-a',
        retentionRevision: clearing.revision - 1,
      }),
    ).toEqual({ ok: false, refused: 'stale-revision' });
  });

  it('takes two divergent survivors as branches that both join, and neither as genesis', () => {
    /**
     * **Inverted at the `S0-7` return (`FU-12`/`ST-07`).** The pre-return test
     * called `resume` twice from the same input world and passed neither
     * result to the other — two isolated counterfactuals, no branch set — so
     * the compare-and-set it selected would have refused the required second
     * survivor as stale, with no state saying how its divergent content joins.
     * Now the branch set is durable: A commits and advances the revision, B's
     * stale session is refused **and held**, and B re-derives against the
     * world A left and joins it — two branches, neither replacing the other.
     * The scheduler runs this same window with kills and a second writer in
     * test/storageSchedule.test.ts.
     */
    const w = lapsed(10);
    const past = deadlineOf(w) + 1;
    const clearing = expectOk(deleteClass(w, 'primary', past));
    const branch = (priorHead: string): Reseed => ({
      lineageId: 'L1',
      epoch: 7,
      priorHead,
      retentionRevision: clearing.revision,
    });
    // A and B derive their sessions from the same world, as divergence would.
    const a = branch('h-a');
    const b = branch('h-b');
    expect(a.lineageId).toBe(b.lineageId);
    expect(a.epoch).toBe(b.epoch);
    expect(a.priorHead).not.toBe(b.priorHead);
    const afterA = expectOk(resume(clearing, a));
    expect(afterA.state).toBe('hosted');
    expect(afterA.branches).toEqual(new Set(['h-a']));
    // ST-07's schedule, kept as the permanent negative: B arrives with the
    // revision A consumed and the compare-and-set refuses it — the session is
    // stale, and the divergent content behind it is held, never lost.
    expect(resume(afterA, b)).toEqual({ ok: false, refused: 'stale-revision' });
    // B rebuilds against the advanced revision and joins the world A left.
    const both = expectOk(resume(afterA, { ...b, retentionRevision: afterA.revision }));
    expect(both.state).toBe('hosted');
    expect(both.branches).toEqual(new Set(['h-a', 'h-b']));
    // §13.5: a signed live head forbids minting a replacement identity.
    expect(resume(clearing, { ...a, lineageId: null })).toEqual({
      ok: false,
      refused: 'genesis-against-live-lineage',
    });
  });
});

// falsifies: f-4259822-lapse-transition-kind-missing, f-4259822-retirement-safe-survivor-gate-undefined
describe('§14.7 — retirement wins the race, in both orders', () => {
  it('reaches the same mark whichever arrives first', () => {
    const lapseThenRetire = retired(lapsed(10), 40);
    const retireThenLapse = retired(initial(), 10);
    const afterLapse = entitlement(
      retireThenLapse,
      { sequence: 1, effect: 'sync-stops', effectiveAt: 40 },
      40,
    );
    expect(afterLapse).toEqual({ ok: false, refused: 'terminal-lineage' });

    expect(lapseThenRetire.cause).toBe('retirement');
    expect(retireThenLapse.cause).toBe('retirement');
    expect(lapseThenRetire.lineage).toBe('retired');
    // One clock: the retirement did not restart it — the stop is the same stop.
    expect(lapseThenRetire.stoppedAt).toBe(10);
    expect(retireThenLapse.stoppedAt).toBe(10);
    // The boundary, though, is the retirement's own in both orders:
    // retired_at + RETENTION, written once at the cause overwrite (P-4). The
    // pre-return machine let this order inherit the lapse's clock instead,
    // which is how a retirement could be born already past its ceiling.
    expect(lapseThenRetire.deadline).toBe(40 + RETENTION);
    expect(retireThenLapse.deadline).toBe(10 + RETENTION);
  });

  it('widens the class set when retirement overwrites an entitlement cause', () => {
    const w = lapsed(10);
    expect(classSet(w.cause)).not.toContain('recovery-anchor');
    expect(classSet(retired(w, 40).cause)).toContain('recovery-anchor');
  });

  it('refuses to restore a retired lineage', () => {
    const w = retired(lapsed(10), 40);
    expect(resume(w)).toEqual({ ok: false, refused: 'terminal-lineage' });
    expect(
      resume(w, { lineageId: 'L1', epoch: 7, priorHead: 'h-a', retentionRevision: w.revision }),
    ).toEqual({ ok: false, refused: 'terminal-lineage' });
  });
});

// falsifies: f-4259822-retirement-safe-survivor-gate-undefined
describe('§14.7 — the destructive boundary, inverted at the S0-7 return (P-4 falsifiers 11–16)', () => {
  it('refuses the reproduction: a retirement is never born with its gate disarmed', () => {
    /**
     * **Falsifier 11 — `C-7`'s exact schedule, now the permanent negative.**
     * Lapse; the deadline passes with no destructive act, which §14.7
     * deliberately permits; the owner retires. The pre-return machine
     * inherited the elapsed clock, so the `past` bypass was true from the
     * first instant and all six classes deleted with `handoffs.size === 0` —
     * elapsed time replacing the receiving client's custody authority.
     */
    const w = lapsed(10);
    const late = deadlineOf(w) + 1;
    const born = retired(w, late);
    expect(born.handoffs.size).toBe(0);
    expect(born.present.size).toBe(CLASSES.length);
    for (const cls of CLASSES) {
      expect(deleteClass(born, cls, late)).toEqual({ ok: false, refused: 'no-handoff' });
    }
    // The boundary is the retirement's own, and the stop is still the same stop.
    expect(deadlineOf(born)).toBe(late + RETENTION);
    expect(born.stoppedAt).toBe(10);
    // The ceiling's execution finds nothing to do at the birth instant.
    expect(enforceCeiling(born, late).present.size).toBe(CLASSES.length);
  });

  it('finds no earlier execution over arbitrary stopped_at ≤ retired_at pairs, in every order', () => {
    // Falsifier 12: retire alone, lapse-then-retire live, lapse-then-retire
    // elapsed — the gap sweeps the deadline in both directions.
    for (const stoppedAt of [0, 10, 999, 5000]) {
      for (const gap of [0, 1, RETENTION - 1, RETENTION, RETENTION + 1, 3 * RETENTION]) {
        const retiredAt = stoppedAt + gap;
        const worlds = [retired(initial(), retiredAt), retired(lapsed(stoppedAt), retiredAt)];
        for (const w of worlds) {
          const boundary = retiredAt + RETENTION;
          expect(deadlineOf(w), `stopped ${stoppedAt}, retired ${retiredAt}`).toBe(boundary);
          expect(deleteClass(w, 'primary', boundary - 1)).toEqual({
            ok: false,
            refused: 'no-handoff',
          });
          expect(enforceCeiling(w, boundary - 1).present.size).toBe(CLASSES.length);
        }
      }
    }
  });

  it('writes the boundary exactly once, at the cause overwrite, never earlier than inherited', () => {
    // Falsifier 13. The collapse case: retired the instant the stop happened,
    // so the formula's two arms are equal and the inherited deadline stands.
    const w = lapsed(10);
    expect(deadlineOf(retired(w, 10))).toBe(deadlineOf(w));
    // A replayed retirement finds `cause` already `retirement` and recomputes
    // nothing — the same boundary, the same clock.
    const first = retired(w, 400);
    const replay = retired(first, 900);
    expect(replay.deadline).toBe(first.deadline);
    expect(replay.stoppedAt).toBe(first.stoppedAt);
  });

  it('terminates a ceiling erasure in deleted-without-receipt, never a state a reader can take for a receipt', () => {
    // Falsifier 14 — the mark itself distinguishes execution from receipt;
    // the paired `cleared` positive lives with the six-classes describe.
    const w = retired(initial(), 10);
    const erased = enforceCeiling(w, deadlineOf(w));
    expect(erased.present.size).toBe(0);
    expect(erased.state).toBe('deleted-without-receipt');
    expect(handoffComplete(erased)).toBe(false);
  });

  it('refuses a retire intent without the erasure acceptance as malformed, at creation', () => {
    // Falsifier 15. No acceptance-less retirement exists for the ceiling to
    // arbitrate; the in-transit flip breaking the intent's signature is the
    // transition vectors' half of this falsifier.
    expect(retire(initial(), 10, { acceptsDeletionWithoutReceipt: false })).toEqual({
      ok: false,
      refused: 'malformed-intent',
    });
    expect(retire(lapsed(10), 40, { acceptsDeletionWithoutReceipt: false })).toEqual({
      ok: false,
      refused: 'malformed-intent',
    });
  });

  it("keeps the boundary out of the entitlement signer's reach in both directions, in C-7's order", () => {
    // Falsifier 16, in the order C-7 used: the attacker supplies the lapse,
    // the deadline elapses, the victim supplies the retire.
    const attacked = lapsed(10);
    const late = deadlineOf(attacked) + 1;
    const w = retired(attacked, late);
    const boundary = deadlineOf(w);
    expect(boundary).toBe(late + RETENTION);
    // Ping-ponged stop/resume and `restored` extend nothing after the cause
    // overwrite — and shorten nothing, however backdated.
    for (const [i, effect] of (['sync-stops', 'restored', 'grace-begins'] as const).entries()) {
      expect(
        entitlement(w, { sequence: 90 + i, effect, effectiveAt: -10_000 }, late + 2 + i),
      ).toEqual({ ok: false, refused: 'terminal-lineage' });
    }
    expect(deadlineOf(w)).toBe(boundary);
    expect(deleteClass(w, 'primary', boundary - 1)).toEqual({ ok: false, refused: 'no-handoff' });
  });
});

// falsifies: f-4259822-lapse-transition-kind-missing
describe('§14.7 — what a compromised entitlement signer reaches', () => {
  /** The adversary holds the entitlement key and nothing else. */
  const compromised = (w: World, now: number): World => {
    let next = w;
    for (const effect of ['grace-begins', 'sync-stops', 'sync-stops'] as const) {
      const r = entitlement(
        next,
        { sequence: next.sequence + 1, effect, effectiveAt: -10_000 },
        now,
      );
      if (r.ok) next = r.world;
    }
    return next;
  };

  it('denies hosting and cannot reach the lineage, the anchor, or the deadline', () => {
    const attacked = compromised(initial(), 100);
    expect(attacked.state).toBe('stopped');
    // Availability, not integrity.
    expect(attacked.lineage).toBe('live');
    expect(attacked.cause).toBe('entitlement');
    // A backdated effective time did not shorten the promise.
    expect(attacked.deadline).toBe(100 + RETENTION);
    // Nothing may go before the deadline...
    expect(deleteClass(attacked, 'primary', 100)).toEqual({
      ok: false,
      refused: 'before-deadline',
    });
    // ...and class 6 never, because the class set follows the cause.
    const past = deadlineOf(attacked) + 1;
    const cleared = enforceCeiling(attacked, past);
    expect(cleared.present).toEqual(new Set(['recovery-anchor']));
    expect(cleared.lineage).toBe('live');
  });
});
