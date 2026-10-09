/**
 * Evidence-scope amendment (2026-09-08): this is a partial Stage 0 model.
 * It does not certify SC-01..09 as a whole. In particular the older storage
 * composition omits generation-tagged journal capabilities and relies on
 * explicit remote redelivery. Current counterexamples live in
 * test/storageContract.test.ts; production obligations are in
 * docs/storage-conformance.md. Retain the valid represented cases, not the
 * former full-retirement/offline-recovery inference.
 */
/**
 * Local write admission, the sequence allocator and the nonce budget, as an
 * executable model (TRD §§6.1/7.4/10.10/12, §15 rows 2 and 3, `S0-3`, `P-3`).
 *
 * **`RC-3`'s diagnosis is that the pieces are sound and the entry conditions are
 * missing**: *the composition mistake is treating a record format plus a
 * component benchmark as a total concurrent write-admission machine.* So this
 * models the entry conditions — what happens when the journal cannot take a
 * write, who owns the next `seq`, and what the 2^32 comparison reads.
 *
 * **Sizes here are symbolic, and that is deliberate.** `MAX_UPDATE` is 64 in
 * this file so slicing is legible in a test. Whether the real constant follows
 * §12's budget is `scripts/check-update-limit.mjs`'s job, and it recomputes the
 * derivation from the published measurements rather than comparing a string.
 * Two checks, two subjects: this one owns the orderings.
 *
 * **Consolidated at the `S0-3` return (2026-08-28), under `P-3`'s ratified
 * class-2 rules.** The refusal path stages the input as pending and withholds
 * the acknowledgement until the forced batch commits — nothing becomes
 * authoritative without a durable carrier — and the mark that state sets is
 * READ by the forced flush, with round 1 `S-6`'s two green mutations held
 * below as permanent negatives (falsifier 18). The allocator gains the fence:
 * a commit validates its reservation's generation where the commit lands and
 * aborts into re-reservation when the marker moved (falsifier 19). The kill
 * points and second writers these orderings imply are scheduled in
 * `test/storageSchedule.test.ts`, which composes this machine with
 * `GenerationApply` in one world.
 */

import { describe, expect, it } from 'vitest';

/** Symbolic. The real one is derived from §12's budget; see the header. */
const MAX_UPDATE = 64;
/** The module's backstop, which admission is supposed to make unreachable. */
const MAX_PLAINTEXT = 256;
const BUDGET = 2 ** 32;

type Refusal = 'oversize' | 'quota' | 'unavailable';

interface Journal {
  /** Entries, each with the characters it costs once base64 and its key are counted. */
  entries: { id: string; chars: number }[];
  /** The origin's wall, in stored characters -- never in entries. */
  capacity: number;
  available: boolean;
}

interface Store {
  nextSeq: number;
  reserved: Record<number, number>;
  gen: number;
  /** Committed records, as (seq, gen). */
  records: { seq: number; gen: number }[];
  journal: Journal;
  /** Refused edits staged for the forced asynchronous commit — never yet in the document. */
  pending: { id: string; chars: number }[];
  /** Ids IndexedDB has committed. */
  committed: string[];
  /** Set the moment the journal refuses; READ by the forced flush; cleared when IndexedDB commits. */
  notDurable: Refusal | null;
  /** Edits the user has been told are saved. */
  acknowledged: string[];
}

const store = (over: Partial<Store> = {}): Store => ({
  nextSeq: 1,
  reserved: {},
  gen: 3,
  records: [],
  journal: { entries: [], capacity: 4096, available: true },
  pending: [],
  committed: [],
  notDurable: null,
  acknowledged: [],
  ...over,
});

/**
 * The carrier invariant, and it is what makes the refusal state readable
 * (`P-3` falsifiers 17–18): every acknowledged edit is held by a durable
 * carrier — the journal or the committed batch. A "saved" outside both is the
 * exact sentence the journal exists to refuse, and round 1 `S-6` showed the
 * old model could not read it: acknowledging an unjournallable edit
 * immediately passed 18/18. The two mutation tests below hold this as a
 * permanent negative.
 */
const carrierViolations = (s: Store): string[] =>
  s.acknowledged.filter(
    (id) => !s.journal.entries.some((e) => e.id === id) && !s.committed.includes(id),
  );

/** base64 expands by 4/3, plus the key that names the entry. */
const storedChars = (bytes: number) => Math.ceil((bytes + 16) / 3) * 4 + 40;

// --- admission -----------------------------------------------------------------

type Admission = { ok: true; store: Store } | { ok: false; refused: Refusal; store: Store };

/**
 * The gate in front of the seal. **Three causes, one state** -- which is the
 * whole of `P-3`'s residual: an update too large, an exhausted quota and
 * unavailable storage differ only in why, and a writer that handled them
 * separately would have three partial answers instead of one complete one.
 */
const journalWrite = (s: Store, id: string, bytes: number): Admission => {
  const refuse = (refused: Refusal): Admission => ({
    ok: false,
    refused,
    store: { ...s, notDurable: refused },
  });
  if (bytes > MAX_UPDATE) return refuse('oversize');
  if (!s.journal.available) return refuse('unavailable');
  const chars = storedChars(bytes);
  const used = s.journal.entries.reduce((n, e) => n + e.chars, 0);
  if (used + chars > s.journal.capacity) return refuse('quota');
  return {
    ok: true,
    store: {
      ...s,
      journal: { ...s.journal, entries: [...s.journal.entries, { id, chars }] },
    },
  };
};

/**
 * The batch commits: the journal entries it covered are removed (IndexedDB now
 * holds them), the pending refused edits are carried and only now
 * acknowledged, and the refusal state clears.
 */
const commitBatch = (s: Store): Store => ({
  ...s,
  journal: { ...s.journal, entries: [] },
  pending: [],
  committed: [...s.committed, ...s.journal.entries.map((e) => e.id), ...s.pending.map((p) => p.id)],
  notDurable: null,
  acknowledged: [...s.acknowledged, ...s.pending.map((p) => p.id)],
});

/**
 * The forced flush the refusal licenses — and it READS the mark, which is what
 * makes `notDurable` load-bearing rather than write-only (round 1 `S-6`,
 * inverted at the `S0-3` return): a model that never sets the mark never
 * forces the batch, and the refused edit is caught unacknowledged by the
 * contract below.
 */
const forcedFlush = (s: Store): Store => (s.notDurable === null ? s : commitBatch(s));

/**
 * One locally originated edit, under `P-3`'s ratified carrier rule: **nothing
 * becomes authoritative without a durable carrier.** On the ordinary path the
 * synchronous journal write is that carrier, and the acknowledgement rides it.
 * On a refusal the input is *staged as pending* — the document does not gain
 * it, nothing is acknowledged — and the handler returns with the document
 * equal to recoverable state. The forced batch's commit is the carrier the
 * promotion and the acknowledgement wait for; the milliseconds in between are
 * the crash point `test/storageSchedule.test.ts` kills at (falsifier 17).
 */
const localEdit = (s: Store, id: string, bytes: number): Store => {
  const attempt = journalWrite(s, id, bytes);
  if (attempt.ok) return { ...attempt.store, acknowledged: [...attempt.store.acknowledged, id] };
  return {
    ...attempt.store,
    pending: [...attempt.store.pending, { id, chars: 0 }],
  };
};

/** An operation applied in slices, each its own transaction and each journalled. */
const applyOperation = (s: Store, id: string, bytes: number, killAfter = Infinity): Store => {
  const slice = MAX_UPDATE / 2; // conservative: the update is a function of the input
  let next = s;
  const slices = Math.ceil(bytes / slice);
  for (let i = 0; i < slices; i++) {
    if (i >= killAfter) break;
    next = localEdit(next, `${id}.${i}`, Math.min(slice, bytes - i * slice));
  }
  return next;
};

// --- the allocator --------------------------------------------------------------

/** One durable transaction: grant the range and count it against the generation. */
const reserve = (s: Store, k: number): { s: Store; from: number } => ({
  s: {
    ...s,
    nextSeq: s.nextSeq + k,
    reserved: { ...s.reserved, [s.gen]: (s.reserved[s.gen] ?? 0) + k },
  },
  from: s.nextSeq,
});

/** §6.1's comparison, and the count it reads is not `seq`. */
const mustRotateBefore = (s: Store, k: number) => (s.reserved[s.gen] ?? 0) + k >= BUDGET;

const rotate = (s: Store): Store => ({ ...s, gen: s.gen + 1 });

/**
 * The committing transaction validates the reservation's generation where the
 * commit lands (`P-3` joint 3's fence, ratified 2026-08-28; `FU-09`). The
 * active marker's home shares the store's database, so the same serialization
 * the allocator's two-tab argument leans on refuses a commit whose reservation
 * crossed a marker advance: it aborts into re-reservation, and the abandoned
 * range stays counted. The re-reserve rule above is thereby checked where
 * looking is atomic, never merely when the batch happens to look.
 * `test/storageSchedule.test.ts` schedules the interleaving itself.
 */
const commitReserved = (
  s: Store,
  r: { from: number; k: number; gen: number },
): { s: Store; committed: boolean } =>
  r.gen !== s.gen
    ? { s, committed: false }
    : {
        s: {
          ...s,
          records: [
            ...s.records,
            ...Array.from({ length: r.k }, (_, i) => ({ seq: r.from + i, gen: r.gen })),
          ],
        },
        committed: true,
      };

/**
 * The trim deletes **what its state record covered**, not everything below a
 * number -- and the allocator is what makes that well defined.
 *
 * `f-3bea0e6` names the consequence: *a trim state at that value can then delete
 * a concurrently committed update that its snapshot did not cover.* The first
 * draft of this model read `next_seq` as a watermark and called that the repair.
 * **A mutation showed it was not one**: with the allocator in place the
 * watermark and the covered set agree, so swapping one for the other changes
 * nothing, and without the allocator a watermark is no safer than any other
 * range.
 *
 * What the allocator actually buys the trimmer is **uniqueness**: one `seq` is
 * issued once, so *the records I covered* is expressible at all. Two tabs each
 * choosing `max + 1` produce two records at one number, and then no rule stated
 * over numbers can separate them.
 */
const trimCovering = (s: Store, covered: readonly number[]): Store => ({
  ...s,
  records: s.records.filter((r) => !covered.includes(r.seq)),
});
const trimBelow = (s: Store, boundary: number): Store => ({
  ...s,
  records: s.records.filter((r) => r.seq >= boundary),
});

// falsifies: f-9b49b74-journal-seal-64k-gap -> L-1
describe('§6.1 — admission, and the one state behind it', () => {
  it('refuses an update over the limit before the seal ever sees it', () => {
    const attempt = journalWrite(store(), 'big', MAX_UPDATE + 1);
    expect(attempt).toMatchObject({ ok: false, refused: 'oversize' });
  });

  it('never reaches the module guard, because admission is far below it', () => {
    // The seal's guard is a backstop. A build that reaches it is a defect in
    // admission, not a module behaving badly.
    expect(MAX_UPDATE).toBeLessThan(MAX_PLAINTEXT);
    const admitted = [
      1,
      MAX_UPDATE - 1,
      MAX_UPDATE,
      MAX_UPDATE + 1,
      MAX_PLAINTEXT,
      MAX_PLAINTEXT * 4,
    ].filter(
      (bytes) =>
        journalWrite(
          store({ journal: { entries: [], capacity: 1e6, available: true } }),
          'x',
          bytes,
        ).ok,
    );
    expect(admitted).toEqual([1, MAX_UPDATE - 1, MAX_UPDATE]);
    for (const bytes of admitted) expect(bytes).toBeLessThan(MAX_PLAINTEXT);
  });

  it('reaches one state for oversize, quota and unavailable storage', () => {
    const causes: Refusal[] = ['oversize', 'quota', 'unavailable'];
    const seen = new Set<Refusal>();
    seen.add((journalWrite(store(), 'a', MAX_UPDATE + 1) as { refused: Refusal }).refused);
    seen.add(
      (
        journalWrite(store({ journal: { entries: [], capacity: 1, available: true } }), 'b', 8) as {
          refused: Refusal;
        }
      ).refused,
    );
    seen.add(
      (
        journalWrite(
          store({ journal: { entries: [], capacity: 4096, available: false } }),
          'c',
          8,
        ) as {
          refused: Refusal;
        }
      ).refused,
    );
    // Three causes, and each names itself -- but they arrive through one field
    // of one result, so a caller cannot handle two of the three and believe it
    // has handled the case. That is the whole of `P-3`'s residual.
    expect([...seen].sort()).toEqual([...causes].sort());
    const shapes = new Set(
      [
        journalWrite(store(), 'a', MAX_UPDATE + 1),
        journalWrite(store({ journal: { entries: [], capacity: 1, available: true } }), 'b', 8),
        journalWrite(store({ journal: { entries: [], capacity: 4096, available: false } }), 'c', 8),
      ].map((r) => (r.ok ? 'ok' : `refused:${typeof r.refused}`)),
    );
    expect([...shapes]).toEqual(['refused:string']);
  });

  it('does not acknowledge an edit the journal could not take until the batch commits', () => {
    const s = store({ journal: { entries: [], capacity: 4096, available: false } });
    const mid = localEdit(s, 'edit-1', 8);
    // The handler has returned and the window is open: the input is staged as
    // pending, the mark is set and readable, nothing is acknowledged, and no
    // acknowledged edit sits outside a durable carrier.
    expect(mid.acknowledged).not.toContain('edit-1');
    expect(mid.notDurable).toBe('unavailable');
    expect(mid.pending.map((p) => p.id)).toContain('edit-1');
    expect(carrierViolations(mid)).toEqual([]);
    // The forced flush -- driven by the mark -- commits, promotes and only
    // then acknowledges.
    const after = forcedFlush(mid);
    expect(after.acknowledged).toContain('edit-1');
    expect(after.notDurable).toBeNull();
    expect(carrierViolations(after)).toEqual([]);
    const straight = localEdit(store(), 'edit-2', 8);
    expect(straight.acknowledged).toEqual(['edit-2']);
    expect(carrierViolations(straight)).toEqual([]);
  });

  // The two mutations round 1 `S-6` ran green, held as permanent negatives
  // (`P-3` falsifier 18): the refusal state is read, not write-only.
  it('fails a model that never marks not-durable, because the forced flush reads the mark', () => {
    const neverMarks = (s: Store, id: string, bytes: number): Store => {
      const attempt = journalWrite(s, id, bytes);
      if (attempt.ok)
        return { ...attempt.store, acknowledged: [...attempt.store.acknowledged, id] };
      // The mutation: the refusal happens and the mark is never written.
      return {
        ...attempt.store,
        notDurable: null,
        pending: [...attempt.store.pending, { id, chars: 0 }],
      };
    };
    const dark = store({ journal: { entries: [], capacity: 4096, available: false } });
    const mutant = forcedFlush(neverMarks(dark, 'e', 8));
    // The flush reads the mark, so the mutant never commits: the refused edit
    // stays unacknowledged and uncarried, which the ordinary model's own
    // assertions above refuse. The mark is load-bearing.
    expect(mutant.acknowledged).not.toContain('e');
    expect(mutant.committed).not.toContain('e');
    const honest = forcedFlush(localEdit(dark, 'e', 8));
    expect(honest.acknowledged).toContain('e');
  });

  it('fails a model that acknowledges an unjournallable edit before IndexedDB commits', () => {
    const acksEarly = (s: Store, id: string, bytes: number): Store => {
      const attempt = journalWrite(s, id, bytes);
      if (attempt.ok)
        return { ...attempt.store, acknowledged: [...attempt.store.acknowledged, id] };
      // The mutation: the verbatim reachable consequence of f-9b49b74 -- the
      // handler reports saved with nothing durable holding the edit.
      return {
        ...attempt.store,
        pending: [...attempt.store.pending, { id, chars: 0 }],
        acknowledged: [...attempt.store.acknowledged, id],
      };
    };
    const dark = store({ journal: { entries: [], capacity: 4096, available: false } });
    const mutant = acksEarly(dark, 'e', 8);
    // The carrier invariant isolates exactly this mutation...
    expect(carrierViolations(mutant)).toEqual(['e']);
    // ...and the ordinary model never violates it, before or after the flush.
    const mid = localEdit(dark, 'e', 8);
    expect(carrierViolations(mid)).toEqual([]);
    expect(carrierViolations(forcedFlush(mid))).toEqual([]);
  });
});

// falsifies: f-9b49b74-journal-seal-64k-gap -> L-1
describe('§6.1 — slicing, so the log never meets what it cannot take', () => {
  it('applies an operation far over the limit in full, refusing nothing', () => {
    const after = applyOperation(
      store({ journal: { entries: [], capacity: 1e6, available: true } }),
      'paste',
      MAX_UPDATE * 20,
    );
    expect(after.acknowledged).toHaveLength(40);
    expect(after.notDurable).toBeNull();
  });

  it('leaves a prefix when the page dies part-way through', () => {
    const s = store({ journal: { entries: [], capacity: 1e6, available: true } });
    const killed = applyOperation(s, 'import', MAX_UPDATE * 20, 7);
    expect(killed.acknowledged).toEqual(Array.from({ length: 7 }, (_, i) => `import.${i}`));
    // Every completed slice is durable and none is partial -- which one
    // arbitrary-size update could not offer.
    expect(killed.journal.entries).toHaveLength(7);
  });

  it('keeps every slice inside the limit', () => {
    const s = store({ journal: { entries: [], capacity: 1e6, available: true } });
    const after = applyOperation(s, 'p', MAX_UPDATE * 5);
    for (const e of after.journal.entries)
      expect(e.chars).toBeLessThanOrEqual(storedChars(MAX_UPDATE));
  });
});

// falsifies: f-9b49b74-journal-seal-64k-gap -> L-1
describe('§6.1 — the back-pressure watermark is characters, not entries', () => {
  const wall = 5_300_000;
  const fits = (bytes: number) => Math.floor(wall / storedChars(bytes));

  it('holds tens of thousands of keystrokes and hundreds of large updates', () => {
    expect(fits(18)).toBeGreaterThan(50_000);
    expect(fits(16 * 1024)).toBeLessThan(300);
    // Two orders of magnitude between them, which is what a count-based
    // watermark would be wrong by at the size that matters.
    expect(fits(18) / fits(16 * 1024)).toBeGreaterThan(100);
  });

  it('refuses at the character wall rather than at an entry count', () => {
    let s = store({
      journal: { entries: [], capacity: storedChars(MAX_UPDATE) * 2 + 1, available: true },
    });
    for (const id of ['a', 'b']) {
      const attempt = journalWrite(s, id, MAX_UPDATE);
      expect(attempt.ok).toBe(true);
      s = attempt.store;
    }
    expect(journalWrite(s, 'c', MAX_UPDATE)).toMatchObject({ ok: false, refused: 'quota' });

    // **A small entry still fits where a large one did not**, which is the
    // property an entry-count watermark cannot express: the same two entries
    // outstanding, and whether a third is admitted depends on its size.
    const roomier = store({
      journal: {
        entries: s.journal.entries,
        capacity: s.journal.capacity + storedChars(1),
        available: true,
      },
    });
    expect(journalWrite(roomier, 'd', 1).ok).toBe(true);
    expect(journalWrite(roomier, 'e', MAX_UPDATE).ok).toBe(false);
  });
});

// falsifies: f-3bea0e6-store-sequence-allocation-undefined, f-dbfd01f-record-nonce-ceiling-omitted
describe('§6.1 — the allocator, and the count the budget reads', () => {
  it('gives two tabs disjoint ranges', () => {
    const shared = store();
    const a = reserve(shared, 3);
    const b = reserve(a.s, 2);
    expect(b.from).toBe(a.from + 3);
  });

  it('counts a batch abandoned after reserving, which a committed-record count cannot', () => {
    let s = store();
    s = reserve(s, 4).s; // reserved, then a crash before any record commits
    const second = reserve(s, 2);
    s = { ...second.s, records: [{ seq: second.from, gen: s.gen }] };
    expect(s.reserved[s.gen]).toBe(6);
    // The committed count sees one. SP 800-38D bounds invocations, and five of
    // these were invocations that happened.
    expect(s.records).toHaveLength(1);
  });

  it('reads `reserved[gen]` and not `nextSeq`, which is what makes rotation survivable', () => {
    let s = store({ nextSeq: BUDGET - 1, reserved: { 3: 10 } });
    // `nextSeq` is already at the ceiling and the generation has spent ten.
    expect(mustRotateBefore(s, 1)).toBe(false);
    s = { ...s, reserved: { 3: BUDGET - 1 } };
    expect(mustRotateBefore(s, 1)).toBe(true);
    // Equality is the first disallowed value.
    expect(mustRotateBefore({ ...s, reserved: { 3: BUDGET - 2 } }, 1)).toBe(false);
  });

  it('starts a fresh budget on rotation without resetting the global order', () => {
    const s = rotate(store({ nextSeq: 900, reserved: { 3: BUDGET - 1 } }));
    expect(mustRotateBefore(s, 1)).toBe(false);
    expect(s.nextSeq).toBe(900);
    expect(s.reserved[3]).toBe(BUDGET - 1); // the old generation keeps its count
  });

  it('re-reserves when a rotation lands mid-flight, leaving the old range counted', () => {
    let s = store();
    const first = reserve(s, 3);
    s = rotate(first.s);
    const second = reserve(s, 3);
    expect(second.s.reserved[3]).toBe(3); // abandoned, still counted
    expect(second.s.reserved[4]).toBe(3);
    expect(second.from).toBeGreaterThan(first.from);
  });

  it('aborts a commit whose reservation crossed the marker, where the commit lands', () => {
    let s = store();
    const first = reserve(s, 3); // granted under gen 3
    s = rotate(first.s); // the marker advances while the range is in flight
    const late = commitReserved(s, { from: first.from, k: 3, gen: 3 });
    // The fence (P-3 falsifier 19): the late commit aborts -- no record lands
    // under the generation the reservation crossed out of.
    expect(late.committed).toBe(false);
    expect(late.s.records).toHaveLength(0);
    // Re-reservation under the successor commits, and the abandoned range
    // stays counted against the old generation, composing with falsifier 8.
    const second = reserve(late.s, 3);
    const landed = commitReserved(second.s, { from: second.from, k: 3, gen: second.s.gen });
    expect(landed.committed).toBe(true);
    expect(landed.s.records.every((r) => r.gen === 4)).toBe(true);
    expect(landed.s.reserved[3]).toBe(3);
    expect(landed.s.reserved[4]).toBe(3);
  });

  it('deletes what its snapshot covered and leaves a concurrent commit alone', () => {
    const before = store({
      records: [
        { seq: 1, gen: 3 },
        { seq: 2, gen: 3 },
        { seq: 3, gen: 3 },
      ],
      nextSeq: 4,
    });
    const covered = before.records.map((r) => r.seq);

    // A concurrent batch reserves and commits while the trim is deciding.
    const concurrent = reserve(before, 1);
    const after: Store = {
      ...concurrent.s,
      records: [...before.records, { seq: concurrent.from, gen: 3 }],
    };

    expect(trimCovering(after, covered).records).toEqual([{ seq: 4, gen: 3 }]);
  });

  it('is only safe because a seq is issued once, which is the allocator', () => {
    // The world without one: two tabs each read the highest committed value and
    // both write at 4. The trim covered one of them.
    const forked = store({
      records: [
        { seq: 3, gen: 3 },
        { seq: 4, gen: 3 },
        { seq: 4, gen: 3 },
      ],
    });

    // Neither rule can separate them, because they are the same number. The
    // failure is upstream of the trim's rule, in the numbering.
    expect(trimCovering(forked, [3, 4]).records).toEqual([]);
    expect(trimBelow(forked, 5).records).toEqual([]);

    // With the allocator the state that makes this expressible cannot arise.
    const shared = store({ nextSeq: 4 });
    const a = reserve(shared, 1);
    const b = reserve(a.s, 1);
    expect(a.from).not.toBe(b.from);
  });
});

// falsifies: f-9b49b74-journal-seal-64k-gap -> L-1
describe("§6.1 — remote updates are not this journal's contract", () => {
  /** The accepted mark advances only after the content batch commits. */
  const receive = (s: Store, mark: number, commit: boolean) =>
    commit ? { ...s, records: [...s.records, { seq: mark, gen: s.gen }] } : s;

  it('does not journal a remote update, and re-delivers it after a kill', () => {
    const s = store();
    const crashed = receive(s, 9, false);
    expect(crashed.journal.entries).toHaveLength(0);
    // The mark never advanced, so sync sends it again.
    expect(crashed.records).toHaveLength(0);
    expect(receive(crashed, 9, true).records).toHaveLength(1);
  });

  it('lets a local update that depends on an unpersisted remote one integrate later', () => {
    // The composition `P-3` owes: the journal replays a local update whose
    // causal dependency was never persisted, because remote updates are not
    // journalled. Modelled as hold-and-integrate rather than asserted.
    interface Doc {
      applied: string[];
      held: { id: string; needs: string }[];
    }
    const apply = (d: Doc, u: { id: string; needs: string | null }): Doc => {
      if (u.needs !== null && !d.applied.includes(u.needs)) {
        return { ...d, held: [...d.held, { id: u.id, needs: u.needs }] };
      }
      const applied = [...d.applied, u.id];
      const ready = d.held.filter((h) => applied.includes(h.needs));
      return {
        applied: [...applied, ...ready.map((h) => h.id)],
        held: d.held.filter((h) => !ready.includes(h)),
      };
    };

    // Reload: the journal has the local update; the remote one it needs is gone.
    let doc: Doc = { applied: [], held: [] };
    doc = apply(doc, { id: 'local', needs: 'remote' });
    expect(doc.applied).toEqual([]);
    expect(doc.held).toEqual([{ id: 'local', needs: 'remote' }]);

    // Sync re-delivers it, because the accepted mark never advanced.
    doc = apply(doc, { id: 'remote', needs: null });
    expect(doc.applied).toEqual(['remote', 'local']);
    expect(doc.held).toEqual([]);
  });
});
