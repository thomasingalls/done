// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createAdmittedText } from '../src/editor/admittedText';
import { createAdmissionOwner } from '../src/crdt/admissionQueue';
import type { JournalSession } from '../src/crdt/custody';
import { createDoc, applyUpdate, encodeState } from '../src/crdt/yjs';
const selection = (anchor: number, head = anchor) => ({ ranges: [{ anchor, head }], main: 0 });
const until = async (condition: () => boolean) => {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw Error('Condition not reached');
};
const fixture = async (seed?: Uint8Array) => {
  let refuse = false,
    fail = false,
    release: (() => void) | undefined,
    gate: Promise<void> | undefined;
  const abort = new AbortController(),
    disk: Uint8Array[] = seed ? [seed] : [],
    wal: Uint8Array[] = [];
  const carrier = {
    state: 'active',
    signal: abort.signal,
    loadRecovery: async () => ({
      records: disk.map((bytes) => ({ kind: 'update', bytes: bytes.slice() })),
      journal: wal.map((bytes) => ({ bytes: bytes.slice() })),
    }),
    appendLocal(bytes: Uint8Array) {
      if (refuse) return { status: 'refused', reason: 'quota' };
      wal.push(bytes.slice());
      return { status: 'journalled' };
    },
    async appendBatch(records: { bytes: Uint8Array }[]) {
      await gate;
      if (fail) {
        fail = false;
        throw Error('disk fault');
      }
      disk.push(...records.map((r) => r.bytes.slice()));
      return {};
    },
    async flushJournal() {
      disk.push(...wal.splice(0));
      return { retained: 0 };
    },
    async close() {
      release?.();
    },
  } as unknown as JournalSession;
  const doc = await createAdmittedText(
    (options) => createAdmissionOwner(carrier, options),
    () => {},
  );
  const emitted: Uint8Array[] = [];
  doc.outgoing((b) => emitted.push(b));
  return {
    doc,
    disk,
    wal,
    emitted,
    refuse: () => {
      refuse = true;
    },
    fail: () => {
      fail = true;
    },
    pause: () => {
      gate = new Promise((r) => {
        release = r;
      });
    },
    resume: () => {
      release?.();
      gate = undefined;
    },
  };
};
const insert = (text: string) => ({ name: 'insert' as const, text });
describe('admitted Goals text', () => {
  it('handles a reentrant close observer once', async () => {
    const f = await fixture();
    let other: Promise<void> | undefined;
    f.doc.subscribe(() => {
      other = f.doc.close();
    });
    const close = f.doc.close();
    expect(other).toBe(close);
    await close;
  });
  it('maps history across remote replacement and preserves a detached read snapshot', async () => {
    const f = await fixture();
    try {
      f.doc.input(insert('ABCD'));
      const detached = f.doc.read();
      const remote = createDoc();
      applyUpdate(remote, f.emitted[0]!);
      let update!: Uint8Array;
      remote.on('update', (u) => {
        update = u;
      });
      remote.transact(() => {
        remote.getText('master').delete(1, 2);
        remote.getText('master').insert(1, 'remote');
      });
      await f.doc.receive(new Uint8Array(update)).accepted;
      expect(f.doc.read().text).toBe('AremoteD');
      expect(detached.text).toBe('ABCD');
      await f.doc.input({ name: 'undo' }).accepted;
      expect(f.doc.read().text).toBe('remote');
      remote.destroy();
    } finally {
      await f.doc.close();
    }
  });

  it('publishes a synchronous edit to text, export, history and outgoing bytes together', async () => {
    const f = await fixture();
    try {
      f.doc.input(insert('hello'));
      expect(f.doc.read().text).toBe('hello');
      expect(f.doc.read().undo).toBe(1);
      expect(f.doc.exportEntries()[0]?.content).toBe('hello');
      expect(f.emitted).toHaveLength(1);
      expect(f.wal).toHaveLength(1);
    } finally {
      await f.doc.close();
    }
  });
  it('keeps refused text, commands and undo private; queued typing follows the accepted caret', async () => {
    const f = await fixture();
    try {
      f.refuse();
      f.pause();
      const a = f.doc.input(insert('A')),
        b = f.doc.input(insert('B'));
      expect(f.doc.read().text).toBe('');
      expect(f.doc.read().undo).toBe(0);
      expect(f.emitted).toHaveLength(0);
      expect(f.doc.exportEntries()[0]?.content).toBe('');
      f.resume();
      await b.accepted;
      await a.accepted;
      expect(f.doc.read().text).toBe('AB');
      await f.doc.input({ name: 'undo' }).accepted;
      expect(f.doc.read().text).toBe('A');
      await f.doc.input({ name: 'redo' }).accepted;
      expect(f.doc.read().text).toBe('AB');
    } finally {
      await f.doc.close();
    }
  });
  it('retains a failed undo candidate until its forced retry commits', async () => {
    const f = await fixture();
    try {
      f.doc.input(insert('A'));
      f.refuse();
      f.fail();
      const ticket = f.doc.input({ name: 'undo' });
      await until(() => f.doc.status.state === 'blocked');
      expect(f.doc.read().text).toBe('A');
      expect(f.doc.read().undo).toBe(1);
      expect(f.doc.read().redo).toBe(0);
      f.doc.retry();
      await ticket.accepted;
      expect(f.doc.read().text).toBe('');
      expect(f.doc.read().redo).toBe(1);
    } finally {
      await f.doc.close();
    }
  });
  it('rebases history over remote inserts without undoing the remote writer', async () => {
    const f = await fixture();
    try {
      f.doc.input(insert('AB'));
      const remote = createDoc();
      applyUpdate(remote, f.emitted[0]!);
      let update!: Uint8Array;
      remote.on('update', (u) => {
        update = u;
      });
      remote.getText('master').insert(1, 'R');
      f.pause();
      const receive = f.doc.receive(new Uint8Array(update));
      const undo = f.doc.input({ name: 'undo' });
      expect(f.doc.read().text).toBe('AB');
      f.resume();
      await receive.accepted;
      await undo.accepted;
      expect(f.doc.read().text).toBe('R');
      expect(f.emitted).toHaveLength(2);
      remote.destroy();
    } finally {
      await f.doc.close();
    }
  });
  it('uses captured relative selections after a queued remote dependency', async () => {
    const f = await fixture();
    try {
      f.doc.input(insert('AB'));
      const remote = createDoc();
      applyUpdate(remote, f.emitted[0]!);
      let update!: Uint8Array;
      remote.on('update', (u) => {
        update = u;
      });
      remote.getText('master').insert(0, 'R');
      f.pause();
      f.doc.receive(new Uint8Array(update));
      const typed = f.doc.input(insert('X'), selection(1));
      f.resume();
      await typed.accepted;
      expect(f.doc.read().text).toBe('RAXB');
      remote.destroy();
    } finally {
      await f.doc.close();
    }
  });
  it('runs formatting and markdown list commands against accepted predecessor text', async () => {
    const f = await fixture();
    try {
      f.doc.input(insert('- one'));
      f.doc.input({ name: 'enter' });
      f.doc.input(insert('two'));
      expect(f.doc.read().text).toBe('- one\n- two');
      f.doc.input({ name: 'task' });
      expect(f.doc.read().text).toBe('- one\n- [ ] two');
      f.doc.input({ name: 'bold' }, selection(12, 15));
      expect(f.doc.read().text).toBe('- one\n- [ ] **two**');
    } finally {
      await f.doc.close();
    }
  });
  it('slices a Unicode paste and undoes the whole accepted paste', async () => {
    const f = await fixture();
    try {
      const source = '🙂'.repeat(1250);
      await f.doc.input(insert(source)).accepted;
      expect(f.doc.read().text).toBe(source);
      expect(f.doc.read().undo).toBe(1);
      expect(f.disk.length).toBe(3);
      await f.doc.input({ name: 'undo' }).accepted;
      expect(f.doc.read().text).toBe('');
    } finally {
      await f.doc.close();
    }
  });
  it('discards the failed suffix without changing accepted history', async () => {
    const f = await fixture();
    try {
      f.doc.input(insert('A'));
      f.refuse();
      f.fail();
      const b = f.doc.input(insert('B')),
        c = f.doc.input(insert('C'));
      await until(() => f.doc.status.state === 'blocked');
      f.doc.discardPending();
      await expect(b.accepted).rejects.toHaveProperty('code', 'discarded');
      await expect(c.accepted).rejects.toHaveProperty('code', 'discarded');
      expect(f.doc.read().text).toBe('A');
      expect(f.doc.read().undo).toBe(1);
      await f.doc.input(insert('D')).accepted;
      expect(f.doc.read().text).toBe('AD');
    } finally {
      await f.doc.close();
    }
  });
  it('recovers content without inventing runtime undo history', async () => {
    const seed = createDoc();
    seed.getText('master').insert(0, 'old');
    const f = await fixture(encodeState(seed));
    seed.destroy();
    try {
      expect(f.doc.read().text).toBe('old');
      expect(f.doc.read().undo).toBe(0);
    } finally {
      await f.doc.close();
    }
  });
  it('closes during a pending commit without late projection or outgoing text', async () => {
    const f = await fixture();
    f.refuse();
    f.pause();
    const ticket = f.doc.input(insert('lost'));
    const closing = f.doc.close();
    f.resume();
    await closing;
    await expect(ticket.accepted).rejects.toHaveProperty('code', 'inactive-session');
    expect(() => f.doc.exportEntries()).toThrow();
    expect(f.emitted).toHaveLength(0);
  });
  it('retains non-visible pending Yjs dependencies for later receive and export', async () => {
    const d = createDoc(),
      updates: Uint8Array[] = [];
    d.on('update', (u) => updates.push(u));
    d.getText('master').insert(0, 'AB');
    d.getText('master').delete(0, 1);
    const f = await fixture();
    try {
      await f.doc.receive(new Uint8Array(updates[1]!)).accepted;
      await f.doc.receive(new Uint8Array(updates[0]!)).accepted;
      expect(f.doc.read().text).toBe('B');
      expect(f.doc.exportEntries()[0]?.content).toBe('B');
    } finally {
      d.destroy();
      await f.doc.close();
    }
  });
  it('does not delete an entire grapheme when only later input was refused', async () => {
    const f = await fixture();
    try {
      f.doc.input(insert('x👩‍💻'));
      f.refuse();
      f.pause();
      const ticket = f.doc.input({ name: 'backspace' });
      expect(f.doc.read().text).toBe('x👩‍💻');
      f.resume();
      await ticket.accepted;
      expect(f.doc.read().text).toBe('x');
    } finally {
      await f.doc.close();
    }
  });
});

// Native shortcuts remain semantic intents: storage refusal never publishes speculative text.
describe('native shortcut admission', () => {
  it.each([
    ['deleteWordBackward', 'keep '],
    ['newline', 'keep word\n'],
    ['indent', '  keep word'],
  ] as const)(
    '%s waits for storage and retains one undoable accepted change',
    async (name, after) => {
      const f = await fixture();
      try {
        await f.doc.input(insert('keep word')).accepted;
        const outgoing = f.emitted.length;
        f.refuse();
        f.pause();
        const ticket = f.doc.input({ name });
        expect(f.doc.read().text).toBe('keep word');
        expect(f.emitted).toHaveLength(outgoing);
        f.resume();
        await ticket.accepted;
        expect(f.doc.read().text).toBe(after);
        expect(f.emitted).toHaveLength(outgoing + 1);
        await f.doc.input({ name: 'undo' }).accepted;
        expect(f.doc.read().text).toBe('keep word');
        await f.doc.input({ name: 'redo' }).accepted;
        expect(f.doc.read().text).toBe(after);
      } finally {
        await f.doc.close();
      }
    },
  );
});
