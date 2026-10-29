// @vitest-environment node
/** Controlled channel/real Window admission tests, not Account authentication or native lock proof. */
import { afterEach, expect, it } from 'vitest';
import { fixture, cleanupMirrorFixtures, route } from './fixtures/accountMirror';
import { createWorkerWorkspaceQueues } from '../src/crdt/workerWorkspaceQueues';
import { createWindowWorkspaceQueues } from '../src/crdt/windowWorkspaceQueues';
import { createWorkerChannel } from '../src/crdt/workerChannel';
import { createAcknowledgedReceiveFinish } from '../src/crdt/acknowledgedReceive';
import type { PreparedReceiveFinish } from '../src/crdt/admissionQueue';
import type { AccountMirrorContext } from '../src/crdt/accountMirrorMaterial';
import type { SessionTask } from '../src/crdt/writeSession';
import { decodeSourceCapsule, eraseCapsule } from '../src/crdt/sourceCapture';
import { createDoc, applyUpdate } from '../src/crdt/yjs';
import { eraseJournalSnapshot } from '../src/crdt/journalStore';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const stop of cleanup.splice(0)) await stop();
  await cleanupMirrorFixtures();
});
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const turn = () => new Promise<void>((r) => setTimeout(r, 0));
const sel = (at = 0) => ({ ranges: [{ anchor: at, head: at }], main: 0 });
async function connected() {
  const f = await fixture(),
    controller = await f.openController();
  await controller.workspace.whenDurable();
  await turn();
  const events: string[] = [],
    pair = new MessageChannel();
  let queues!: ReturnType<typeof createWorkerWorkspaceQueues>,
    windowQueues!: ReturnType<typeof createWindowWorkspaceQueues>;
  let native = false,
    pending = 0,
    failed = 0,
    dropApply = false,
    ackHold: ReturnType<typeof gate> | undefined,
    ackEntered: ReturnType<typeof gate> | undefined;
  const current = () => {
    f.cohort.write(() => {});
  };
  const task: SessionTask = {
    signal: f.cohort.signal,
    step: (effect) => {
      current();
      return effect();
    },
    wait: async (start) => {
      current();
      const result = await start();
      current();
      return result;
    },
  };
  const finish = () => {
    pending++;
    const acknowledged = createAcknowledgedReceiveFinish<AccountMirrorContext>(
      async (work) => {
        expect(native).toBe(false);
        native = true;
        events.push('native-check');
        try {
          await work(task, async () => {
            const { incarnation: _, ...context } = f.opening();
            return context;
          });
        } finally {
          native = false;
          events.push('native-release');
        }
      },
      async () => {
        current();
      },
      current,
      () => {
        pending--;
        events.push('acknowledged');
      },
      () => {
        failed++;
      },
      { dispose: (c) => c.key.fill(0) },
    );
    const result: PreparedReceiveFinish = async (apply) => apply();
    result.acknowledged = async (apply) => {
      if (ackHold) {
        ackEntered!.resolve();
        await ackHold.promise;
      }
      return acknowledged(apply);
    };
    result.acknowledgedWithContext = acknowledged.withContext;
    return result;
  };
  const windowChannel = createWorkerChannel(
    pair.port1,
    f.cohort.ticket.incarnation,
    {
      workspacePrepare: (input) => {
        events.push('window-prepare');
        expect(native).toBe(false);
        return windowQueues.workspacePrepare(input);
      },
      workspaceApply: (input) => {
        events.push('window-apply');
        expect(native).toBe(true);
        if (dropApply) throw Error('lost Window reply');
        return windowQueues.workspaceApply(input);
      },
      workspaceFence: (input) => windowQueues.workspaceFence(input),
      workspaceContext: (input) => {
        events.push('window-context');
        expect(native).toBe(true);
        return windowQueues.workspaceContext(input);
      },
    },
    () => {},
  );
  const workerChannel = createWorkerChannel(
    pair.port2,
    f.cohort.ticket.incarnation,
    {
      workspaceFrames: (input) => queues.methods.workspaceFrames(input),
      workspaceFinish: (input) => queues.methods.workspaceFinish(input),
      workspaceCommit: (input) => queues.methods.workspaceCommit(input),
    },
    () => {},
  );
  queues = createWorkerWorkspaceQueues({
    channel: workerChannel,
    signal: f.cohort.signal,
    live: current,
    failed: () => {
      failed++;
      void f.cohort.close().catch(() => {});
    },
    incarnation: f.cohort.ticket.incarnation,
    preparedPromotion: finish,
    withFence: async (_id, work) => {
      events.push('worker-fence');
      return work();
    },
  });
  windowQueues = createWindowWorkspaceQueues(controller, f.cohort, windowChannel);
  cleanup.push(async () => {
    windowChannel.close();
    workerChannel.close();
    await queues.close();
  });
  return {
    ...f,
    controller,
    queues,
    finish,
    windowQueues,
    windowChannel,
    workerChannel,
    events,
    pending: () => pending,
    failed: () => failed,
    native: () => native,
    drop: () => (dropApply = true),
    hold: () => {
      ackHold = gate();
      ackEntered = gate();
      return { entered: ackEntered.promise, release: ackHold.resolve };
    },
  };
}
it('settles preparation before Window FIFO and awaits the real final native check and acknowledgment', async () => {
  const f = await connected(),
    hold = f.hold();
  let finished = false;
  const operation = f.queues
    .prepare(Uint8Array.of(7), async (bytes, stage) => {
      expect([...bytes]).toEqual([7]);
      f.events.push('prepared');
      stage([], f.finish());
      return { kind: 'received' };
    })
    .then((v) => {
      finished = true;
      return v;
    });
  await hold.entered;
  expect(f.events).toEqual(['prepared', 'window-prepare']);
  expect(finished).toBe(false);
  expect(f.pending()).toBe(1);
  hold.release();
  expect(await operation).toEqual({ kind: 'received' });
  expect(f.events).toEqual([
    'prepared',
    'window-prepare',
    'native-check',
    'window-apply',
    'acknowledged',
    'native-release',
  ]);
  expect(f.pending()).toBe(0);
  expect(f.native()).toBe(false);
  await expect(f.queues.methods.workspaceFinish({ id: 1 })).rejects.toThrow();
});
it('holds the actual Window journal head through context rebinding and queues input for the new route', async () => {
  const f = await connected(),
    entered = gate(),
    release = gate();
  const work = f.queues.enqueue(Uint8Array.of(1), async (_bytes, promote) => {
    entered.resolve();
    await release.promise;
    f.moveWorkerContext(2);
    promote([]);
    return 'changed';
  });
  await entered.promise;
  const field = f.controller.workspace.text({ kind: 'master' }),
    ticket = field.input({ name: 'insert', text: 'after context' }, sel());
  expect(field.read().text).toBe('');
  release.resolve();
  expect(await work).toBe('changed');
  await ticket.accepted;
  expect(field.read().text).toBe('after context');
  expect(f.events).toEqual([
    'worker-fence',
    'native-check',
    'window-context',
    'acknowledged',
    'native-release',
  ]);
  const journal = f.workerJournal.snapshot();
  try {
    expect(journal.length).toBeGreaterThan(0);
    for (const entry of journal) {
      const capsule = decodeSourceCapsule(entry.bytes, { ...route, epoch: 2 });
      expect(capsule.epoch).toBe(2);
      eraseCapsule(capsule);
    }
  } finally {
    eraseJournalSnapshot(journal);
  }
  await f.controller.workspace.command({ kind: 'undo' }).accepted;
  expect(field.read().text).toBe('');
});
it('a lost Window apply reply preserves the pending native promotion and retires the root', async () => {
  const f = await connected();
  f.drop();
  await expect(
    f.queues.prepare(Uint8Array.of(1), async (_bytes, stage) => {
      stage([], f.finish());
      return true;
    }),
  ).rejects.toThrow();
  expect(f.pending()).toBe(1);
  expect(f.failed()).toBeGreaterThan(0);
  expect(f.cohort.signal.aborted).toBe(true);
});
it('omitted and duplicated staged handoffs cannot report success', async () => {
  const f = await connected();
  await expect(f.queues.prepare(Uint8Array.of(1), async () => true)).rejects.toThrow('handoff');
  expect(f.cohort.signal.aborted).toBe(true);
});
it('a fenced mutation without its synchronous ordered handoff fails closed', async () => {
  const f = await connected();
  await expect(f.queues.enqueue(Uint8Array.of(1), async () => true)).rejects.toThrow();
  expect(f.cohort.signal.aborted).toBe(true);
  expect(f.events).toEqual(['worker-fence']);
});
it('only one outstanding operation owns its captured input, and late callers cannot mutate that copy', async () => {
  const f = await connected(),
    entered = gate(),
    release = gate(),
    input = Uint8Array.of(4, 8);
  let owned: Uint8Array | undefined;
  const work = f.queues.prepare(input, async (bytes, stage) => {
    owned = bytes;
    entered.resolve();
    await release.promise;
    expect([...bytes]).toEqual([4, 8]);
    stage([], f.finish());
    return 5;
  });
  input.fill(0);
  await entered.promise;
  expect(() => f.queues.enqueue(Uint8Array.of(1), async () => {})).toThrow('handoff');
  expect(() => f.queues.methods.workspaceFrames({ id: 2 })).toThrow('handoff');
  release.resolve();
  expect(await work).toBe(5);
  expect([...owned!]).toEqual([0, 0]);
});
it('replayed and malformed Window commands do not create a reservation or read accessors', async () => {
  const f = await connected();
  let touched = false;
  await expect(
    f.windowQueues.workspaceFence({
      get id() {
        touched = true;
        return 1;
      },
    }),
  ).rejects.toThrow();
  expect(touched).toBe(false);
  await expect(f.windowQueues.workspaceFence({ id: 2 })).rejects.toThrow();
  expect(f.events).toEqual([]);
  expect(f.cohort.state).toBe('active');
  await f.queues.enqueue(Uint8Array.of(1), async (_b, promote) => {
    promote([]);
    return true;
  });
  await expect(f.windowQueues.workspaceFence({ id: 1 })).rejects.toThrow();
  expect(f.cohort.state).toBe('active');
});
it('cancellation while final application waits does not acknowledge or revive the owner', async () => {
  const f = await connected(),
    hold = f.hold();
  const work = f.queues.prepare(Uint8Array.of(1), async (_bytes, stage) => {
    stage([], f.finish());
    return true;
  });
  const rejected = expect(work).rejects.toThrow();
  await hold.entered;
  const closing = f.cohort.close();
  hold.release();
  await rejected;
  await closing;
  expect(f.pending()).toBe(1);
  expect(f.cohort.state).toBe('closed');
  await expect(f.queues.methods.workspaceFinish({ id: 1 })).rejects.toThrow();
});

it('streams original multi-part update frames in order and leaves original local Undo intact', async () => {
  const f = await connected(),
    w = f.controller.workspace,
    field = w.text({ kind: 'master' });
  await field.input({ name: 'insert', text: 'local' }, sel()).accepted;
  const doc = createDoc();
  applyUpdate(doc, w.snapshot());
  const updates: Uint8Array<ArrayBuffer>[] = [];
  doc.on('update', (bytes: Uint8Array) => updates.push(new Uint8Array(bytes)));
  const first = ' remote' + '.'.repeat(70000),
    second = ' tail';
  doc.getText('master').insert(5, first);
  doc.getText('master').insert(5 + first.length, second);
  doc.destroy();
  await f.queues.prepare(Uint8Array.of(1), async (_input, stage) => {
    stage(updates, f.finish());
    for (const b of updates) b.fill(0);
    return true;
  });
  expect(field.read().text).toBe('local' + first + second);
  await w.command({ kind: 'undo' }).accepted;
  expect(field.read().text).toBe(first + second);
});
it('a duplicate synchronous mutation handoff is refused before any native final check', async () => {
  const f = await connected();
  await expect(
    f.queues.enqueue(Uint8Array.of(1), async (_b, promote) => {
      promote([]);
      promote([]);
      return true;
    }),
  ).rejects.toThrow();
  expect(f.events).toEqual(['worker-fence']);
  expect(f.pending()).toBe(0);
  expect(f.cohort.signal.aborted).toBe(true);
});
it('oversized staged frames are refused before dispatch or allocating copied frames', async () => {
  const f = await connected();
  const bytes = new Uint8Array(4 * 1024 * 1024 + 1);
  await expect(
    f.queues.prepare(Uint8Array.of(1), async (_b, stage) => {
      stage([bytes], f.finish());
      return true;
    }),
  ).rejects.toThrow();
  expect(f.events).toEqual([]);
  expect(f.cohort.signal.aborted).toBe(true);
});
