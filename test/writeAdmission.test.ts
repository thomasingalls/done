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
  /** Set the moment the journal refuses; cleared when IndexedDB commits. */
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
  notDurable: null,
  acknowledged: [],
  ...over,
});

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

/** The batch commits and the journal entries it covered are removed. */
const commitBatch = (s: Store): Store => ({
  ...s,
  journal: { ...s.journal, entries: [] },
  notDurable: null,
  acknowledged: [...s.acknowledged, ...s.journal.entries.map((e) => e.id)],
});

/**
 * One locally originated edit. **An unjournallable write is not lost and is not
 * acknowledged**: the batch is forced, and the edit becomes durable when
 * IndexedDB says so rather than when the handler returns (PRD §7.10).
 */
const localEdit = (s: Store, id: string, bytes: number): Store => {
  const attempt = journalWrite(s, id, bytes);
  if (attempt.ok) return { ...attempt.store, acknowledged: [...attempt.store.acknowledged, id] };
  return commitBatch({
    ...attempt.store,
    journal: {
      ...attempt.store.journal,
      entries: [...attempt.store.journal.entries, { id, chars: 0 }],
    },
  });
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
    const after = localEdit(s, 'edit-1', 8);
    // The edit survives -- it is in the forced batch -- and it was never
    // reported as saved before IndexedDB said so.
    expect(after.acknowledged).toContain('edit-1');
    expect(after.notDurable).toBeNull();
    const straight = localEdit(store(), 'edit-2', 8);
    expect(straight.acknowledged).toEqual(['edit-2']);
  });
});

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
