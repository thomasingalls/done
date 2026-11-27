// Phase 551: each history refusal the in-process service can produce reaches the client through
// the application's own scoped transport and the real HTTP route, is named by its code and
// sentence, and changes no saved progress, catalog or saved snapshot classification. A service
// that gave no usable answer still says to check the connection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { devices } from './devices-fixture.mjs';
import { setup, largestInstallable } from './service-fixture.mjs';
import { historyHttp } from './http-fixture.mjs';
import { client as c } from './client.mjs';

const CONNECTION = 'Check your connection';
const NOT_CONNECTION = 'This is not a problem with your connection.';
const brief = (s) => ({ pending: s.pending, saved: s.saved, canDiscard: s.canDiscard });
/** How a failed command ends on the page: the Worker's coded failure and the sentence it shows. */
async function failure(promise) {
  let cause;
  try {
    await promise;
  } catch (e) {
    cause = e;
  }
  assert(cause, 'the command was refused');
  const shown = c.historyCommandFailure(cause);
  // The Worker channel passes only an own `code` property of lowercase letters and hyphens.
  assert.equal(Object.getOwnPropertyDescriptor(shown, 'code')?.value, shown.code);
  assert.match(shown.code, /^[a-z-]{1,64}$/);
  return { code: shown.code, sentence: c.historyFailureMessage(shown), cause };
}
/** A named service refusal: its own sentence, never the connection one, retried as before. */
function named(r, code) {
  assert.equal(r.code, code, r.cause?.message);
  assert.equal(r.sentence, c.HISTORY_FAILURE_MESSAGES[code]);
  assert(!r.sentence.includes(CONNECTION), r.sentence);
  assert(r.cause instanceof c.HistoryTransportUnavailable, 'automatic maintenance retries it');
}
const state = (f, d) => ({ saved: d.saved(), catalog: f.catalog(), rows: f.rows() });
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const history = (path) => path === '/account/history/v1/checkpoint';

test('busy: a snapshot sent while another device’s waits is refused by name, and resending changes nothing', async (t) => {
  t.mock.method(Date, 'now', () => 1000);
  const f = await devices(t, 2, { http: true });
  await f.upload(2);
  const [A, B] = f.devices;
  B.beforeSend(async (r) => {
    if (r.action !== 'publish') return;
    B.beforeSend(null);
    assert.equal((await A.run('create')).pending, 'waiting');
  });
  named(await failure(B.run('create')), 'history-checkpoint-busy');
  const before = state(f, B);
  named(await failure(B.run('resume')), 'history-checkpoint-busy');
  assert.deepEqual(state(f, B), before);
  // The sentence's action: checking history shows the snapshot to verify first.
  assert.deepEqual(brief(await B.run('inspect')), {
    pending: 'resume',
    saved: 'blocked',
    canDiscard: true,
  });
});

test('cancelled: progress from before a discard is refused by name when resent; discarding it here ends it', async (t) => {
  t.mock.method(Date, 'now', () => 1000);
  const f = await devices(t, 2, { http: true });
  await f.upload(2);
  const [A] = f.devices;
  let earlier;
  A.beforeSend((r) => {
    if (r.action === 'publish') earlier = A.saved();
  });
  assert.equal((await A.run('create')).pending, 'waiting');
  A.beforeSend(null);
  assert.equal((await A.run('discard')).pending, 'none');
  // A copy of this device's progress saved before the discard, as an older build could leave.
  A.setSaved(earlier);
  const before = state(f, A);
  named(await failure(A.run('resume')), 'history-checkpoint-cancelled');
  assert.deepEqual(state(f, A), before);
  assert.equal((await A.run('discard')).pending, 'none');
  assert.deepEqual([A.saved().attempt, A.saved().discard], [null, null]);
  assert.equal((await A.run('create')).pending, 'waiting');
});

test('conflict: discarding a snapshot another device verified meanwhile is refused by name, then ends cleanly', async (t) => {
  t.mock.method(Date, 'now', () => 1000);
  const f = await devices(t, 2, { http: true });
  await f.upload(2);
  const [A, B] = f.devices;
  assert.equal((await A.run('create')).pending, 'waiting');
  A.beforeSend(async (r) => {
    if (r.action !== 'discard') return;
    A.beforeSend(null);
    assert.equal((await B.run('verify')).sequence, 1);
    await f.upload(1);
    assert.equal((await B.run('create')).pending, 'waiting');
  });
  named(await failure(A.run('discard')), 'history-checkpoint-conflict');
  // Check history: the other snapshot is offered for verification, and verifying ends it.
  assert.deepEqual(brief(await A.run('inspect')), {
    pending: 'verify',
    saved: 'cancelling',
    canDiscard: false,
  });
  assert.equal((await A.run('verify')).sequence, 2);
  assert.deepEqual([A.saved().attempt, A.saved().discard], [null, null]);
});

test('boundary changed: pruning after a newer snapshot was verified is refused by name and removes nothing', async (t) => {
  t.mock.method(Date, 'now', () => 1000);
  const f = await devices(t, 2, { http: true });
  await f.upload(2);
  const [A, B] = f.devices;
  assert.equal((await A.run('create')).pending, 'waiting');
  assert.equal((await B.run('verify')).sequence, 1);
  assert.equal((await A.run('resume')).pending, 'none');
  await f.upload(1);
  assert.equal((await B.run('create')).pending, 'waiting');
  assert.equal((await A.run('verify')).sequence, 2);
  assert.equal((await B.run('resume')).pending, 'none');
  await f.upload(1);
  let kept;
  A.beforeSend(async (r) => {
    if (r.action !== 'prune') return;
    A.beforeSend(null);
    assert.equal((await B.run('create')).pending, 'waiting');
    assert.equal((await A.run('verify')).sequence, 3);
    kept = state(f, A);
  });
  named(await failure(A.run('prune')), 'history-retention-boundary-changed');
  assert.deepEqual(state(f, A), kept);
  // The sentence's action: prune again.
  assert.equal((await A.run('prune')).pruned, true);
});

test('too large: a snapshot an earlier build sends past the install bound is refused by name and not kept', async (t) => {
  t.mock.method(Date, 'now', () => 1000);
  const f = await setup(t);
  const exchange = (await historyHttp(t, f)).connect(f.membership, f.credential, f.signer);
  const over = await f.sized((await largestInstallable(f)) + 1);
  named(
    await failure(exchange(await f.makeRequest('publish', over.cp))),
    'history-checkpoint-too-large',
  );
  assert.equal(f.f.rows('history_checkpoint_records').length, 0);
});

test('sign-in required: a session ended on the service is named, and nothing changes until it is renewed', async (t) => {
  t.mock.method(Date, 'now', () => 1000);
  const f = await devices(t, 2, { http: true });
  await f.upload(2);
  const [A] = f.devices;
  assert.equal((await A.run('create')).pending, 'waiting');
  const before = state(f, A);
  f.network.revoke();
  named(await failure(A.run('inspect')), 'history-sign-in-required');
  assert.equal(f.network.status, 'reconnect', 'the login is asked for a passkey');
  assert.deepEqual(state(f, A), before);
});

test('capacity: a busy service is named after the transport’s own retries, and nothing changes', async (t) => {
  t.mock.method(Date, 'now', () => 1000);
  const f = await devices(t, 2, { http: true });
  await f.upload(2);
  const [A] = f.devices;
  assert.equal((await A.run('create')).pending, 'waiting');
  const before = state(f, A);
  f.network.throttle(true);
  named(await failure(A.run('inspect')), 'history-capacity');
  assert.deepEqual(state(f, A), before);
  f.network.throttle(false);
  assert.equal((await A.run('inspect')).pending, 'resume');
});

test('controls: no reply, a timeout and a non-JSON reply still say check your connection; nothing changes', async (t) => {
  t.mock.method(Date, 'now', () => 1000);
  const f = await devices(t, 2, { http: true });
  await f.upload(2);
  const [A] = f.devices;
  assert.equal((await A.run('create')).pending, 'waiting');
  const before = state(f, A),
    classified = brief(await A.run('inspect'));
  const cases = [
    ['no reply', () => Promise.reject(new TypeError('fetch failed')), 'history-unreachable'],
    [
      'timeout',
      () => Promise.reject(new DOMException('The operation timed out.', 'TimeoutError')),
      'history-timeout',
    ],
    [
      'gateway page',
      () =>
        new Response('<html>Bad gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
      'history-unreachable',
    ],
    [
      'gateway page on an authorization status',
      () =>
        new Response('<html>Unavailable</html>', {
          status: 503,
          headers: { 'Content-Type': 'text/html' },
        }),
      'history-unreachable',
    ],
    ['JSON outside the closed list', () => json(409, { error: 'busy' }), 'history-unreachable'],
    [
      'refusal with an extra field',
      () => json(409, { ok: false, refusal: 'checkpoint-busy', retry: true }),
      'history-unreachable',
    ],
  ];
  for (const [name, reply, code] of cases) {
    f.network.intercept((path) => (history(path) ? reply() : undefined));
    const r = await failure(A.run('inspect'));
    assert.equal(r.code, code, name);
    assert(r.cause instanceof c.HistoryTransportUnavailable, name);
    assert.equal(r.sentence, c.HISTORY_FAILURE_MESSAGES[code], name);
    assert(r.sentence.includes(CONNECTION), name);
    assert.deepEqual(state(f, A), before, name);
  }
  f.network.intercept(null);
  assert.deepEqual(brief(await A.run('inspect')), classified);
});

test('controls: a forged or unknown refusal body chooses only a sentence; saved state and classification are unchanged', async (t) => {
  t.mock.method(Date, 'now', () => 1000);
  const f = await devices(t, 2, { http: true });
  await f.upload(2);
  const [A] = f.devices;
  assert.equal((await A.run('create')).pending, 'waiting');
  const before = state(f, A),
    classified = brief(await A.run('inspect'));
  const cases = [
    [
      'forged cancelled',
      409,
      { ok: false, refusal: 'checkpoint-cancelled' },
      'history-checkpoint-cancelled',
    ],
    [
      'forged too large',
      409,
      { ok: false, refusal: 'checkpoint-too-large' },
      'history-checkpoint-too-large',
    ],
    ['unknown reason', 409, { ok: false, refusal: 'checkpoint-vanished' }, 'history-refused'],
    ['malformed reason', 409, { ok: false, refusal: 7 }, 'history-refused'],
    ['reason on the wrong status', 409, { ok: false, refusal: 'not-found' }, 'history-refused'],
    // An answer that does not verify keeps its own error, which halts receiving as before.
    ['unverifiable page', 200, { ok: true, page: {} }, 'history-reply-unverified'],
  ];
  for (const command of ['resume', 'discard', 'inspect'])
    for (const [name, status, body, code] of cases) {
      f.network.intercept((path) => (history(path) ? json(status, body) : undefined));
      const r = await failure(A.run(command));
      assert.equal(r.code, code, `${command}: ${name}`);
      assert.equal(
        r.cause instanceof c.HistoryTransportUnavailable,
        status !== 200,
        `${command}: ${name}`,
      );
      assert.equal(r.sentence, c.HISTORY_FAILURE_MESSAGES[code]);
      if (code === 'history-refused') assert(r.sentence.includes(NOT_CONNECTION));
      f.network.intercept(null);
      assert.deepEqual(state(f, A), before, `${command}: ${name}`);
      assert.deepEqual(brief(await A.run('inspect')), classified, `${command}: ${name}`);
    }
});

for (const first of ['inspect', 'discard'])
  test(`a discard whose reply was lost, then another device publishing: ${first} keeps the cancellation and offers verifying (HIST-OTHER)`, async (t) => {
    t.mock.method(Date, 'now', () => 1000);
    const f = await devices(t, 2, { http: true });
    await f.upload(2);
    const [A, B] = f.devices;
    assert.equal((await A.run('create')).pending, 'waiting');
    const mine = await c.historyCheckpointHash(A.saved().attempt.checkpoint);
    A.afterSend((r) => {
      if (r.action === 'discard') throw Error('reply lost');
    });
    await assert.rejects(A.run('discard'), /reply lost/);
    A.afterSend(null);
    // The service recorded the cancellation, so another device can publish.
    assert.equal((await B.run('create')).pending, 'waiting');
    // A's saved catalog still shows its own snapshot pending, and Discard may still be on screen.
    assert.deepEqual(brief(await A.run(first)), {
      pending: 'verify',
      saved: 'cancelling',
      canDiscard: false,
    });
    assert.equal(A.saved().discard, mine);
    const n = A.sent.length;
    assert.equal((await A.run('verify')).sequence, 1);
    assert(!A.sent.slice(n).some((s) => s.startsWith('discard')), 'no refused resend');
    assert.deepEqual([A.saved().attempt, A.saved().discard], [null, null]);
    assert.equal((await B.run('resume')).pending, 'none');
    assert.deepEqual(brief(await A.run('inspect')), {
      pending: 'none',
      saved: undefined,
      canDiscard: false,
    });
  });

test('a forged conflict on a kept cancellation only prompts a fresh catalog; the cancellation is sent next time', async (t) => {
  t.mock.method(Date, 'now', () => 1000);
  const f = await devices(t, 2, { http: true });
  await f.upload(2);
  const [A] = f.devices;
  assert.equal((await A.run('create')).pending, 'waiting');
  A.afterSend((r) => {
    if (r.action === 'discard') throw Error('reply lost');
  });
  await assert.rejects(A.run('discard'), /reply lost/);
  A.afterSend(null);
  const before = state(f, A);
  let forged = 0;
  f.network.intercept((path, init) => {
    if (!history(path) || JSON.parse(init.body).action !== 'discard' || forged++) return;
    return json(409, { ok: false, refusal: 'checkpoint-conflict' });
  });
  const n = A.sent.length;
  named(await failure(A.run('resume')), 'history-checkpoint-conflict');
  assert.deepEqual(A.sent.slice(n), ['discard:', 'read:catalog'], 'one authenticated read');
  assert.deepEqual(state(f, A).saved.attempt, before.saved.attempt);
  assert.equal(A.saved().discard, before.saved.discard);
  assert.equal((await A.run('resume')).pending, 'none');
  assert.deepEqual([A.saved().attempt, A.saved().discard], [null, null]);
});

test('a login with no access says why: not connected, or the service’s own reason', async (t) => {
  t.mock.method(Date, 'now', () => 1000);
  const f = await setup(t);
  const net = await historyHttp(t, f);
  const exchange = net.connect(f.membership, f.credential, f.signer);
  for (const [problem, code] of [
    [undefined, 'history-sync-disconnected'],
    ['unreachable', 'history-unreachable'],
    ['busy', 'history-capacity'],
    ['unavailable', 'history-storage-unavailable'],
    ['outdated', 'history-malformed'],
    ['refused', 'history-refused'],
  ]) {
    net.disconnect(problem);
    const r = await failure(exchange(await f.makeRequest('read', 'latest')));
    assert.equal(r.code, code, String(problem));
    assert.equal(r.sentence.includes(CONNECTION), code === 'history-unreachable');
  }
});
