// @vitest-environment node
// Phase 548: an action whose single change is over the 16 KiB admission update limit either saves
// in slices (compose, the way a paste into a card already does) or is refused alone: its ticket
// settles with a too-large result, nothing changes, and the queue stays active. On the phase 547
// source every over-limit case here stayed pending with the queue blocked at `slice-required`.
import { afterEach, describe, expect, it } from 'vitest';
import { createAdmittedWorkspace, type AdmittedWorkspace } from '../src/crdt/admittedWorkspace';
import { createAdmissionOwner } from '../src/crdt/admissionQueue';
import { MAX_JOURNAL_UPDATE, type JournalSession } from '../src/crdt/custody';
import {
  ActionTooLarge,
  MAX_ACTION_TEXT_UNITS,
  TOO_LARGE_FOR_ONE_ACTION,
} from '../src/crdt/actionSize';
import { COMPOSE_WHOLE_BYTES, TEXT_SLICE_UNITS } from '../src/crdt/workspaceCommands';
import { Y } from '../src/crdt/yjs';
import { compose as composeDirect } from '../src/crdt';
import { harness, type Harness } from './workspace';

const identity = {
  id: 'oversize-human',
  actor: { kind: 'human' as const, name: 'Test', color: '#777777' },
  device: { id: 'oversize-device', name: 'Test' },
};
const TODAY = '2026-09-08';
const next = { date: TODAY, section: 'next' as const },
  done = { date: TODAY, section: 'done' as const };
type Preparation = 'reference' | 'local-snapshots' | 'account-text';
const preparations: Preparation[] = ['reference', 'local-snapshots', 'account-text'];
const selection = (anchor: number, head = anchor) => ({ ranges: [{ anchor, head }], main: 0 });
/** Text of about `bytes` UTF-8 bytes: single-byte letters, or a three-byte character. */
const sized = (bytes: number, wide: boolean) =>
  wide ? '語'.repeat(Math.round(bytes / 3)) : 'x'.repeat(bytes);

const open: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const w of open.splice(0)) await w.close().catch(() => {});
});
// Controlled admission carrier, as in doneForNow.test.ts: semantic controls, not crypto.
const fixture = async (
  preparation: Preparation,
  seed: Uint8Array[] = [],
  beforeBatch?: (n: number) => Promise<void> | void,
) => {
  const disk: Uint8Array[] = seed.map((b) => b.slice()),
    wal: Uint8Array[] = [];
  let batches = 0;
  const carrier = {
    state: 'active',
    signal: new AbortController().signal,
    ...(preparation === 'account-text'
      ? { captureLocal: (update: Uint8Array) => update.slice() }
      : {}),
    loadRecovery: async () => ({
      records: disk.map((bytes) => ({ kind: 'update', bytes: bytes.slice() })),
      journal: wal.map((bytes) => ({ bytes: bytes.slice() })),
    }),
    appendLocal(bytes: Uint8Array) {
      wal.push(bytes.slice());
      return { status: 'journalled' };
    },
    async appendBatch(records: { bytes: Uint8Array }[]) {
      await beforeBatch?.(++batches);
      disk.push(...records.map((r) => r.bytes.slice()));
      return {};
    },
    async flushJournal() {
      disk.push(...wal.splice(0));
      return { retained: 0 };
    },
    async close() {},
  } as unknown as JournalSession;
  const workspace = await createAdmittedWorkspace(
    (options) => createAdmissionOwner(carrier, options),
    {
      identity,
      today: () => TODAY,
      validateReceive: () => {},
      ...(preparation === 'account-text'
        ? { captureSources: true, suppressEmptySources: true }
        : {}),
    },
    preparation,
  );
  open.push(workspace);
  const emitted: Uint8Array<ArrayBuffer>[] = [];
  workspace.outgoing((b) => emitted.push(b.slice()));
  return { workspace, disk, wal, emitted };
};
/** Builds the starting document directly (no admission, no update limit), as an opened store's
 * records: large starting cards cost nothing to set up, and only the action under test is admitted. */
const seed = async (build: (h: Harness) => void) => {
  const h = await harness(TODAY);
  try {
    build(h);
    return [Y.encodeStateAsUpdate(h.store.doc)];
  } finally {
    h.destroy();
  }
};
const seededCard = (to: { date: string; section: 'next' | 'done' | 'scheduled' }, text: string) =>
  seed((h) => {
    composeDirect(h.me, to, text);
  });
const seededMaster = (text: string) =>
  seed((h) => {
    h.store.doc.getText('master').insert(0, text);
  });
const only = (w: AdmittedWorkspace) => {
  const cards = w.read().cards;
  expect(cards).toHaveLength(1);
  return cards[0]!.id;
};
/** Settles within a deadline; a blocked queue never settles, which is the failure this guards. */
const settle = async <T>(ticket: { accepted: Promise<T> }, ms = 10000) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      ticket.accepted,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error('Ticket did not settle')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const compose = async (w: AdmittedWorkspace, text: string, to = done) =>
  ((await settle(w.command({ kind: 'compose', to, text }))).value as { id: string }).id;
const cardText = (w: AdmittedWorkspace, id: string) =>
  w.read().cards.find((c) => c.id === id)?.text;
/** The accepted projection; actor order follows map iteration, which a fork may reorder. */
const view = (w: AdmittedWorkspace) => {
  const snapshot = w.read();
  return { ...snapshot, actors: [...snapshot.actors].sort((a, b) => a.id.localeCompare(b.id)) };
};
const active = (w: AdmittedWorkspace) => {
  expect(w.status.state).toBe('active');
  expect(w.status.pressure).toBeNull();
  expect(w.status.pendingItems).toBe(0);
};

// Just under and just over the 16 KiB update limit, then about 64 KiB and 200 KiB of text.
const UNDER = 15000;
const SIZES = [
  ['just under', 15000],
  ['just over', 16500],
  ['64 KiB', 65536],
  ['200 KiB', 204800],
] as const;
// Indenting costs about 18 bytes of update per line: 600 short lines fit, 1,000 do not.
const INDENT_SIZES = [
  ['just under', 6000],
  ['just over', 16500],
  ['64 KiB', 65536],
  ['200 KiB', 204800],
] as const;
type Arranged = { w: AdmittedWorkspace; act: () => { accepted: Promise<unknown> } };
type Case = {
  /** Opens a workspace in the starting state and returns the action under test. */
  arrange(preparation: Preparation, text: string): Promise<Arranged>;
  /** What the action leaves behind when it fits. */
  saved(w: AdmittedWorkspace, text: string, value: unknown): void;
  /** Sizes to try, and the largest text that fits one update (a plain long card unless set). */
  sizes: readonly (readonly [label: string, bytes: number])[];
  fits: number;
  text?: (bytes: number, wide: boolean) => string;
};
const cases: Record<string, Case> = {
  duplicate: {
    sizes: SIZES,
    fits: UNDER,
    arrange: async (preparation, text) => {
      const { workspace: w } = await fixture(preparation, await seededCard(done, text));
      const id = only(w);
      return { w, act: () => w.command({ kind: 'duplicate', id }) };
    },
    saved: (w, text, value) => {
      expect(value).toBe(true);
      expect(w.read().cards.filter((c) => c.text === text)).toHaveLength(2);
    },
  },
  'done-for-now': {
    sizes: SIZES,
    fits: UNDER,
    arrange: async (preparation, text) => {
      const { workspace: w } = await fixture(preparation, await seededCard(next, text));
      const id = only(w);
      return { w, act: () => w.command({ kind: 'done-for-now', id }) };
    },
    saved: (w, text, value) => {
      expect(typeof value).toBe('string');
      expect(cardText(w, value as string)).toBe(text);
    },
  },
  merge: {
    sizes: SIZES,
    fits: UNDER,
    arrange: async (preparation, text) => {
      const { workspace: w } = await fixture(
        preparation,
        await seed((h) => {
          composeDirect(h.me, done, text);
          composeDirect(h.me, done, 'head');
        }),
      );
      const id = w.read().cards.find((c) => c.text === text)!.id;
      return { w, act: () => w.command({ kind: 'merge', id }) };
    },
    saved: (w, text, value) => {
      expect(typeof value).toBe('number');
      expect(w.read().cards.map((c) => c.text)).toEqual(['head' + text]);
    },
  },
  split: {
    sizes: SIZES,
    fits: UNDER,
    arrange: async (preparation, text) => {
      const { workspace: w } = await fixture(preparation, await seededCard(done, '>' + text));
      const id = only(w);
      return { w, act: () => w.command({ kind: 'split', id, at: 1 }) };
    },
    saved: (w, text, value) => {
      expect(typeof value).toBe('string');
      expect(cardText(w, value as string)).toBe(text);
    },
  },
  'copy from Goals': {
    sizes: SIZES,
    fits: UNDER,
    arrange: async (preparation, text) => {
      const { workspace: w } = await fixture(preparation, await seededMaster(text));
      return { w, act: () => w.command({ kind: 'copy', to: next, lines: [text] }) };
    },
    saved: (w, text, value) => {
      expect(value).toBe(1);
      expect(w.read().cards.map((c) => c.text)).toEqual([text]);
    },
  },
  'move from Goals': {
    sizes: SIZES,
    fits: UNDER,
    arrange: async (preparation, text) => {
      const { workspace: w } = await fixture(preparation, await seededMaster(text));
      return {
        w,
        act: () => w.command({ kind: 'move-from-master', to: next, lines: [{ line: 0, text }] }),
      };
    },
    saved: (w, text, value) => {
      expect(value).toBe(1);
      expect(w.read().cards.map((c) => c.text)).toEqual([text]);
      expect(w.read().master).toBe('');
    },
  },
  'Next to Goals': {
    sizes: SIZES,
    fits: UNDER,
    arrange: async (preparation, text) => {
      const { workspace: w } = await fixture(preparation, await seededCard(next, text));
      return { w, act: () => w.command({ kind: 'bulk', from: TODAY, to: 'master' }) };
    },
    saved: (w, text, value) => {
      expect(value).toBe(1);
      expect(w.read().master).toContain(text);
      expect(w.read().cards).toEqual([]);
    },
  },
  'undo a removal': {
    sizes: SIZES,
    fits: UNDER,
    arrange: async (preparation, text) => {
      const { workspace: w } = await fixture(preparation, await seededCard(done, text));
      await settle(w.command({ kind: 'remove', id: only(w) }));
      expect(w.read().cards).toEqual([]);
      return { w, act: () => w.command({ kind: 'undo' }) };
    },
    saved: (w, text, value) => {
      expect(value).toBe(true);
      expect(w.read().cards.map((c) => c.text)).toEqual([text]);
    },
  },
  'redo a paste': {
    sizes: SIZES,
    fits: UNDER,
    arrange: async (preparation, text) => {
      const { workspace: w } = await fixture(preparation, await seededCard(done, '>'));
      const id = only(w);
      // A paste is admitted in slices and undone in one step; its Redo restores it at once.
      await settle(w.text({ kind: 'card', id }).input({ name: 'insert', text }, selection(1)));
      expect(cardText(w, id)).toBe('>' + text);
      await settle(w.command({ kind: 'undo' }));
      expect(cardText(w, id)).toBe('>');
      return { w, act: () => w.command({ kind: 'redo' }) };
    },
    saved: (w, text, value) => {
      expect(value).toBe(true);
      expect(w.read().cards.map((c) => c.text)).toEqual(['>' + text]);
    },
  },
  'indent many lines': {
    sizes: INDENT_SIZES,
    fits: 6000,
    text: (bytes, wide) =>
      Array.from({ length: Math.round(bytes / 10) }, () => (wide ? '語語語' : 'xxxxxxxxx')).join(
        '\n',
      ),
    arrange: async (preparation, text) => {
      const { workspace: w } = await fixture(preparation, await seededMaster(text));
      return {
        w,
        act: () => w.text({ kind: 'master' }).input({ name: 'indent' }, selection(0, text.length)),
      };
    },
    saved: (w, text, value) => {
      expect(value).toBe(true);
      expect(w.read().master).toBe(
        text
          .split('\n')
          .map((line) => '  ' + line)
          .join('\n'),
      );
    },
  },
};

describe.each(preparations)('%s preparation', (preparation) => {
  describe.each([
    ['single-byte', false],
    ['three-byte', true],
  ] as const)('%s text', (_label, wide) => {
    it.each(SIZES)(
      'compose %s saves whole, in one undo step, keeping its card result',
      async (_size, bytes) => {
        const { workspace: w } = await fixture(preparation);
        const text = sized(bytes, wide);
        await compose(w, 'before');
        const id = await compose(w, text);
        expect(cardText(w, id)).toBe(text);
        active(w);
        // One Undo removes the whole card, however many slices it took.
        await settle(w.command({ kind: 'undo' }));
        expect(w.read().cards.map((c) => c.text)).toEqual(['before']);
        active(w);
      },
      60000,
    );
    for (const [name, c] of Object.entries(cases))
      it.each(c.sizes)(
        `${name} %s saves when it fits and otherwise is refused alone`,
        async (_size, bytes) => {
          const text = (c.text ?? sized)(bytes, wide);
          const { w, act } = await c.arrange(preparation, text);
          active(w);
          const before = view(w);
          // Every case here settles in well under a second; a blocked queue never does.
          const result = (await settle(act(), 4000)) as { value: unknown };
          active(w);
          if (bytes <= c.fits) c.saved(w, text, result.value);
          else {
            expect(result.value).toBe(TOO_LARGE_FOR_ONE_ACTION);
            expect(view(w)).toEqual(before);
          }
          // The queue carries on.
          const after = await compose(w, 'after');
          expect(cardText(w, after)).toBe('after');
          active(w);
        },
        60000,
      );
  });
});

describe.each(preparations)('%s split compose', (preparation) => {
  it('splits only past the whole-card bound, and every slice fits one update', async () => {
    const { workspace: w, emitted } = await fixture(preparation);
    await compose(w, 'warm up');
    let at = emitted.length;
    await compose(w, 'w'.repeat(COMPOSE_WHOLE_BYTES));
    expect(emitted.length - at).toBe(1);
    at = emitted.length;
    const text = 'v'.repeat(COMPOSE_WHOLE_BYTES + 1);
    await compose(w, text);
    expect(emitted.length - at).toBe(Math.ceil(text.length / TEXT_SLICE_UNITS));
    for (const update of emitted) expect(update.length).toBeLessThanOrEqual(MAX_JOURNAL_UPDATE);
  });
  it('never ends a slice inside a surrogate pair; combining sequences arrive whole at the end', async () => {
    const { workspace: w } = await fixture(preparation);
    // An astral character straddles every 1000-unit boundary; combining marks and a ZWJ family follow.
    const unit = 'a'.repeat(999) + '😀';
    const text = unit.repeat(20) + 'é'.repeat(3000) + '👩‍👩‍👧‍👦'.repeat(500);
    const id = await compose(w, text);
    expect(cardText(w, id)).toBe(text);
  });
  it('another device receives the card whole and identical, slice by slice', async () => {
    const a = await fixture(preparation),
      b = await fixture(preparation);
    // Two devices that share a starting state; only the composed card travels below.
    await settle(b.workspace.receive(a.workspace.snapshot()));
    const from = a.emitted.length;
    const text = sized(64 * 1024, true);
    const id = await compose(a.workspace, text);
    const partial: (string | undefined)[] = [];
    for (const update of a.emitted.slice(from)) {
      await settle(b.workspace.receive(update));
      partial.push(cardText(b.workspace, id));
    }
    expect(cardText(b.workspace, id)).toBe(text);
    // While the slices arrive the other device sees the card grow from its first slice.
    const seen = partial.filter((t): t is string => t !== undefined);
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[0]!.length).toBeLessThanOrEqual(TEXT_SLICE_UNITS);
    for (const t of seen) expect(text.startsWith(t)).toBe(true);
    expect(view(b.workspace).cards).toEqual(view(a.workspace).cards);
  });
  it('Undo removes the whole split card in one step; Redo of more than one update is refused alone', async () => {
    const { workspace: w } = await fixture(preparation);
    const text = sized(64 * 1024, false);
    await compose(w, text);
    await settle(w.command({ kind: 'undo' }));
    expect(w.read().cards).toEqual([]);
    const redo = await settle(w.command({ kind: 'redo' }));
    expect(redo.value).toBe(TOO_LARGE_FOR_ONE_ACTION);
    expect(w.read().cards).toEqual([]);
    active(w);
    // A short card's Undo and Redo are unchanged.
    await compose(w, 'short');
    await settle(w.command({ kind: 'undo' }));
    expect((await settle(w.command({ kind: 'redo' }))).value).toBe(true);
    expect(w.read().cards.map((c) => c.text)).toEqual(['short']);
  });
  it('a crash between slices leaves the card with its saved slices; the rest is not kept', async () => {
    let armed = 0,
      release = () => {},
      reached = () => {};
    const stopped = new Promise<void>((y) => (reached = y));
    const f = await fixture(preparation, [], async () => {
      if (armed && ++armed === 4) {
        reached();
        await new Promise<void>((y) => (release = y));
      }
    });
    try {
      await compose(f.workspace, 'before');
      await f.workspace.whenDurable();
      const text = sized(32 * 1024, false);
      armed = 1;
      const ticket = f.workspace.command({ kind: 'compose', to: done, text });
      void ticket.accepted.catch(() => {});
      await stopped;
      // The page dies with the third slice's write in flight; reopen from what was durable.
      const reopened = await fixture(preparation, f.disk);
      const cards = reopened.workspace.read().cards;
      expect(cards.map((c) => c.text)).toContain('before');
      const partial = cards.find((c) => c.text !== 'before')!;
      expect(partial.text).toBe(text.slice(0, 2 * TEXT_SLICE_UNITS));
      active(reopened.workspace);
    } finally {
      release();
    }
  });
});

describe.each(preparations)('%s fragmented deletion', (preparation) => {
  it('deleting a heavily edited Goals text in one action is refused alone, on every text path', async () => {
    // Every other character of a 40,000-character text is already deleted, so deleting the
    // remaining 20,000 names 20,000 separate ranges: a small edit whose update is far over 16 KiB.
    // On account-text this is the direct text path's own check.
    const { workspace: w } = await fixture(
      preparation,
      await seed((h) => {
        const master = h.store.doc.getText('master');
        master.insert(0, 'x'.repeat(40000));
        h.store.doc.transact(() => {
          for (let i = 39999; i >= 0; i -= 2) master.delete(i, 1);
        });
      }),
    );
    const before = view(w);
    expect(before.master).toHaveLength(20000);
    const result = (await settle(
      w.text({ kind: 'master' }).input({ name: 'insert', text: '' }, selection(0, 20000)),
      4000,
    )) as unknown as { value: unknown };
    expect(result.value).toBe(TOO_LARGE_FOR_ONE_ACTION);
    expect(view(w)).toEqual(before);
    active(w);
    // A short deletion still saves.
    await settle(w.text({ kind: 'master' }).input({ name: 'insert', text: '' }, selection(0, 10)));
    expect(w.read().master).toHaveLength(19990);
  }, 30000);
});

describe.each(preparations)('%s one action ceiling', (preparation) => {
  it('refuses, before queueing, text over the paste bound or an input the queue could never hold', async () => {
    const { workspace: w } = await fixture(preparation);
    await compose(w, 'before');
    expect(() =>
      w.command({ kind: 'compose', to: done, text: 'x'.repeat(MAX_ACTION_TEXT_UNITS + 1) }),
    ).toThrow(ActionTooLarge);
    expect(() =>
      w
        .text({ kind: 'master' })
        .input({ name: 'insert', text: 'x'.repeat(MAX_ACTION_TEXT_UNITS + 1) }),
    ).toThrow(ActionTooLarge);
    // 700,000 three-byte characters is under the unit bound but over half the 4 MiB reservation.
    expect(() => w.command({ kind: 'compose', to: done, text: '語'.repeat(700000) })).toThrow(
      ActionTooLarge,
    );
    expect(w.read().cards.map((c) => c.text)).toEqual(['before']);
    active(w);
    expect(cardText(w, await compose(w, 'after'))).toBe('after');
  });
});

describe('a device already stuck on an oversized input', () => {
  it('keeps nothing of the stuck input across a reload; the updated build saves the same text', async () => {
    // Phase 547 left this queue state: an oversized prepared update blocked at the head as
    // slice-required, the input pending in memory. An adapter returning such an update rebuilds it.
    const disk: Uint8Array[] = [],
      wal: Uint8Array[] = [];
    const carrier = {
      state: 'active',
      signal: new AbortController().signal,
      loadRecovery: async () => ({
        records: disk.map((bytes) => ({ kind: 'update', bytes: bytes.slice() })),
        journal: wal.map((bytes) => ({ bytes: bytes.slice() })),
      }),
      appendLocal(bytes: Uint8Array) {
        wal.push(bytes.slice());
        return { status: 'journalled' };
      },
      async appendBatch(records: { bytes: Uint8Array }[]) {
        disk.push(...records.map((r) => r.bytes.slice()));
        return {};
      },
      async flushJournal() {
        disk.push(...wal.splice(0));
        return { retained: 0 };
      },
      async close() {},
    } as unknown as JournalSession;
    const text = sized(20 * 1024, false);
    const stuck = await createAdmissionOwner(carrier, {
      validateReceive: () => {},
      prepare: (draft) => {
        draft.getText('stuck').insert(0, text);
      },
    });
    const ticket = stuck.submit(new TextEncoder().encode(JSON.stringify({ text })));
    void ticket.accepted.catch(() => {});
    expect(stuck.status.state).toBe('blocked');
    expect(stuck.status.pressure?.code).toBe('slice-required');
    expect(stuck.status.pendingItems).toBe(1);
    // A reload closes the page's owner. The pending input was never written anywhere.
    await stuck.close();
    await expect(ticket.accepted).rejects.toThrow();
    expect(disk).toEqual([]);
    expect(wal).toEqual([]);
    // The updated build opens over the same storage, active, and saves the person's text.
    const { workspace: w } = await fixture('account-text', disk);
    active(w);
    expect(cardText(w, await compose(w, text))).toBe(text);
    active(w);
  });
});
