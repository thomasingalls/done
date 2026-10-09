// @vitest-environment node
import { it, expect, vi } from 'vitest';
import fc from 'fast-check';
import {
  Y,
  createDoc,
  createHistoryDoc,
  workspaceUndo,
  forkWorkspaceHistory,
  applyUpdate,
  sameDocState,
} from '../src/crdt/yjs';
import { cloneDocument } from '../src/crdt/admissionDocument';
import {
  createWorkspacePreparation,
  type PreparationContext,
  type PreparationScope,
  type PreparedWorkspace,
  type PreparedWorkspaceState,
} from '../src/crdt/workspacePreparation';
import type { Bytes } from '../src/crdt/custodyCrypto';

const wire = (text: string): Bytes => new TextEncoder().encode(text);
const fixture = () => {
  const human = { actor: 'human', kind: 'human' },
    canonical = createDoc();
  let accepted = workspaceUndo(createHistoryDoc(), human),
    verified = 0;
  const head = { kind: 'local' as 'local' | 'remote', job: {}, slice: 0, revision: 0, writer: 42 },
    disk: Bytes[] = [],
    states: PreparedWorkspaceState[] = [],
    buffers: Bytes[] = [];
  const owner = createWorkspacePreparation({ head: () => head, verifiedRevision: () => verified });
  let calls = 0,
    lastInput: Bytes | undefined,
    lastScope: PreparationScope | undefined;
  const state = (writer = head.writer) => {
    const history = forkWorkspaceHistory(accepted, human);
    history.doc.clientID = writer;
    const value = { history, selections: new Map(), group: 1, value: true };
    states.push(value);
    return value;
  };
  const command =
    (value: string, alter?: (scope: PreparationScope) => void) =>
    (context: PreparationContext, input: Bytes, scope: PreparationScope) => {
      calls++;
      lastInput = input;
      lastScope = scope;
      const candidate = state(context.writer);
      scope.ownState(candidate);
      const updates: Bytes[] = [];
      const capture = (update: Uint8Array) => {
        const copy = scope.ownBytes(new Uint8Array(update));
        updates.push(copy);
        buffers.push(copy);
      };
      candidate.history.doc.on('update', capture);
      try {
        candidate.history.stopCapturing();
        if (value)
          candidate.history.doc.transact(() => {
            const text = candidate.history.doc.getText('master');
            text.insert(text.length, value);
          }, human);
        const update = scope.ownBytes(
          new Uint8Array(updates.length ? Y.mergeUpdates(updates) : [0, 0]),
        );
        buffers.push(update);
        alter?.(scope);
        return {
          update,
          sources: updates.map((bytes) => ({ actor: 'human', kind: 'human' as const, bytes })),
        };
      } finally {
        candidate.history.doc.off('update', capture);
      }
    };
  const sourceCheck = (prepared: PreparedWorkspace) => {
    const probe = cloneDocument(canonical);
    try {
      for (const source of prepared.sources ?? []) applyUpdate(probe, source.bytes);
      return sameDocState(probe, prepared.state.history.doc);
    } finally {
      probe.destroy();
    }
  };
  const prepare = (context: PreparationContext, text = 'A') =>
    owner.prepare(context, wire('intent'), 16384, command(text), sourceCheck);
  const promote = (context: PreparationContext, nextSlice = false) => {
    const lease = owner.borrow(context),
      bytes = lease.prepared.update.slice(),
      remainder = lease.prepared.remaining?.slice();
    disk.push(bytes);
    applyUpdate(canonical, bytes);
    lease.release();
    head.revision++;
    const adopted = owner.adopt(context, (p) => sameDocState(canonical, p.state.history.doc));
    accepted.destroy();
    accepted.doc.destroy();
    accepted = adopted.history;
    verified = head.revision;
    owner.finish(context);
    if (nextSlice) head.slice++;
    else {
      head.job = {};
      head.slice = 0;
    }
    return remainder;
  };
  const remote = (value: string) => {
    const doc = cloneDocument(canonical);
    doc.clientID = 701;
    let bytes!: Bytes;
    doc.on('update', (b: Uint8Array) => {
      bytes = new Uint8Array(b);
    });
    try {
      const text = doc.getText('master');
      text.insert(text.length, value);
      applyUpdate(canonical, bytes);
      applyUpdate(accepted.doc, bytes);
      disk.push(bytes);
      head.revision++;
      verified = head.revision;
      head.job = {};
    } finally {
      doc.destroy();
    }
  };
  return {
    owner,
    head,
    canonical,
    disk,
    states,
    buffers,
    state,
    command,
    sourceCheck,
    prepare,
    promote,
    remote,
    get accepted() {
      return accepted;
    },
    get calls() {
      return calls;
    },
    get input() {
      return lastInput!;
    },
    get scope() {
      return lastScope!;
    },
    setVerified(value: number) {
      verified = value;
    },
    async close() {
      await owner.close();
      accepted.destroy();
      accepted.doc.destroy();
      canonical.destroy();
    },
  };
};
const zero = (bytes: Bytes) => bytes.every((b) => b === 0);

it('rejected async results erase late returned update remainder source and capture buffers', async () => {
  for (const stage of ['command', 'capture'] as const) {
    const f = fixture(),
      context = f.owner.issue(),
      late = [wire('update'), wire('remaining'), wire('source'), wire('capsule')];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const command = async (ctx: PreparationContext, input: Bytes, scope: PreparationScope) => {
      f.command('A')(ctx, input, scope);
      await gate;
      return {
        update: late[0]!,
        remaining: late[1]!,
        sources: [{ actor: 'human', kind: 'human', bytes: late[2]! }],
      };
    };
    const capture = async () => {
      await gate;
      return late[3]!;
    };
    try {
      expect(() =>
        f.owner.prepare(
          context,
          wire('intent'),
          16384,
          stage === 'command'
            ? (command as unknown as Parameters<typeof f.owner.prepare>[3])
            : f.command('A'),
          f.sourceCheck,
          stage === 'capture'
            ? (capture as unknown as Parameters<typeof f.owner.prepare>[5])
            : undefined,
        ),
      ).toThrow(/synchronous/);
      release();
      await gate;
      await Promise.resolve();
      await Promise.resolve();
      expect(
        (stage === 'command' ? late.slice(0, 3) : late.slice(3)).every(zero),
        'late asynchronous results must be erased',
      ).toBe(true);
    } finally {
      release();
      await f.close();
    }
  }
});

it('a closing command reclaims every returned buffer before refusing the handoff', async () => {
  const f = fixture(),
    context = f.owner.issue(),
    returned = [wire('update'), wire('remainder'), wire('source')];
  try {
    expect(() =>
      f.owner.prepare(
        context,
        wire('intent'),
        16384,
        (ctx, input, scope) => {
          f.command('A')(ctx, input, scope);
          void f.owner.close();
          return {
            update: returned[0]!,
            remaining: returned[1]!,
            sources: [{ actor: 'human', kind: 'human', bytes: returned[2]! }],
          };
        },
        f.sourceCheck,
      ),
    ).toThrow();
    expect(returned.every(zero), 'all returned resources must be reclaimed on cancellation').toBe(
      true,
    );
  } finally {
    await f.close();
  }
});

it('opaque contexts reject forgery foreign owners and reuse without consuming legitimate work', async () => {
  const a = fixture(),
    b = fixture(),
    context = a.owner.issue(),
    foreign = b.owner.issue();
  try {
    expect(Object.isFrozen(context)).toBe(true);
    for (const invalid of [{ ...context }, foreign] as PreparationContext[])
      expect(
        () => a.prepare(invalid),
        'only issued context identity authorizes preparation',
      ).toThrow(/context/);
    expect(a.calls).toBe(0);
    a.prepare(context);
    expect(() => a.prepare(context), 'a consumed context cannot rerun its command').toThrow(
      /context/,
    );
    expect(() => a.owner.borrow(foreign)).toThrow(/context/);
    expect(a.calls).toBe(1);
    expect(a.states[0]!.history.doc.isDestroyed).toBe(false);
    a.promote(context);
    expect(() => a.owner.borrow(context)).toThrow(/context/);
    expect(a.accepted.doc.getText('master').toString()).toBe('A');
  } finally {
    await a.close();
    await b.close();
  }
});

it('every head field and the independently verified revision binds preparation and revokes stale borrows', async () => {
  for (const field of ['kind', 'job', 'slice', 'revision', 'writer', 'verified'] as const) {
    const f = fixture(),
      context = f.owner.issue();
    try {
      f.prepare(context);
      if (field === 'kind') f.head.kind = 'remote';
      else if (field === 'job') f.head.job = {};
      else if (field === 'verified') f.setVerified(1);
      else f.head[field]++;
      expect(
        () => f.owner.borrow(context).release(),
        'every preparation basis component must agree',
      ).toThrow(/basis/);
      expect(f.states[0]!.history.doc.isDestroyed).toBe(true);
      expect(f.buffers.every(zero)).toBe(true);
      expect(() => f.owner.borrow(context)).toThrow(/context/);
    } finally {
      await f.close();
    }
  }
});

it('no op acceptance advances context revision despite an unchanged state vector', async () => {
  const f = fixture();
  try {
    const before = Y.encodeStateVector(f.canonical),
      first = f.owner.issue();
    f.prepare(first, '');
    f.promote(first);
    expect(Y.encodeStateVector(f.canonical)).toEqual(before);
    const next = f.owner.issue();
    expect(next.revision).toBe(1);
    expect(() => f.prepare(first)).toThrow(/context/);
    f.prepare(next);
    f.promote(next);
  } finally {
    await f.close();
  }
});

it('storage retries borrow the exact prepared bytes without rerunning or disposing history', async () => {
  const f = fixture(),
    context = f.owner.issue();
  try {
    f.prepare(context);
    const first = f.owner.borrow(context),
      bytes = first.prepared.update,
      saved = bytes.slice();
    expect(() => f.owner.borrow(context)).toThrow(/borrowed/);
    first.release();
    first.release();
    const retry = f.owner.borrow(context);
    expect(retry.prepared).toBe(first.prepared);
    expect(retry.prepared.update).toBe(bytes);
    expect(bytes).toEqual(saved);
    expect(f.calls).toBe(1);
    expect(f.states[0]!.history.doc.isDestroyed).toBe(false);
    retry.release();
    f.promote(context);
    expect(zero(bytes)).toBe(true);
    expect(f.accepted.doc.getText('master').toString()).toBe('A');
  } finally {
    await f.close();
  }
});

it('remaining slices get new contexts after adoption and retain their independent remaining bytes', async () => {
  const f = fixture(),
    first = f.owner.issue();
  try {
    const run = f.command('A');
    f.owner.prepare(
      first,
      wire('AB'),
      16384,
      (context, input, scope) => ({
        ...run(context, input, scope),
        remaining: scope.ownBytes(wire('B')),
      }),
      f.sourceCheck,
    );
    const remaining = f.promote(first, true);
    expect(remaining).toEqual(wire('B'));
    const next = f.owner.issue();
    expect(next.slice).toBe(1);
    expect(next.revision).toBe(1);
    expect(() => f.prepare(first)).toThrow(/context/);
    f.prepare(next, 'B');
    f.promote(next);
    expect(f.accepted.doc.getText('master').toString()).toBe('AB');
    expect(f.accepted.undoStack.length).toBe(2);
  } finally {
    await f.close();
  }
});

it('adoption requires this job and slice at exactly the next revision and successful full comparison', async () => {
  for (const fault of [
    'unpromoted',
    'skipped-revision',
    'wrong-job',
    'wrong-slice',
    'missing-update',
  ] as const) {
    const f = fixture(),
      context = f.owner.issue();
    try {
      f.prepare(context);
      if (fault !== 'unpromoted') f.head.revision++;
      if (fault === 'skipped-revision') f.head.revision++;
      if (fault === 'wrong-job') f.head.job = {};
      if (fault === 'wrong-slice') f.head.slice++;
      expect(
        () => f.owner.adopt(context, (p) => sameDocState(f.canonical, p.state.history.doc)),
        'unverified or mismatched promotion must never transfer history',
      ).toThrow();
      expect(() => f.owner.issue()).toThrow(/closed/);
      expect(f.states[0]!.history.doc.isDestroyed).toBe(true);
      expect(f.buffers.every(zero)).toBe(true);
    } finally {
      await f.close();
    }
  }
});

it('command verification and capture throws erase all registered state and buffers before a fresh attempt', async () => {
  for (const stage of ['command', 'verify', 'capture'] as const) {
    const f = fixture(),
      context = f.owner.issue();
    const fail = () => {
      throw Error(stage);
    };
    try {
      expect(() =>
        f.owner.prepare(
          context,
          wire('intent'),
          16384,
          f.command('A', stage === 'command' ? fail : undefined),
          stage === 'verify' ? fail : f.sourceCheck,
          stage === 'capture' ? fail : undefined,
        ),
      ).toThrow(stage);
      expect(f.states[0]!.history.doc.isDestroyed).toBe(true);
      expect(f.buffers.every(zero)).toBe(true);
      expect(zero(f.input)).toBe(true);
      const next = f.owner.issue();
      f.prepare(next, 'B');
      f.promote(next);
      expect(f.accepted.doc.getText('master').toString()).toBe('B');
    } finally {
      await f.close();
    }
  }
});

it('shape bounds wrong writers and borrowed-input aliasing refuse before source custody capture', async () => {
  for (const fault of [
    'oversize',
    'empty-update',
    'remainder',
    'sources',
    'writer',
    'input-alias',
  ] as const) {
    const f = fixture(),
      context = f.owner.issue(),
      capture = vi.fn(() => wire('capsule')),
      run = f.command('A');
    try {
      expect(() =>
        f.owner.prepare(
          context,
          wire('intent'),
          16384,
          (ctx, input, scope) => {
            const result = run(ctx, input, scope);
            if (fault === 'writer') f.states.at(-1)!.history.doc.clientID++;
            if (fault === 'oversize') return { update: scope.ownBytes(new Uint8Array(16385)) };
            if (fault === 'empty-update') return { update: scope.ownBytes(new Uint8Array()) };
            if (fault === 'remainder')
              return { ...result, remaining: scope.ownBytes(wire('intent')) };
            if (fault === 'sources')
              return { ...result, sources: Array.from({ length: 65 }, () => result.sources[0]!) };
            if (fault === 'input-alias') return { update: input.subarray(0, 2) };
            return result;
          },
          f.sourceCheck,
          capture,
        ),
      ).toThrow();
      expect(capture).not.toHaveBeenCalled();
      expect(f.buffers.every(zero)).toBe(true);
      expect(f.states[0]!.history.doc.isDestroyed).toBe(true);
      expect(zero(f.input)).toBe(true);
    } finally {
      await f.close();
    }
  }
});

it('failed source verification prevents custody capture even when the proposed update is well formed', async () => {
  const f = fixture(),
    context = f.owner.issue(),
    capture = vi.fn(() => wire('capsule')),
    run = f.command('A');
  try {
    expect(
      () =>
        f.owner.prepare(
          context,
          wire('intent'),
          16384,
          (ctx, input, scope) => ({ ...run(ctx, input, scope), sources: [] }),
          f.sourceCheck,
          capture,
        ),
      'source verification must precede custody capture',
    ).toThrow(/verification/);
    expect(capture).not.toHaveBeenCalled();
    expect(f.buffers.every(zero)).toBe(true);
    expect(f.states[0]!.history.doc.isDestroyed).toBe(true);
  } finally {
    await f.close();
  }
});

it('close revokes a borrowed write immediately but defers erasure until its idempotent release', async () => {
  const f = fixture(),
    context = f.owner.issue();
  f.prepare(context);
  const lease = f.owner.borrow(context),
    saved = lease.prepared.update.slice();
  try {
    let drained = false;
    const closing = f.owner.close();
    void closing.then(() => {
      drained = true;
    });
    expect(f.owner.close()).toBe(closing);
    expect(lease.prepared.update, 'an in-flight write retains its bytes until release').toEqual(
      saved,
    );
    await Promise.resolve();
    expect(drained).toBe(false);
    expect(lease.prepared.state.history.doc.isDestroyed).toBe(false);
    expect(() => f.owner.adopt(context, () => true)).toThrow(/closed/);
    lease.release();
    lease.release();
    await closing;
    expect(
      lease.prepared.state.history.doc.isDestroyed,
      'revoked history must be destroyed after drain',
    ).toBe(true);
    expect(zero(lease.prepared.update)).toBe(true);
  } finally {
    lease.release();
    await f.close();
  }
});

it('callback close and basis changes are rechecked after command verification and capture', async () => {
  for (const stage of ['command', 'verify', 'capture'] as const)
    for (const fault of ['close', 'revision'] as const) {
      const f = fixture(),
        context = f.owner.issue();
      let captured: Bytes | undefined;
      const interfere = () => {
        if (fault === 'close') void f.owner.close();
        else f.head.revision++;
      };
      try {
        expect(() =>
          f.owner.prepare(
            context,
            wire('intent'),
            16384,
            f.command('A', stage === 'command' ? interfere : undefined),
            (p) => {
              const valid = f.sourceCheck(p);
              if (stage === 'verify') interfere();
              return valid;
            },
            () => {
              captured = wire('capsule');
              if (stage === 'capture') interfere();
              return captured;
            },
          ),
        ).toThrow();
        expect(f.states[0]!.history.doc.isDestroyed).toBe(true);
        expect(f.buffers.every(zero)).toBe(true);
        if (captured) expect(zero(captured)).toBe(true);
      } finally {
        await f.close();
      }
    }
});

it('reentrant preparation and adoption cannot replace the owned head or escape final verification', async () => {
  const f = fixture(),
    context = f.owner.issue();
  try {
    f.owner.prepare(
      context,
      wire('intent'),
      16384,
      f.command('A', () => {
        expect(() => f.owner.issue()).toThrow(/owns/);
        expect(() => f.prepare(context)).toThrow(/busy/);
        expect(() => f.owner.borrow(context)).toThrow(/busy/);
      }),
      f.sourceCheck,
    );
    const lease = f.owner.borrow(context);
    applyUpdate(f.canonical, lease.prepared.update);
    lease.release();
    f.head.revision++;
    expect(() =>
      f.owner.adopt(context, () => {
        f.owner.discard(context);
        return true;
      }),
    ).toThrow();
    expect(f.states[0]!.history.doc.isDestroyed).toBe(true);
    expect(f.buffers.every(zero)).toBe(true);
  } finally {
    await f.close();
  }
});

it('async preparation is refused and its late scoped allocations are reclaimed', async () => {
  const f = fixture(),
    context = f.owner.issue();
  let release!: () => void,
    lateState: PreparedWorkspaceState | undefined,
    lateBytes: Bytes | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const asyncCommand = async (ctx: PreparationContext, input: Bytes, scope: PreparationScope) => {
    const result = f.command('A')(ctx, input, scope);
    await gate;
    lateBytes = wire('late');
    expect(() => scope.ownBytes(lateBytes!)).toThrow();
    lateState = f.state();
    expect(() => scope.ownState(lateState!)).toThrow();
    return result;
  };
  try {
    expect(() =>
      f.owner.prepare(
        context,
        wire('intent'),
        16384,
        asyncCommand as unknown as Parameters<typeof f.owner.prepare>[3],
        f.sourceCheck,
      ),
    ).toThrow(/synchronous/);
    expect(f.states[0]!.history.doc.isDestroyed).toBe(true);
    expect(f.buffers.every(zero)).toBe(true);
    release();
    await gate;
    await Promise.resolve();
    expect(lateState!.history.doc.isDestroyed).toBe(true);
    expect(zero(lateBytes!)).toBe(true);
  } finally {
    release();
    await f.close();
  }
});

it('thenable verification capture and adoption are refused without publishing owned history', async () => {
  for (const stage of ['verify', 'capture', 'adopt'] as const) {
    const f = fixture(),
      context = f.owner.issue(),
      asyncVerify = async () => true,
      asyncCapture = async () => wire('capsule');
    try {
      if (stage === 'adopt') {
        f.prepare(context);
        const lease = f.owner.borrow(context);
        applyUpdate(f.canonical, lease.prepared.update);
        lease.release();
        f.head.revision++;
        expect(() =>
          f.owner.adopt(context, asyncVerify as unknown as Parameters<typeof f.owner.adopt>[1]),
        ).toThrow(/synchronous/);
      } else
        expect(() =>
          f.owner.prepare(
            context,
            wire('intent'),
            16384,
            f.command('A'),
            stage === 'verify'
              ? (asyncVerify as unknown as Parameters<typeof f.owner.prepare>[4])
              : f.sourceCheck,
            stage === 'capture'
              ? (asyncCapture as unknown as Parameters<typeof f.owner.prepare>[5])
              : undefined,
          ),
        ).toThrow(/synchronous/);
      expect(f.states[0]!.history.doc.isDestroyed).toBe(true);
      expect(f.buffers.every(zero)).toBe(true);
    } finally {
      await f.close();
    }
  }
});

it('late ownership callbacks cannot destroy an already transferred accepted history', async () => {
  const f = fixture(),
    context = f.owner.issue();
  try {
    f.prepare(context);
    const state = f.states[0]!,
      scope = f.scope;
    f.promote(context);
    expect(() => scope.ownState(state)).toThrow(/already owned/);
    expect(state.history.doc.isDestroyed).toBe(false);
    const next = f.owner.issue();
    expect(() =>
      f.owner.prepare(
        next,
        wire('intent'),
        16384,
        (_ctx, _input, nextScope) => {
          nextScope.ownState(state);
          return { update: new Uint8Array([0, 0]) };
        },
        () => true,
      ),
    ).toThrow(/already owned/);
    expect(state.history.doc.isDestroyed).toBe(false);
  } finally {
    await f.close();
  }
});

it('cleanup continues through a throwing history destructor and closes the owner terminally', async () => {
  const f = fixture(),
    context = f.owner.issue();
  f.prepare(context);
  const candidate = f.states[0]!,
    spy = vi.spyOn(candidate.history, 'destroy').mockImplementation(() => {
      throw Error('destructor');
    });
  try {
    await expect(f.owner.close()).rejects.toThrow(/cleanup/);
    expect(candidate.history.doc.isDestroyed).toBe(true);
    expect(f.buffers.every(zero)).toBe(true);
    expect(() => f.owner.issue()).toThrow(/closed/);
  } finally {
    spy.mockRestore();
    candidate.history.destroy();
    f.accepted.destroy();
    f.accepted.doc.destroy();
    f.canonical.destroy();
  }
});

it('120 generated handoff histories preserve independent accepted text cold replay and undo ownership', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.record({
          route: fc.constantFrom('accept', 'retry', 'discard', 'noop', 'remote'),
          value: fc.string({ minLength: 1, maxLength: 5 }),
        }),
        { minLength: 1, maxLength: 16 },
      ),
      async (actions) => {
        const f = fixture();
        let expected = '',
          revision = 0,
          undo = 0;
        try {
          for (const action of actions) {
            if (action.route === 'remote') {
              f.remote(action.value);
              expected += action.value;
              revision++;
            } else {
              const context = f.owner.issue(),
                value = action.route === 'noop' ? '' : action.value,
                calls = f.calls;
              expect(context.revision).toBe(revision);
              f.prepare(context, value);
              expect(f.accepted.doc.getText('master').toString()).toBe(expected);
              if (action.route === 'retry') {
                const one = f.owner.borrow(context),
                  bytes = one.prepared.update.slice();
                one.release();
                const two = f.owner.borrow(context);
                expect(two.prepared).toBe(one.prepared);
                expect(two.prepared.update).toEqual(bytes);
                two.release();
              }
              if (action.route === 'discard') f.owner.discard(context);
              else {
                f.promote(context);
                expected += value;
                revision++;
                if (value) undo++;
              }
              expect(f.calls).toBe(calls + 1);
              expect(f.buffers.every(zero)).toBe(true);
              expect(zero(f.input)).toBe(true);
            }
            expect(f.head.revision).toBe(revision);
            expect(
              f.accepted.doc.getText('master').toString(),
              'accepted text follows the independent ledger',
            ).toBe(expected);
            expect(f.accepted.undoStack.length).toBe(undo);
            const cold = createDoc();
            try {
              for (const bytes of f.disk) applyUpdate(cold, bytes);
              expect(cold.getText('master').toString()).toBe(expected);
            } finally {
              cold.destroy();
            }
          }
          await f.close();
          expect(f.states.every((s) => s.history.doc.isDestroyed)).toBe(true);
        } finally {
          await f.close();
        }
      },
    ),
    { seed: 140924, numRuns: 120 },
  );
});

it('detached input cannot strand the cleanup drain or retain a private history', async () => {
  const f = fixture(),
    context = f.owner.issue(),
    run = f.command('A');
  try {
    expect(() =>
      f.owner.prepare(
        context,
        wire('intent'),
        16384,
        (ctx, input, scope) => {
          const result = run(ctx, input, scope);
          structuredClone(input.buffer, { transfer: [input.buffer] });
          return result;
        },
        f.sourceCheck,
      ),
    ).toThrow();
    expect(f.states[0]!.history.doc.isDestroyed).toBe(true);
    expect(f.buffers.every(zero)).toBe(true);
    await expect(f.owner.close()).rejects.toThrow();
  } finally {
    f.accepted.destroy();
    f.accepted.doc.destroy();
    f.canonical.destroy();
  }
});
