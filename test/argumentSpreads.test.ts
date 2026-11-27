// @vitest-environment node
/**
 * Phase 558: appending one array to another by spreading it as call arguments
 * (`target.push(...items)`) throws a RangeError once the array passes the engine's argument limit:
 * about 124,000 in this Node's main thread, 123,600 on a Chromium page, and 63,500 and 50,300 in a
 * Chromium and a WebKit dedicated Worker, where the Account content owner runs. Every case except
 * the two controls drives the real code path at ROWS, which is above the limit here (the first
 * control shows the old expressions throw at that size in this realm), and fails on the phase 557
 * source.
 */
import { readFileSync } from 'node:fs';
import { parseSync } from '@babel/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import type { EditorView, ViewUpdate, DecorationSet } from '@codemirror/view';
import { Tree } from '@lezer/common';
import { syntaxTree } from '@codemirror/language';
import { Y } from '../src/crdt/yjs';
import { createContentOwner, type ContentCrypto } from '../src/crdt/contentStore';
import { recordAAD, type OpenedRecord } from '../src/crdt/contentRecord';
import type { SessionTask } from '../src/crdt/writeSession';
import type { Bytes } from '../src/crdt/custodyCrypto';
import { createInboundCoverage } from '../src/crdt/inboundLedger';
import { parseCardList, serializeCardList } from '../src/crdt/serialize';
import { openLocalStore, storeHandle } from '../src/crdt/persistence';
import {
  gentleContextPlan,
  gentleContextView,
  gentleLineIsClear,
} from '../src/editor/gentleContext';
import { stateFor } from './helpers';

/** Above this realm's argument limit; the first case checks that it still is. */
const ROWS = 150_000;

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const f of cleanups.splice(0).reverse()) await f();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** ROWS distinct, causally ordered Yjs updates: one inserted character each, from one writer. */
let cachedUpdates: Bytes[] | undefined;
const realUpdates = (): Bytes[] => {
  if (cachedUpdates) return cachedUpdates;
  const source = new Y.Doc({ gc: false });
  const updates: Bytes[] = [];
  source.on('update', (update: Uint8Array) => updates.push(new Uint8Array(update)));
  const text = source.getText('t');
  for (let i = 0; i < ROWS; i++) text.insert(i, String.fromCharCode(97 + (i % 26)));
  source.destroy();
  cachedUpdates = updates;
  return updates;
};

describe('the old expressions throw at this size in this realm (control)', () => {
  it('push, unshift and Math.max with ROWS spread arguments throw a RangeError here', () => {
    const items = Array.from({ length: ROWS }, () => 1);
    expect(() => [].push(...(items as never[]))).toThrow(RangeError);
    expect(() => [].unshift(...(items as never[]))).toThrow(RangeError);
    expect(() => Math.max(0, ...items)).toThrow(RangeError);
  });
});

describe('the content owner opens and appends ROWS rows', () => {
  async function fixture() {
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('IDBKeyRange', IDBKeyRange);
    const scope = {
      slotId: 'spread',
      principalId: 'spread',
      workspaceId: 'spread',
      storeId: 'ab'.repeat(16),
      rootId: 'cd'.repeat(16),
    };
    const aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const hmac = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ]);
    const abort = new AbortController();
    const task: SessionTask = {
      signal: abort.signal,
      step: (f) => {
        if (abort.signal.aborted) throw Error('closed');
        return f();
      },
      wait: async (f) => {
        if (abort.signal.aborted) throw Error('closed');
        const v = await f();
        if (abort.signal.aborted) throw Error('closed');
        return v;
      },
    };
    let opens = 0;
    const crypt: ContentCrypto = {
      reuseOpened: true,
      warmLoads: true,
      // A load hands the validator its rows before it sorts what it returns, and every path
      // hands them over in sequence order; the Account validator reads them as given.
      validate: (rows) => {
        for (let i = 1; i < rows.length; i++)
          if (rows[i]!.seq <= rows[i - 1]!.seq)
            throw Error(`validate was handed row ${i} out of sequence order`);
      },
      sign: async (_t, b) => new Uint8Array(await crypto.subtle.sign('HMAC', hmac, b)),
      verify: (_t, b, m) => crypto.subtle.verify('HMAC', hmac, m, b),
      open: async (_t, r) => {
        opens++;
        return new Uint8Array(
          await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: r.nonce, additionalData: recordAAD(scope, r) },
            aes,
            r.ct,
          ),
        );
      },
      seal: async (_t, r, b) => {
        const nonce = crypto.getRandomValues(new Uint8Array(12));
        return {
          ...r,
          nonce,
          ct: new Uint8Array(
            await crypto.subtle.encrypt(
              { name: 'AES-GCM', iv: nonce, additionalData: recordAAD(scope, r) },
              aes,
              b,
            ),
          ),
        };
      },
    };
    const owner = createContentOwner(scope, 1, crypt);
    cleanups.push(() => owner.dispose());
    await owner.initialize(task, { checkCreation() {} });
    return { owner, task, opens: () => opens };
  }
  const row = (i: number) => {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, i);
    return bytes;
  };
  const expectRows = (rows: readonly OpenedRecord[], count: number) => {
    expect(rows).toHaveLength(count);
    for (let i = 0; i < count; i++) {
      const r = rows[i]!;
      if (r.kind !== 'update' || r.seq !== rows[0]!.seq + i || r.bytes.length !== 4)
        throw Error(`row ${i} is out of place`);
      if (new DataView(r.bytes.buffer, r.bytes.byteOffset).getUint32(0) !== i)
        throw Error(`row ${i} has the wrong bytes`);
    }
  };

  it('a full read after resume reuses the opened view of ROWS rows (contentStore openSnapshot)', async () => {
    const f = await fixture();
    // History grows the way a device's does, in many small appends, each far below the limit.
    for (let from = 0; from < ROWS; from += 25_000)
      await f.owner.append(
        f.task,
        Array.from({ length: Math.min(25_000, ROWS - from) }, (_, k) => ({
          kind: 'update' as const,
          bytes: row(from + k),
        })),
      );
    expectRows(await f.owner.load(f.task), ROWS);
    // Return to the app: the next load is a complete physical read that reuses opened rows.
    f.owner.invalidateWarm();
    const before = f.opens();
    const reread = await f.owner.load(f.task);
    expect(f.opens()).toBe(before);
    expectRows(reread, ROWS);
    // The reused rows are copies: erasing what the caller got leaves the view intact.
    for (const r of reread) r.bytes.fill(0);
    f.owner.invalidateWarm();
    expectRows(await f.owner.load(f.task), ROWS);
  }, 120_000);

  it('one append of ROWS rows extends the warm view (contentStore appendRecords)', async () => {
    // No caller appends more than MAX_BATCH_RECORDS (256) rows at once today, but append() does
    // not check that itself. The warm view already holds rows, so the batch must land after them.
    // The warm load reads the opened rows; the last full read reuses the view only if every
    // sealed row was added to it in the same places, so it checks the sealed rows.
    const held = 3;
    const f = await fixture();
    await f.owner.append(
      f.task,
      Array.from({ length: held }, (_, i) => ({ kind: 'update' as const, bytes: row(i) })),
    );
    expectRows(await f.owner.load(f.task), held);
    const receipt = await f.owner.append(
      f.task,
      Array.from({ length: ROWS }, (_, i) => ({ kind: 'update' as const, bytes: row(held + i) })),
    );
    expect(receipt.sequences).toHaveLength(ROWS);
    const before = f.opens();
    expectRows(await f.owner.load(f.task), held + ROWS);
    f.owner.invalidateWarm();
    expectRows(await f.owner.load(f.task), held + ROWS);
    expect(f.opens()).toBe(before);
  }, 120_000);
});

describe('the receive owner appends ROWS content rows to its coverage view', () => {
  it('an incremental prepare appends every new row in order (inboundLedger prepare)', () => {
    const updates = realUpdates();
    // The caller's rows are its own copies, so erasing them below leaves the shared updates intact.
    const rowsOf = (): OpenedRecord[] =>
      updates.map((bytes, i) => ({ kind: 'update', gen: 1, seq: i + 1, bytes: bytes.slice() }));
    const records = rowsOf();
    const coverage = createInboundCoverage({ incremental: true });
    cleanups.push(() => coverage.clear());
    expect(coverage.prepare(records.slice(0, 1))).toBe('rebuild');
    expect(coverage.prepare(records)).toBe('append');
    // The cached rows are the same rows in the same order, after the one cached before...
    expect(coverage.prepare(records)).toBe('same');
    // ...held as the view's own copies: the caller erasing its rows, as owners do after use,
    // leaves the cache equal to the same rows read again...
    for (const r of records) r.bytes.fill(0);
    const again = rowsOf();
    expect(coverage.prepare(again)).toBe('same');
    // ...and the coverage document holds every one of them: the whole state is covered, and one
    // more character is not. (A refusal clears the view, so it comes last.)
    const whole = new Y.Doc({ gc: false });
    for (const update of updates) Y.applyUpdate(whole, update);
    const state = new Uint8Array(Y.encodeStateAsUpdate(whole));
    whole.getText('t').insert(0, 'z');
    const extra = new Uint8Array(Y.encodeStateAsUpdate(whole));
    whole.destroy();
    expect(() => coverage.check(again, [state])).not.toThrow();
    expect(() => coverage.check(again, [extra])).toThrow('Inbound content coverage is missing');
  }, 120_000);
});

describe('export writes a card of ROWS lines', () => {
  it('serializes and parses back a card with ROWS lines (serialize collectionLines)', () => {
    const body = Array.from({ length: ROWS }, (_, i) => (i % 7 === 3 ? '' : `line ${i}`)).join(
      '\n',
    );
    const text = serializeCardList(['first', body, 'last']);
    expect(text.split('\n')).toHaveLength(1 + 1 + ROWS + 1 + 1);
    expect(parseCardList(text)).toEqual(['first', body, 'last']);
  });
});

describe('local persistence puts a failed batch of ROWS updates back in order', () => {
  /** A standards-shaped Storage whose key(index) does not copy every key on each call. */
  const fastStorage = () => {
    const entries = new Map<string, string>();
    let keys: string[] | undefined;
    return {
      entries,
      storage: {
        get length() {
          return entries.size;
        },
        clear: () => {
          entries.clear();
          keys = undefined;
        },
        getItem: (key: string) => entries.get(key) ?? null,
        key: (index: number) => (keys ??= [...entries.keys()])[index] ?? null,
        removeItem: (key: string) => {
          if (entries.delete(key)) keys = undefined;
        },
        setItem: (key: string, value: string) => {
          if (!entries.has(key)) keys = undefined;
          entries.set(key, value);
        },
      } satisfies Storage,
    };
  };

  it('a failed flush of ROWS recovered updates is retried whole (persistence startFlush)', async () => {
    const updates = realUpdates();
    const handle = storeHandle('done-test-argument-spread');
    const { entries, storage } = fastStorage();
    // A crash journal of ROWS entries, as a device leaves after edits IndexedDB never committed.
    for (const [i, update] of updates.entries())
      storage.setItem(
        `${handle.journalPrefix}crashed.${i}`,
        `1:${Buffer.from(update).toString('base64')}`,
      );
    vi.stubGlobal('localStorage', storage);
    // Hold the open's 250 ms flush timer, so the first flush is the one awaited below. (On the
    // phase 557 source a flush the timer started would empty the queue, and the next
    // whenDurable would then loop on microtasks for ever.)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    cleanups.push(() => void vi.useRealTimers());
    const errors: Error[] = [];
    const doc = new Y.Doc();
    const local = openLocalStore(doc, handle, { onPersistenceError: (e) => errors.push(e) });
    cleanups.push(() => {
      local.destroy();
      doc.destroy();
    });
    await local.whenSynced;
    expect(doc.getText('t').length).toBe(ROWS);
    // The first flush takes its batch of ROWS updates and then cannot open its transaction, as
    // when the connection is closing. Between the two, two edits arrive and are queued behind it.
    // (y-indexeddb names its stores in an array and keeps its own transactions; this adapter's
    // flush names the one store.)
    const closing = new DOMException('The database connection is closing.', 'InvalidStateError');
    const transaction = IDBDatabase.prototype.transaction;
    const live: Uint8Array[] = [];
    const capture = (update: Uint8Array) => live.push(update.slice());
    let refused = 0;
    const refuse = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
      this: IDBDatabase,
      ...args: Parameters<IDBDatabase['transaction']>
    ) {
      if (Array.isArray(args[0])) return Reflect.apply(transaction, this, args) as IDBTransaction;
      if (refused++ === 0) {
        doc.on('update', capture);
        doc.getText('t').insert(ROWS, '!');
        doc.getText('t').insert(ROWS + 1, '?');
        doc.off('update', capture);
      }
      throw closing;
    });
    cleanups.push(() => refuse.mockRestore());
    await expect(local.whenDurable()).rejects.toBe(closing);
    expect(errors).toEqual([closing]);
    expect(live).toHaveLength(2);
    expect(entries.size).toBe(ROWS + 2);
    refuse.mockRestore();
    expect(IDBDatabase.prototype.transaction).toBe(transaction);
    // The retry hands IndexedDB the failed batch first, whole and in journal order, then the two
    // edits that arrived meanwhile, in their order, and only then clears the journal. Each add is
    // checked as it is made, so a wrong order fails the retry itself instead of leaving
    // whenDurable waiting on a sequence that was written early. The adds are recorded, not
    // stored: fake IndexedDB takes about 15 s to store ROWS rows, and storing them is the
    // unchanged path test/store.test.ts covers.
    const expected = [...updates, ...live];
    const written: Uint8Array[] = [];
    const record = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
    ) {
      const at = written.push(value as Uint8Array) - 1;
      if (at >= expected.length || Buffer.compare(written[at]!, expected[at]!) !== 0)
        throw Error(`update ${at} was written out of order`);
      return undefined as unknown as IDBRequest<IDBValidKey>;
    });
    cleanups.push(() => record.mockRestore());
    // The batch must also be whole when the flush commits it, so a missing entry fails the retry
    // too, rather than leave whenDurable waiting on a sequence that was never written.
    const commit = IDBTransaction.prototype.commit;
    const whole = vi
      .spyOn(IDBTransaction.prototype, 'commit')
      .mockImplementation(function (this: IDBTransaction) {
        if (written.length !== expected.length)
          throw Error(`${written.length} of ${expected.length} updates were written`);
        commit.call(this);
      });
    cleanups.push(() => whole.mockRestore());
    await expect(local.whenDurable()).resolves.toBeUndefined();
    whole.mockRestore();
    record.mockRestore();
    expect(written).toHaveLength(ROWS + 2);
    expect(entries.size).toBe(0);
    expect(errors).toEqual([closing]);
  }, 120_000);
});

describe('gentle context measures ROWS visible ranges', () => {
  it('dims the same lines as a fresh projection (gentleContext write)', () => {
    // Printing makes CodeMirror measure the whole document, one visible range per span between
    // hidden spans of 20 or more characters. The plugin runs here against a fixed-geometry view
    // as in gentleContextIncremental.test.ts. 'x' is the long line the ranges cut.
    const filler = 'x'.repeat(ROWS);
    const text = `# Work\n${filler}\n## Site\nsite note\n### Launch\ncurrent task\nchild note\n# Home\nhome note`;
    // stateFor finishes the parse; one empty transaction then gives the state that complete tree,
    // as a running editor's state has once its parser is done (so a measurement's own effect
    // does not swap the tree and empty the plugin's plan cache).
    const state = stateFor(text, text.indexOf('current task') + 3).update({}).state;
    expect(syntaxTree(state).length).toBe(text.length);
    const head = state.selection.main.head;
    const measure = (visibleRanges: { from: number; to: number }[]) => {
      const reads: NonNullable<Parameters<EditorView['requestMeasure']>[0]>[] = [];
      const microtasks: (() => void)[] = [];
      const bounds = { top: 0, bottom: 1000, left: 0, right: 1000, width: 1000, height: 1000 };
      const view = {
        state,
        visibleRanges,
        dom: {
          ownerDocument: {
            defaultView: {
              visualViewport: null,
              innerHeight: 1000,
              innerWidth: 1000,
              queueMicrotask: (run: () => void) => microtasks.push(run),
            },
          },
          getBoundingClientRect: () => bounds,
        },
        scrollDOM: { getBoundingClientRect: () => bounds },
        coordsAtPos: () => ({ top: 50, bottom: 70, left: 20, right: 21 }),
        requestMeasure: (request: NonNullable<Parameters<EditorView['requestMeasure']>[0]>) =>
          reads.push(request),
        dispatch: (spec: { effects: unknown }) => {
          const startState = view.state;
          const transaction = startState.update(spec as never);
          view.state = transaction.state;
          plugin.update({
            view,
            state: view.state,
            startState,
            changes: transaction.changes,
            transactions: [transaction],
            docChanged: transaction.docChanged,
            selectionSet: transaction.selection !== undefined,
            viewportChanged: false,
            geometryChanged: false,
          } as unknown as ViewUpdate);
        },
      };
      const plugin = (
        gentleContextView() as unknown as {
          create: (view: EditorView) => {
            decorations: DecorationSet;
            update: (update: ViewUpdate) => void;
            schedule: (view: EditorView) => void;
            destroy: () => void;
          };
        }
      ).create(view as unknown as EditorView);
      cleanups.push(() => plugin.destroy());
      const flush = () => {
        for (let rounds = 0; reads.length || microtasks.length; rounds++) {
          if (rounds > 20) throw Error('Context measurement did not settle');
          for (const request of reads.splice(0))
            request.write!(
              request.read!(view as unknown as EditorView),
              view as unknown as EditorView,
            );
          for (const run of microtasks.splice(0)) run();
        }
      };
      flush();
      const dimmed: number[] = [];
      for (let cursor = plugin.decorations.iter(); cursor.value; cursor.next())
        dimmed.push(cursor.from);
      return {
        dimmed,
        /** Measures the unchanged view again; true when it computed a new plan. */
        replanned: () => {
          const lookup = vi.spyOn(Tree.prototype, 'resolveInner');
          try {
            plugin.schedule(view as unknown as EditorView);
            flush();
            return lookup.mock.calls.length > 0;
          } finally {
            lookup.mockRestore();
          }
        },
      };
    };
    const plan = gentleContextPlan(state)!;
    const expected = Array.from({ length: state.doc.lines }, (_, i) => state.doc.line(i + 1))
      .filter((line) => !gentleLineIsClear(state, line.from, line.to, plan))
      .map((line) => line.from);
    expect(expected).toContain(7);
    expect(expected).not.toContain(text.indexOf('child note'));

    // ROWS ranges over the whole document: the line after the caret stays clear only if the
    // section is found through the largest visible end.
    const whole = measure(
      Array.from({ length: ROWS }, (_, i) => ({
        from: i === 0 ? 0 : 7 + i,
        to: i === ROWS - 1 ? text.length : 8 + i,
      })),
    );
    expect(whole.dimmed).toEqual(expected);

    // ROWS ranges that all end before the caret, in the long line. The decorations cannot show
    // whether the caret was in the fold, because gentleContextPlan itself plans through
    // max(head, through). What does show it is the plugin's cache: a plan is reused while the
    // caret stays inside the span it was computed through, and that span ends at through + 1. So
    // the unchanged view measured again reuses its plan only if the fold included the caret.
    const before = Array.from({ length: ROWS }, (_, i) => ({
      from: i === 0 ? 0 : 7 + i,
      to: 8 + i,
    }));
    expect(before.at(-1)!.to).toBeLessThan(head);
    const early = measure(before);
    expect(early.dimmed).toEqual(expected.filter((from) => from <= before.at(-1)!.to));
    expect(early.dimmed).toEqual([0, 7]);
    expect(early.replanned(), 'the plan was not computed through the caret').toBe(false);
  }, 120_000);
});

describe('no argument spread returns at the sites phase 558 changed (guard)', () => {
  /** Every call or construction in a file that spreads an argument, as `callee(...operand)`, and
   * every `f.apply(thisArg, args)` or `Reflect.apply(f, thisArg, args)`, as written. */
  const argumentSpreads = (
    path: string,
    text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'),
  ): string[] => {
    const file = parseSync(text, {
      filename: path,
      configFile: false,
      babelrc: false,
      parserOpts: { plugins: path.endsWith('x') ? ['typescript', 'jsx'] : ['typescript'] },
    })!;
    const found: string[] = [];
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const n = node as {
        type?: string;
        start: number;
        end: number;
        callee?: { start: number; end: number };
        arguments?: unknown[];
      };
      if (
        (n.type === 'CallExpression' ||
          n.type === 'NewExpression' ||
          n.type === 'OptionalCallExpression') &&
        n.arguments
      ) {
        if (/\.apply$/.test(text.slice(n.callee!.start, n.callee!.end)) && n.arguments.length >= 2)
          found.push(text.slice(n.start, n.end).replace(/\s+/g, ' '));
        for (const a of n.arguments as { type: string; argument: { start: number; end: number } }[])
          if (a.type === 'SpreadElement')
            found.push(
              `${text.slice(n.callee!.start, n.callee!.end)}(...${text.slice(a.argument.start, a.argument.end)})`.replace(
                /\s+/g,
                ' ',
              ),
            );
      }
      for (const [key, value] of Object.entries(node))
        if (key !== 'loc' && !key.endsWith('Comments'))
          if (Array.isArray(value)) value.forEach(visit);
          else visit(value);
    };
    visit(file.program);
    return found;
  };

  it('finds the old expressions (control)', () => {
    expect(
      argumentSpreads(
        'old.ts',
        [
          'opened.push(...copyRecords(openedView!.opened));',
          'openedView!.sealed.push(...added);',
          'rows.push(...added);',
          'out.push(...encodeCard(body));',
          'pending.unshift(...batch);',
          'Math.max(head, ...ranges.map((range) => range.to));',
          'f(...args);',
          'Array.prototype.push.apply(rows, added);',
          'Reflect.apply(Math.max, null, ends);',
          'g([...a, ...b], { ...c });',
          'queue.apply();',
        ].join('\n'),
      ),
    ).toEqual([
      'opened.push(...copyRecords(openedView!.opened))',
      'openedView!.sealed.push(...added)',
      'rows.push(...added)',
      'out.push(...encodeCard(body))',
      'pending.unshift(...batch)',
      'Math.max(...ranges.map((range) => range.to))',
      'f(...args)',
      'Array.prototype.push.apply(rows, added)',
      'Reflect.apply(Math.max, null, ends)',
    ]);
  });

  it('the five changed files spread arguments only where the call has a fixed parameter list', () => {
    expect(
      Object.fromEntries(
        [
          'src/crdt/contentStore.ts',
          'src/crdt/inboundLedger.ts',
          'src/crdt/serialize.ts',
          'src/crdt/persistence.ts',
          'src/editor/gentleContext.ts',
        ].map((path) => [path, argumentSpreads(path)]),
      ),
    ).toEqual({
      'src/crdt/contentStore.ts': [],
      // inspectInbound forwards its own fixed parameters (Parameters<typeof inspectInboundSteps>).
      'src/crdt/inboundLedger.ts': ['inspectInboundSteps(...args)'],
      'src/crdt/serialize.ts': [],
      'src/crdt/persistence.ts': [],
      'src/editor/gentleContext.ts': [],
    });
  });
});
