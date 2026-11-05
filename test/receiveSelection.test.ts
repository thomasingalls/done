import { expect, it } from 'vitest';
import {
  createReceiveSelection,
  hasPeerBacklog,
  unresolvedSelfSubmission,
} from '../src/crdt/receiveSelection';
import type { InboundReadCursor } from '../src/crdt/inboundLedger';
import { emptyDelivery } from '../src/crdt/deliveryRecord';
import { RECEIVE_POLL_MS } from '../src/crdt/accountReceiveDriver';

it('stays with useful pages but bounds peer starvation; empty self reads do not recur each page', () => {
  const s = createReceiveSelection(),
    publishers = ['self', 'peer', 'third'];
  const seen: string[] = [];
  for (let i = 0; i < 11; i++) {
    const id = s.next(publishers);
    seen.push(id);
    s.completed(publishers, id, id !== 'self');
  }
  expect(seen).toEqual([
    'self',
    'peer',
    'peer',
    'peer',
    'peer',
    'third',
    'third',
    'third',
    'third',
    'self',
    'peer',
  ]);
});
it('does not install a removed publisher from a late completion', () => {
  const s = createReceiveSelection();
  s.next(['old']);
  s.completed(['new'], 'old', true);
  expect(s.next(['new'])).toBe('new');
});

it('skips recently verified own polls while preserving every peer turn and the periodic check', () => {
  let now = 1000;
  const s = createReceiveSelection(() => now),
    publishers = ['self', 'peer', 'third'];
  const own = { publisher: 'self', pending: false };
  expect(s.next(publishers, own)).toBe('self');
  s.completed(publishers, 'self', false, true);
  const seen = [];
  for (let i = 0; i < 24; i++) {
    const selected = s.next(publishers, own);
    seen.push(selected);
    s.completed(publishers, selected, true);
  }
  expect(seen).toEqual(
    Array.from({ length: 3 }, () => [...Array(4).fill('peer'), ...Array(4).fill('third')]).flat(),
  );
  now += RECEIVE_POLL_MS;
  expect(s.next(publishers, own)).toBe('self');
});

it('unresolved submissions bypass own-poll suppression without starving another publisher', () => {
  const s = createReceiveSelection(() => 1000),
    publishers = ['self', 'peer'];
  const own = { publisher: 'self', pending: false };
  expect(s.next(publishers, own)).toBe('self');
  s.completed(publishers, 'self', false, true);
  for (let i = 0; i < 4; i++) {
    expect(s.next(publishers, own)).toBe('peer');
    s.completed(publishers, 'peer', true);
  }
  own.pending = true;
  expect(s.next(publishers, own)).toBe('self');
  s.completed(publishers, 'self', true, true);
  own.pending = false;
  expect(s.next(publishers, own)).toBe('peer');
});

it('does not delay a lone publisher or a receive-only owner', () => {
  const s = createReceiveSelection(() => 1000);
  s.completed(['self'], 'self', false, true);
  expect(s.next(['self'], { publisher: 'self', pending: false })).toBe('self');
  expect(s.next(['self'])).toBe('self');
});

it('finishes an idle sweep instead of replacing the own turn with a duplicate empty peer read', () => {
  const s = createReceiveSelection(() => 1000),
    publishers = ['self', 'peer'];
  const own = { publisher: 'self', pending: false };
  expect(s.next(publishers, own)).toBe('self');
  s.completed(publishers, 'self', false, true);
  expect(s.next(publishers, own)).toBe('peer');
  s.completed(publishers, 'peer', false);
  expect(s.next(publishers, own)).toBe('self');
  s.completed(publishers, 'self', false, true);
  expect(s.next(publishers, own)).toBe('peer');
});

it('does not suppress own polling after an unverified result, a reset, or a clock rollback', () => {
  let now = 1000;
  const s = createReceiveSelection(() => now),
    publishers = ['self', 'peer'];
  const own = { publisher: 'self', pending: false };
  s.completed(publishers, 'self', false); // A failed or rejected attempt supplies no check.
  s.completed(publishers, 'peer', false);
  expect(s.next(publishers, own)).toBe('self');
  s.completed(publishers, 'self', false, true);
  for (let i = 0; i < 4; i++) s.completed(publishers, 'peer', true);
  expect(s.next(publishers, own)).toBe('peer');
  s.reset();
  expect(s.next(publishers, own)).toBe('self');
  s.completed(publishers, 'self', false, true);
  for (let i = 0; i < 4; i++) s.completed(publishers, 'peer', true);
  now--;
  expect(s.next(publishers, own)).toBe('self');
});

it('does not transfer a completed own check to a new credential', () => {
  const s = createReceiveSelection(() => 1000);
  s.completed(['old', 'peer'], 'old', false, true);
  for (let i = 0; i < 4; i++) s.completed(['new', 'peer'], 'peer', true);
  expect(s.next(['new', 'peer'], { publisher: 'new', pending: false })).toBe('new');
});

it('recognizes current unresolved submissions, including current-key retries with old refusals', () => {
  const state = emptyDelivery();
  expect(unresolvedSelfSubmission(state)).toBe(false);
  state.submissions.set(1, new Uint8Array([1]));
  expect(unresolvedSelfSubmission(state)).toBe(true);
  state.refusals.set(1, 'prior-refusal');
  state.responses.set(1, [new Uint8Array([2])]);
  expect(unresolvedSelfSubmission(state)).toBe(false);
  state.refusals.clear(); // A verified retry resets current refusal, retaining the old response.
  expect(unresolvedSelfSubmission(state)).toBe(true);
  state.acceptedThrough = 1;
  expect(unresolvedSelfSubmission(state)).toBe(false);
  state.submissions.set(2, new Uint8Array([3]));
  expect(unresolvedSelfSubmission(state)).toBe(true);
  state.finalThrough = 1;
  expect(unresolvedSelfSubmission(state)).toBe(false);
  state.finalThrough = null;
  state.conflict = true;
  expect(unresolvedSelfSubmission(state)).toBe(false);
});

it('caps a group by the remaining publisher turn, including a partial preceding group', () => {
  const s = createReceiveSelection(),
    publishers = ['a', 'b'];
  expect(s.next(publishers)).toBe('a');
  s.completed(publishers, 'a', true);
  expect(s.capacity('a')).toBe(3);
  for (let i = 0; i < 3; i++) s.completed(publishers, 'a', true);
  expect(s.next(publishers)).toBe('b');
  expect(s.capacity('b')).toBe(4);
});

it('uses fresh peer backlog to retain a verified self check across intervening empty peers', () => {
  const s = createReceiveSelection(() => 1000),
    publishers = ['quiet-a', 'quiet-b', 'self', 'quiet-c', 'busy'],
    own = { publisher: 'self', pending: false, peerBacklog: true };
  const seen: string[] = [];
  for (let i = 0; i < 40; i++) {
    const id = s.next(publishers, own);
    seen.push(id);
    s.completed(publishers, id, id === 'busy', id === 'self');
  }
  expect(seen.filter((id) => id === 'self')).toEqual(['self']);
  expect(seen.filter((id) => id !== 'self').slice(0, 18)).toEqual([
    'quiet-a',
    'quiet-b',
    'quiet-c',
    'busy',
    'busy',
    'busy',
    'busy',
    'quiet-a',
    'quiet-b',
    'quiet-c',
    'busy',
    'busy',
    'busy',
    'busy',
    'quiet-a',
    'quiet-b',
    'quiet-c',
    'busy',
  ]);
});

it('preserves every non-self publisher turn for all three-to-six-publisher orders', () => {
  const permutations = (values: string[]): string[][] =>
    values.length < 2
      ? [values]
      : values.flatMap((v, i) =>
          permutations(values.filter((_, j) => j !== i)).map((rest) => [v, ...rest]),
        );
  for (let count = 3; count <= 6; count++) {
    const names = ['self', 'busy', ...Array.from({ length: count - 2 }, (_, i) => 'quiet-' + i)];
    for (const publishers of permutations(names)) {
      const selected = createReceiveSelection(() => 1000),
        reference = createReceiveSelection(() => 1000),
        own = { publisher: 'self', pending: false, peerBacklog: true };
      const run = (s: ReturnType<typeof createReceiveSelection>, suppress: boolean) => {
        const peers: string[] = [];
        let self = 0;
        while (peers.length < 24) {
          const id = s.next(publishers, suppress ? own : undefined);
          if (id === 'self') self++;
          else peers.push(id);
          s.completed(publishers, id, id === 'busy', suppress && id === 'self');
        }
        return { peers, self };
      };
      const actual = run(selected, true),
        expected = run(reference, false);
      expect(actual.peers).toEqual(expected.peers);
      expect(actual.self).toBeLessThanOrEqual(1);
    }
  }
});

it('does not use backlog to suppress an unverified self check or a receive-only owner', () => {
  const s = createReceiveSelection(() => 1000),
    publishers = ['a', 'self', 'busy'];
  s.completed(publishers, 'self', false);
  s.completed(publishers, 'a', false);
  expect(s.next(publishers, { publisher: 'self', pending: false, peerBacklog: true })).toBe('self');
  s.completed(publishers, 'self', false, true);
  s.completed(publishers, 'a', false);
  expect(s.next(publishers)).toBe('self');
});

it('keeps pending-self reconciliation ahead of the backlog hint', () => {
  const s = createReceiveSelection(() => 1000),
    publishers = ['a', 'self', 'busy'];
  s.completed(publishers, 'self', false, true);
  s.completed(publishers, 'a', false);
  expect(s.next(publishers, { publisher: 'self', pending: true, peerBacklog: true })).toBe('self');
});

it('finishes the original idle sweep as soon as fresh peer backlog is exhausted', () => {
  const s = createReceiveSelection(() => 1000),
    publishers = ['a', 'self', 'busy'];
  const own = { publisher: 'self', pending: false, peerBacklog: true };
  s.completed(publishers, 'self', false, true);
  s.completed(publishers, 'a', false);
  expect(s.next(publishers, own)).toBe('busy');
  s.completed(publishers, 'busy', false);
  own.peerBacklog = false;
  expect(s.next(publishers, own)).toBe('a');
  s.completed(publishers, 'a', false);
  expect(s.next(publishers, own)).toBe('self');
});

it('retains self-check expiry, clock rollback, reset and credential binding under peer backlog', () => {
  for (const boundary of ['expiry', 'rollback', 'reset', 'credential']) {
    let now = 1000;
    const s = createReceiveSelection(() => now),
      publishers = ['a', 'self', 'busy'];
    const own = { publisher: 'self', pending: false, peerBacklog: true };
    s.completed(publishers, 'self', false, true);
    s.completed(publishers, 'a', false);
    if (boundary === 'expiry') now += RECEIVE_POLL_MS;
    if (boundary === 'rollback') now--;
    if (boundary === 'reset') {
      s.reset();
      s.completed(publishers, 'a', false);
    }
    if (boundary === 'credential') {
      publishers[1] = 'new-self';
      own.publisher = 'new-self';
    }
    expect(s.next(publishers, own)).toBe(own.publisher);
  }
});

it('takes backlog only from an eligible unconflicted peer and leaves the projection untouched', () => {
  const cursor = (position: number, observedThrough: number): InboundReadCursor => ({
    prefix: { position, observedThrough, link: '00'.repeat(32) },
    conflict: false,
  });
  const peers = new Map([
    ['self', cursor(0, 100)],
    ['busy', cursor(1, 10)],
    ['removed', cursor(0, 100)],
    ['idle', cursor(2, 2)],
    ['conflicted', { ...cursor(0, 100), conflict: true }],
  ]);
  const before = structuredClone(peers);
  expect(hasPeerBacklog(['self', 'idle'], 'self', peers)).toBe(false);
  expect(hasPeerBacklog(['self', 'missing', 'conflicted'], 'self', peers)).toBe(false);
  expect(hasPeerBacklog(['self', 'busy', 'idle'], 'self', peers)).toBe(true);
  expect(hasPeerBacklog(['self'], 'self', peers)).toBe(false);
  expect(hasPeerBacklog(['self', 'busy'], 'self', undefined)).toBe(false);
  expect(peers).toEqual(before);
});

it('drops the scheduling hint immediately when the current retained cursor catches up', () => {
  const peers = new Map<string, InboundReadCursor>([
    [
      'peer',
      { prefix: { position: 3, observedThrough: 4, link: '00'.repeat(32) }, conflict: false },
    ],
  ]);
  expect(hasPeerBacklog(['self', 'peer'], 'self', peers)).toBe(true);
  peers.get('peer')!.prefix.position = 4;
  expect(hasPeerBacklog(['self', 'peer'], 'self', peers)).toBe(false);
  peers.get('peer')!.prefix.position = 5;
  expect(hasPeerBacklog(['self', 'peer'], 'self', peers)).toBe(false);
});

it('does not spend every useful turn rechecking a recently verified quiet remote publisher', () => {
  const s = createReceiveSelection(() => 1000, true);
  const context = {};
  const publishers = ['self', 'quiet', 'busy'];
  const cursor: InboundReadCursor = {
    prefix: { position: 1, link: 'q', observedThrough: 1 },
    conflict: false,
  };
  const peers = new Map([
    ['quiet', cursor],
    ['busy', { prefix: { position: 1, link: 'b', observedThrough: 1000 }, conflict: false }],
  ]);
  const own = { publisher: 'self', pending: false, peerBacklog: true };
  const optional = s as typeof s & {
    captureQuiet?: (
      context: object,
      publisher: string,
      cursor: InboundReadCursor,
    ) => object | undefined;
    completedQuiet?: (token: object | undefined, kind: string) => boolean;
  };
  let quiet = 0;
  for (let i = 0; i < 32; i++) {
    const id = s.next(publishers, own, { context, peers });
    const token = id === 'quiet' ? optional.captureQuiet?.(context, id, cursor) : undefined;
    if (id === 'quiet') quiet++;
    s.completed(publishers, id, id === 'busy', id === 'self');
    optional.completedQuiet?.(token, id === 'quiet' ? 'empty' : 'received');
  }
  expect(quiet).toBe(1);
});

const quietFixture = () => {
  let at = 1000;
  const s = createReceiveSelection(() => at, true);
  const publishers = ['quiet', 'self', 'busy'];
  const context = {};
  const peers = new Map<string, InboundReadCursor>([
    ['quiet', { prefix: { position: 1, link: 'q', observedThrough: 1 }, conflict: false }],
    ['busy', { prefix: { position: 1, link: 'b', observedThrough: 100 }, conflict: false }],
  ]);
  const own = { publisher: 'self', pending: false, peerBacklog: true };
  s.completed(publishers, 'self', false, true);
  const view = { context, peers };
  const token = () => s.captureQuiet(context, 'quiet', peers.get('quiet')!);
  const point = () => s.completed(publishers, 'busy', false);
  const selected = () => {
    point();
    return s.next(publishers, own, view);
  };
  return {
    s,
    publishers,
    context,
    peers,
    own,
    view,
    token,
    selected,
    at: (value: number) => {
      at = value;
    },
  };
};
it('expires a quiet publisher at exactly750ms from request start despite delayed verification', () => {
  const f = quietFixture(),
    token = f.token();
  f.at(1300);
  expect(f.s.completedQuiet(token, 'empty')).toBe(true);
  f.at(1749);
  expect(f.selected()).toBe('busy');
  f.at(1750);
  expect(f.selected()).toBe('quiet');
  f.at(2049);
  expect(f.selected()).toBe('quiet');
});
it('compares target cursor values across detached projections, independent of another publisher', () => {
  const f = quietFixture();
  f.s.completedQuiet(f.token(), 'empty');
  f.view.peers = structuredClone(f.peers);
  f.view.peers.get('busy')!.prefix.position = 50;
  expect(f.selected()).toBe('busy');
  f.view.peers.get('quiet')!.prefix.link = 'changed';
  expect(f.selected()).toBe('quiet');
});
it('never defers first/new/missing/conflicted publishers or positive target backlog', () => {
  for (const boundary of ['first', 'missing', 'conflict', 'backlog']) {
    const f = quietFixture();
    if (boundary !== 'first') f.s.completedQuiet(f.token(), 'empty');
    if (boundary === 'missing') f.peers.delete('quiet');
    if (boundary === 'conflict') f.peers.get('quiet')!.conflict = true;
    if (boundary === 'backlog') f.peers.get('quiet')!.prefix.observedThrough = 2;
    expect(f.selected()).toBe('quiet');
  }
});
it('does not cache a conflicted or already backlogged capture', () => {
  const f = quietFixture();
  f.peers.get('quiet')!.conflict = true;
  expect(f.token()).toBeUndefined();
  f.peers.get('quiet')!.conflict = false;
  f.peers.get('quiet')!.prefix.observedThrough = 2;
  expect(f.token()).toBeUndefined();
});
it.each(['unknown', 'expired', 'duplicate', 'rejected', 'refused', 'received'])(
  'a %s completion cannot supply or preserve a quiet hint',
  (kind) => {
    const f = quietFixture();
    f.s.completedQuiet(f.token(), 'empty');
    expect(f.s.completedQuiet(f.token(), kind)).toBe(false);
    expect(f.selected()).toBe('quiet');
  },
);
it('rejects forged, transferred and repeated attempt tokens without sliding expiry', () => {
  const f = quietFixture(),
    token = f.token();
  expect(f.s.completedQuiet({}, 'empty')).toBe(false);
  expect(createReceiveSelection(() => 1000, true).completedQuiet(token, 'empty')).toBe(false);
  expect(f.s.completedQuiet(token, 'empty')).toBe(true);
  f.at(1500);
  expect(f.s.completedQuiet(token, 'empty')).toBe(false);
  expect(f.selected()).toBe('busy');
  f.at(1750);
  expect(f.selected()).toBe('quiet');
});
it('a hint fences an in-flight empty reply without discarding useful completions or own freshness', () => {
  const f = quietFixture(),
    old = f.token();
  f.s.completed(f.publishers, 'busy', true);
  f.s.invalidateQuiet();
  expect(f.s.capacity('busy')).toBe(3);
  expect(f.s.completedQuiet(old, 'empty')).toBe(false);
  expect(f.selected()).toBe('quiet');
  const names = ['self', 'quiet', 'busy'];
  f.s.completed(names, 'busy', false);
  expect(f.s.next(names, f.own, f.view)).toBe('quiet');
});
it('never lets an old completion replace a newer-generation hint', () => {
  const f = quietFixture(),
    old = f.token();
  f.s.invalidateQuiet();
  const current = f.token();
  expect(f.s.completedQuiet(current, 'empty')).toBe(true);
  f.at(1600);
  expect(f.s.completedQuiet(old, 'empty')).toBe(false);
  expect(f.selected()).toBe('busy');
  f.at(1750);
  expect(f.selected()).toBe('quiet');
});
it('forces rechecking after context/cursor/starting-point changes and reset', () => {
  for (const boundary of ['context', 'position', 'starting', 'reset']) {
    const f = quietFixture();
    f.s.completedQuiet(f.token(), 'empty');
    if (boundary === 'context') f.view.context = {};
    if (boundary === 'position')
      f.peers.get('quiet')!.prefix = { position: 2, observedThrough: 2, link: 'q2' };
    if (boundary === 'starting') f.peers.get('quiet')!.startingPoint = { position: 1, link: 'q' };
    if (boundary === 'reset') f.s.reset();
    expect(f.selected()).toBe('quiet');
  }
});
it('copies captured target fields and does not borrow a mutable cursor', () => {
  const f = quietFixture(),
    token = f.token();
  f.peers.get('quiet')!.prefix = { position: 2, observedThrough: 2, link: 'new' };
  expect(f.s.completedQuiet(token, 'empty')).toBe(true);
  expect(f.selected()).toBe('quiet');
});
it('does not refresh one publisher deadline from other progress or empty observations', () => {
  const f = quietFixture();
  f.s.completedQuiet(f.token(), 'empty');
  for (let now = 1100; now < 1750; now += 100) {
    f.at(now);
    f.s.completed(f.publishers, 'busy', true);
    const cursor: InboundReadCursor = {
      prefix: { position: 1, observedThrough: 1, link: 'other' },
      conflict: false,
    };
    f.s.completedQuiet(f.s.captureQuiet(f.context, 'other', cursor), 'empty');
  }
  f.at(1750);
  expect(f.selected()).toBe('quiet');
});
it('invalidates quiet observations and pending attempts on rollback or invalid time', () => {
  for (const at of [999, NaN, Infinity]) {
    const f = quietFixture();
    f.s.completedQuiet(f.token(), 'empty');
    const pending = f.token();
    f.at(at);
    expect(f.selected()).toBe('quiet');
    f.at(1001);
    expect(f.s.completedQuiet(pending, 'empty')).toBe(false);
    expect(f.selected()).toBe('quiet');
  }
});
it('keeps all-idle sweeps, pending-self and first-own checks outside quiet deferral', () => {
  const f = quietFixture();
  f.s.completedQuiet(f.token(), 'empty');
  f.own.peerBacklog = false;
  expect(f.selected()).toBe('quiet');
  f.own.peerBacklog = true;
  f.own.pending = true;
  expect(f.selected()).toBe('self');
  const s = createReceiveSelection(() => 1000, true);
  s.completedQuiet(s.captureQuiet(f.context, 'quiet', f.peers.get('quiet')!), 'empty');
  expect(s.next(f.publishers, f.own, f.view)).toBe('self');
});
it('evicts to safe re-probing at128 publishers instead of disabling another stream', () => {
  const s = createReceiveSelection(() => 1000, true),
    context = {};
  const ids = Array.from({ length: 129 }, (_, i) => 'quiet' + i),
    names = [...ids, 'self', 'busy'];
  const cursor: InboundReadCursor = {
    prefix: { position: 1, observedThrough: 1, link: 'q' },
    conflict: false,
  };
  const peers = new Map(ids.map((id) => [id, structuredClone(cursor)]));
  peers.set('busy', { prefix: { position: 1, observedThrough: 1000, link: 'b' }, conflict: false });
  const own = { publisher: 'self', pending: false, peerBacklog: true };
  s.completed(names, 'self', false, true);
  for (const id of ids) s.completedQuiet(s.captureQuiet(context, id, cursor), 'empty');
  s.completed(names, 'busy', false);
  expect(s.next(names, own, { context, peers })).toBe('quiet0');
  s.completed(names, 'quiet127', false);
  expect(s.next(names, own, { context, peers })).toBe('busy');
});
it('preserves four-useful-page opportunities and due quiet rechecks across publisher orders', () => {
  const permutations = (values: string[]): string[][] =>
    values.length < 2
      ? [values]
      : values.flatMap((v, i) =>
          permutations(values.filter((_, j) => i !== j)).map((rest) => [v, ...rest]),
        );
  for (const names of permutations(['quiet', 'self', 'a', 'b'])) {
    let now = 1000;
    const s = createReceiveSelection(() => now, true),
      context = {};
    const peers = new Map<string, InboundReadCursor>([
      ['quiet', { prefix: { position: 1, observedThrough: 1, link: 'q' }, conflict: false }],
      ...['a', 'b'].map(
        (id) =>
          [
            id,
            { prefix: { position: 1, observedThrough: 1000, link: id }, conflict: false },
          ] as const,
      ),
    ]);
    const own = { publisher: 'self', pending: false, peerBacklog: true };
    const seen: string[] = [];
    let quietAfterExpiry = false;
    for (let i = 0; i < 80; i++) {
      now += 25;
      const id = s.next(names, own, { context, peers });
      seen.push(id);
      const token = id === 'quiet' ? s.captureQuiet(context, id, peers.get(id)!) : undefined;
      if (id === 'quiet' && now >= 1800) quietAfterExpiry = true;
      s.completed(names, id, id === 'a' || id === 'b', id === 'self');
      s.completedQuiet(token, id === 'quiet' ? 'empty' : 'received');
    }
    expect(quietAfterExpiry).toBe(true);
    expect(seen).toContain('a');
    expect(seen).toContain('b');
    expect(seen.join(',')).not.toMatch(/(a,){4}a|(b,){4}b/);
  }
});

it('uses the certified baseline cursor resolver when an empty stream has no stored peer entry', () => {
  const f = quietFixture();
  f.s.completedQuiet(f.token(), 'empty');
  let calls = 0;
  f.s.completed(f.publishers, 'busy', false);
  expect(
    f.s.next(f.publishers, f.own, {
      context: f.context,
      peers: undefined,
      cursor: (id: string) => {
        calls++;
        return f.peers.get(id);
      },
    }),
  ).toBe('busy');
  expect(calls).toBe(1);
});

it('keeps optional quiet deferral disabled in the default selector', () => {
  const f = quietFixture();
  const s = createReceiveSelection(() => 1000);
  expect(s.captureQuiet(f.context, 'quiet', f.peers.get('quiet')!)).toBeUndefined();
  expect(s.completedQuiet({}, 'empty')).toBe(false);
  s.completed(f.publishers, 'busy', false);
  expect(s.next(f.publishers, f.own, f.view)).toBe('quiet');
});
