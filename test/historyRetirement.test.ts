// @vitest-environment node
import { it, expect } from 'vitest';
import { Y, createHistoryDoc, workspaceUndo } from '../src/crdt/yjs';
import {
  createWorkspacePreparation,
  type PreparedWorkspaceState,
  type PreparationScope,
} from '../src/crdt/workspacePreparation';

const fixture = () => {
  const head = { kind: 'local' as const, job: {}, slice: 0, revision: 0, writer: 71 };
  let verified = 0;
  const owner = createWorkspacePreparation({ head: () => head, verifiedRevision: () => verified });
  const states: PreparedWorkspaceState[] = [],
    scopes: PreparationScope[] = [];
  const fresh = () => {
    const history = workspaceUndo(createHistoryDoc(), {});
    history.doc.clientID = head.writer;
    const state = { history, selections: new Map(), group: 1, value: true };
    states.push(state);
    return state;
  };
  const prepare = (state = fresh()) => {
    head.job = {};
    const context = owner.issue();
    owner.prepare(
      context,
      new Uint8Array([1]),
      128,
      (_ctx, _input, scope) => {
        scopes.push(scope);
        scope.ownState(state);
        return { update: new Uint8Array([0, 0]) };
      },
      () => true,
    );
    return { context, state };
  };
  const adopt = (p: ReturnType<typeof prepare>) => {
    head.revision++;
    const state = owner.adopt(p.context, () => true);
    verified = head.revision;
    return state;
  };
  return {
    owner,
    head,
    states,
    scopes,
    fresh,
    prepare,
    adopt,
    async close() {
      await owner.close();
      for (const s of states) {
        s.history.destroy();
        s.history.doc.destroy();
      }
    },
  };
};

it('history retirement permits one exact previous transfer and rejects active foreign duplicate or alias states', async () => {
  const f = fixture(),
    other = fixture();
  try {
    const a = f.prepare();
    f.adopt(a);
    expect(() => f.owner.retire(a.state)).toThrow(/cannot be retired/);
    f.owner.finish(a.context);
    const b = f.prepare();
    f.adopt(b);
    expect(() => f.owner.retire(f.fresh())).toThrow(/cannot be retired/);
    const foreign = other.prepare();
    other.adopt(foreign);
    expect(() => f.owner.retire(foreign.state)).toThrow(/cannot be retired/);
    expect(() => f.owner.retire({ ...a.state })).toThrow(/cannot be retired/);
    f.owner.retire(a.state);
    expect(() => f.owner.retire(a.state)).toThrow(/cannot be retired/);
    f.owner.finish(b.context);
    const c = f.prepare(a.state);
    expect(c.state).toBe(a.state);
    f.adopt(c);
    expect(() => f.owner.retire(c.state)).toThrow(/cannot be retired/);
    f.owner.retire(b.state);
    f.owner.finish(c.context);
    const d = f.prepare(b.state);
    f.adopt(d);
    f.owner.finish(d.context);
    expect(a.state.history.doc.isDestroyed).toBe(false);
    expect(b.state.history.doc.isDestroyed).toBe(false);
  } finally {
    await f.close();
    await other.close();
  }
});

it('retired histories resist stale callbacks before during and after reownership', async () => {
  const f = fixture();
  try {
    const a = f.prepare();
    f.adopt(a);
    f.owner.finish(a.context);
    const old = f.scopes[0]!;
    const b = f.prepare();
    f.adopt(b);
    f.owner.retire(a.state);
    expect(() => old.ownState(a.state)).toThrow(/already owned/);
    expect(a.state.history.doc.isDestroyed).toBe(false);
    f.owner.finish(b.context);
    const c = f.prepare(a.state);
    const lease = f.owner.borrow(c.context);
    expect(() => old.ownState(a.state)).toThrow(/already owned/);
    expect(a.state.history.doc.isDestroyed).toBe(false);
    f.owner.discard(c.context);
    expect(a.state.history.doc.isDestroyed).toBe(false);
    lease.release();
    expect(a.state.history.doc.isDestroyed).toBe(true);
    expect(() => old.ownState(b.state)).toThrow(/already owned/);
    expect(b.state.history.doc.isDestroyed).toBe(false);
    await f.owner.close();
    expect(() => f.owner.retire(b.state)).toThrow(/closed/);
  } finally {
    await f.close();
  }
});

it('retirement does not let a new wrapper reacquire or destroy the real retired document', async () => {
  const f = fixture();
  try {
    const a = f.prepare();
    f.adopt(a);
    f.owner.finish(a.context);
    const b = f.prepare();
    f.adopt(b);
    f.owner.retire(a.state);
    f.owner.finish(b.context);
    expect(() => f.prepare({ ...a.state })).toThrow(/already owned/);
    expect(a.state.history.doc.isDestroyed).toBe(false);
    const next = f.prepare(a.state);
    f.adopt(next);
    f.owner.finish(next.context);
    expect(a.state.history.doc).toBeInstanceOf(Y.Doc);
  } finally {
    await f.close();
  }
});
