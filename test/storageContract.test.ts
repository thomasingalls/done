/**
 * SC-01..09 counterexamples and a bounded writer-lifetime model (2026-09-08).
 * Models and Yjs components only; production adapter/browser obligations are
 * enumerated separately in docs/storage-conformance.md. No custody or complete
 * GenerationApply implementation is exercised here.
 */
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

type Generation = 1 | 2;
type Page = {
  mode: 'new' | 'open' | 'frozen' | 'closed' | 'dead';
  generation: Generation | null;
  wrote: boolean;
};
type Carrier = { id: string; gen: Generation };
type State = {
  active: Generation;
  openers: Generation[];
  transition: 'idle' | 'queued' | 'exclusive' | 'covered' | 'activated' | 'retired' | 'finished';
  pages: Page[];
  journal: Carrier[];
  records: Carrier[];
  acknowledged: string[];
};

const initial = (): State => ({
  active: 1,
  // Assumption: a verified successor opener is already durable. This model
  // does not exercise authorization or the creation of that opener.
  openers: [1, 2],
  transition: 'idle',
  pages: [0, 1].map(() => ({ mode: 'new', generation: null, wrote: false })),
  journal: [],
  records: [],
  acknowledged: [],
});

const accessible = (s: State): Set<string> =>
  new Set([...s.journal, ...s.records].filter((r) => s.openers.includes(r.gen)).map((r) => r.id));

function successors(s: State, ignorePins: boolean): [string, State][] {
  const next: [string, State][] = [];
  const add = (label: string, change: (n: State) => void): void => {
    const n = structuredClone(s);
    change(n);
    for (const rows of [n.journal, n.records]) {
      rows.sort((a, b) => a.id.localeCompare(b.id) || a.gen - b.gen);
    }
    n.acknowledged.sort();
    next.push([label, n]);
  };
  const exclusive = ['exclusive', 'covered', 'activated', 'retired'].includes(s.transition);
  for (const [index, page] of s.pages.entries()) {
    const id = `edit${index}`;
    if (page.mode === 'new' && !exclusive && s.transition !== 'queued') {
      add(`page${index}:open-shared`, (n) => {
        n.pages[index]!.mode = 'open';
        n.pages[index]!.generation = n.active;
      });
    }
    if (page.mode === 'open') {
      add(`page${index}:freeze`, (n) => {
        n.pages[index]!.mode = 'frozen';
      });
      add(`page${index}:quiesce-release`, (n) => {
        n.pages[index]!.mode = 'closed';
        n.pages[index]!.generation = null;
      });
      if (!page.wrote && page.generation !== null) {
        const generation = page.generation;
        add(`page${index}:journal-and-ack`, (n) => {
          n.pages[index]!.wrote = true;
          n.journal.push({ id, gen: generation });
          n.acknowledged.push(id);
        });
      }
      const wal = s.journal.find((r) => r.id === id);
      // Successful final transaction only: reservation/encryption and delayed
      // continuations remain production conformance cases, not modeled phases.
      if (wal && wal.gen === s.active && !s.records.some((r) => r.id === id && r.gen === wal.gen)) {
        add(`page${index}:fenced-content-commit`, (n) => n.records.push({ ...wal }));
      }
      if (wal && s.records.some((r) => r.id === id && s.openers.includes(r.gen))) {
        add(`page${index}:clear-covered-wal`, (n) => {
          n.journal = n.journal.filter((r) => r.id !== id);
        });
      }
    }
    if (page.mode === 'frozen') {
      add(`page${index}:resume-cached-generation`, (n) => {
        n.pages[index]!.mode = 'open';
      });
    }
    if (page.mode === 'open' || page.mode === 'frozen') {
      add(`page${index}:death-releases-pin`, (n) => {
        n.pages[index]!.mode = 'dead';
        n.pages[index]!.generation = null;
      });
    }
  }
  if (s.transition === 'idle') {
    add('transition:request-exclusive', (n) => {
      n.transition = 'queued';
    });
  }
  const pins = s.pages.some((p) => p.mode === 'open' || p.mode === 'frozen');
  if (s.transition === 'queued' && (!pins || ignorePins)) {
    add('transition:acquire-exclusive', (n) => {
      n.transition = 'exclusive';
    });
  }
  if (s.transition === 'exclusive') {
    add('transition:commit-successor-coverage', (n) => {
      for (const id of accessible(n)) {
        if (!n.records.some((r) => r.id === id && r.gen === 2)) n.records.push({ id, gen: 2 });
      }
      n.transition = 'covered';
    });
  }
  if (s.transition === 'covered') {
    add('transition:activate-successor', (n) => {
      n.active = 2;
      n.transition = 'activated';
    });
  }
  if (s.transition === 'activated') {
    for (const carrier of ['journal', 'records'] as const) {
      for (const row of s[carrier].filter((r) => r.gen === 1)) {
        if (s.records.some((r) => r.id === row.id && r.gen === 2)) {
          add(`transition:remove-covered-${carrier}-${row.id}`, (n) => {
            n[carrier] = n[carrier].filter((r) => !(r.id === row.id && r.gen === 1));
          });
        }
      }
    }
    if (![...s.journal, ...s.records].some((r) => r.gen === 1)) {
      add('transition:retire-old-opener', (n) => {
        n.openers = [2];
        n.transition = 'retired';
      });
    }
  }
  if (s.transition === 'retired') {
    add('transition:release-exclusive', (n) => {
      n.transition = 'finished';
    });
  }
  return next;
}

// Two pages, one edit each, one transition. Coverage is operation identity,
// not CRDT bytes. No transition-actor restart, corruption, other reference
// classes or browser lock implementation is represented. Freeze retains a pin
// by assumption; actual supported-browser behavior must be tested separately.
function explore(ignorePins = false): { safe: boolean; states: number; trace?: string[] } {
  const queue: [State, string[]][] = [[initial(), []]];
  const seen = new Set<string>();
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const [s, trace] = queue[cursor]!;
    const key = JSON.stringify(s);
    if (seen.has(key)) continue;
    seen.add(key);
    const recoverable = accessible(s);
    if (!s.acknowledged.every((id) => recoverable.has(id))) {
      return { safe: false, states: seen.size, trace };
    }
    for (const [label, n] of successors(s, ignorePins)) {
      if (!seen.has(JSON.stringify(n))) queue.push([n, [...trace, label]]);
    }
  }
  return { safe: true, states: seen.size };
}

function replay(updates: Uint8Array[]): string {
  const doc = new Y.Doc();
  for (const update of updates) Y.applyUpdate(doc, update);
  const text = doc.getText('text').toString();
  doc.destroy();
  return text;
}

describe('corrected storage contract — bounded model/component evidence', () => {
  it('C04: preserves acknowledged carriers through all reachable pin-model schedules', () => {
    const result = explore();
    expect(result.safe, JSON.stringify(result.trace)).toBe(true);
    expect(result.states).toBeGreaterThan(1_000);
  });

  it('C04: ignoring writer pins reproduces a late journal after opener retirement', () => {
    const result = explore(true);
    expect(result.safe).toBe(false);
    expect(result.trace).toContain('transition:retire-old-opener');
    expect(result.trace?.at(-1)).toMatch(/journal-and-ack/u);
  });

  it('C01: only the durable remote basis makes dependent local insertion recover offline', () => {
    const sender = new Y.Doc();
    sender.getText('text').insert(0, 'R');
    const remote = Y.encodeStateAsUpdate(sender);
    const editing = new Y.Doc();
    const disk: Uint8Array[] = [];
    expect(editing.getText('text').toString()).toBe('');
    disk.push(remote); // simulated commit, before canonical application
    Y.applyUpdate(editing, remote);
    let local: Uint8Array = new Uint8Array();
    editing.on('update', (bytes: Uint8Array) => {
      local = bytes;
    });
    editing.getText('text').insert(1, 'L');
    expect(replay([local])).toBe('');
    expect(replay([local, ...disk])).toBe('RL');
    editing.destroy();
    sender.destroy();
  });

  it('C02: a deletion changes recovered semantics without changing the state vector', () => {
    const remote = new Y.Doc();
    remote.getText('text').insert(0, 'R');
    const base = Y.encodeStateAsUpdate(remote);
    const vector = Y.encodeStateVector(remote);
    let deletion: Uint8Array = new Uint8Array();
    remote.on('update', (bytes: Uint8Array) => {
      deletion = bytes;
    });
    remote.getText('text').delete(0, 1);
    expect(Y.encodeStateVector(remote)).toEqual(vector);
    const editing = new Y.Doc();
    Y.applyUpdate(editing, base);
    Y.applyUpdate(editing, deletion);
    let local: Uint8Array = new Uint8Array();
    editing.on('update', (bytes: Uint8Array) => {
      local = bytes;
    });
    editing.getText('text').insert(0, 'L');
    expect(replay([base, deletion, local])).toBe('L');
    expect(replay([base, local])).toBe('RL');
    editing.destroy();
    remote.destroy();
  });

  it('C07: unique sequence reservation does not make range deletion equal coverage', () => {
    const updates = ['A', 'B', 'C'].map((value) => {
      const doc = new Y.Doc();
      doc.getMap('items').set(value, value);
      const update = Y.encodeStateAsUpdate(doc);
      doc.destroy();
      return update;
    });
    const state = Y.mergeUpdates([updates[0]!, updates[2]!]);
    // 2 was reserved before state 4, but commits only after its snapshot.
    const disk = new Map([
      [1, updates[0]!],
      [3, updates[2]!],
      [4, state],
      [2, updates[1]!],
    ]);
    const recoveredKeys = (remove: (seq: number) => boolean): string[] => {
      const doc = new Y.Doc();
      for (const [seq, update] of disk) if (!remove(seq)) Y.applyUpdate(doc, update);
      const keys = [...doc.getMap('items').keys()].sort();
      doc.destroy();
      return keys;
    };
    expect(recoveredKeys((seq) => seq < 4)).toEqual(['A', 'C']);
    expect(recoveredKeys((seq) => new Set([1, 3]).has(seq))).toEqual(['A', 'B', 'C']);
  });

  it('C15: duplicated key/counter histories can exceed the aggregate invocation limit', () => {
    const ceiling = 2n ** 32n;
    const perClone = ceiling - 1n;
    expect(perClone < ceiling).toBe(true);
    expect(perClone + perClone >= ceiling).toBe(true);
    // Arithmetic counterexample only: no nonce collision or billions of seals.
  });

  it('C16: merging an empty Yjs replica does not erase a populated one', () => {
    const populated = new Y.Doc();
    const empty = new Y.Doc();
    populated.getText('text').insert(0, 'retained');
    Y.applyUpdate(populated, Y.encodeStateAsUpdate(empty));
    Y.applyUpdate(empty, Y.encodeStateAsUpdate(populated));
    expect(populated.getText('text').toString()).toBe('retained');
    expect(empty.getText('text').toString()).toBe('retained');
    populated.destroy();
    empty.destroy();
  });
});
