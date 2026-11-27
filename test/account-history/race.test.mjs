// Phase 547: two or three devices create history snapshots at once, against the real service with
// a real credential per device. No device is left with a snapshot it can neither send nor discard,
// and only this device's own unadmitted snapshot is ever discarded from here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { devices } from './devices-fixture.mjs';
import { client as c } from './client.mjs';

const brief = (s) => ({ pending: s.pending, saved: s.saved, canDiscard: s.canDiscard });
const refusedAs = (refusal) => (e) => e?.refusal === refusal;
const discards = (d, from) => d.sent.slice(from).filter((s) => s.startsWith('discard'));

test('two devices creating at once: the one that finishes preparing second saves and sends nothing, then verifies the other', async (t) => {
  const f = await devices(t, 2);
  await f.upload(2);
  const [A, B] = f.devices;
  const held = B.hold();
  const second = B.run('create');
  await held.reached; // B has read the catalog and is preparing.
  assert.equal((await A.run('create')).pending, 'waiting');
  held.release();
  const raced = await second;
  assert.equal(raced.raced, true);
  assert.deepEqual(brief(raced), { pending: 'verify', saved: undefined, canDiscard: false });
  assert.equal(B.saved().attempt, null);
  assert(!B.sent.some((s) => s.startsWith('publish')), 'nothing was sent');
  assert.equal(f.rows().length, 1);
  assert.equal((await B.run('verify')).sequence, 1);
  assert.equal((await A.run('resume')).pending, 'none');
  assert.equal(A.saved().attempt, null);
  assert.deepEqual(brief(await A.run('inspect')), {
    pending: 'none',
    saved: undefined,
    canDiscard: false,
  });
});

/** B saves its proposal; A publishes in the moment before B sends it. */
async function blocked(f) {
  const [A, B] = f.devices;
  B.beforeSend(async (r) => {
    if (r.action !== 'publish') return;
    B.beforeSend(null);
    assert.equal((await A.run('create')).pending, 'waiting');
  });
  await assert.rejects(B.run('create'), refusedAs('checkpoint-busy'));
  const stuck = B.saved().attempt;
  assert(stuck && stuck.admission === null && stuck.checkpoint.manifest.producer === B.id);
  return stuck.checkpoint;
}

test('the two-device deadlock resolves: the device holding a snapshot it cannot send sees it, discards it here and verifies the other', async (t) => {
  const f = await devices(t, 2);
  await f.upload(2);
  const [A, B] = f.devices;
  const stuck = await blocked(f);
  // Each waits for the other: A's snapshot needs B to verify it, B's cannot be sent while A's waits.
  assert.deepEqual(brief(await B.run('inspect')), {
    pending: 'resume',
    saved: 'blocked',
    canDiscard: true,
  });
  assert.deepEqual(brief(await A.run('inspect')), {
    pending: 'resume',
    saved: 'waiting',
    canDiscard: true,
  });
  await assert.rejects(B.run('resume'), refusedAs('checkpoint-busy'));
  const n = B.sent.length;
  assert.deepEqual(brief(await B.run('discard')), {
    pending: 'verify',
    saved: 'cancelling',
    canDiscard: false,
  });
  // The service would refuse a cancellation while A's snapshot is pending: none is sent yet.
  assert.deepEqual(discards(B, n), []);
  assert.equal(B.saved().attempt, null);
  assert.equal(B.saved().discard, await c.historyCheckpointHash(stuck));
  assert.equal((await B.run('verify')).sequence, 1);
  // With A's snapshot latest, B's discarded one can never be published; nothing is left to send.
  assert.equal(B.saved().attempt, null);
  assert.equal(B.saved().discard, null);
  assert.deepEqual(discards(B, n), []);
  assert.equal((await A.run('resume')).pending, 'none');
  assert.equal(A.saved().attempt, null);
  for (const d of [A, B])
    assert.deepEqual(brief(await d.run('inspect')), {
      pending: 'none',
      saved: undefined,
      canDiscard: false,
    });
  assert.equal((await B.request('publish', stuck)).ok, false);
  assert.deepEqual(
    f.rows().map((r) => [r.sequence, r.admission !== null]),
    [[1, true]],
  );
});

test('a cancellation kept for later is recorded once the other device discards its snapshot instead', async (t) => {
  const f = await devices(t, 2);
  await f.upload(2);
  const [A, B] = f.devices;
  const stuck = await blocked(f);
  assert.equal((await B.run('discard')).saved, 'cancelling');
  assert.equal((await A.run('discard')).pending, 'none');
  assert.equal(f.rows().length, 0);
  // Nothing pending now, so B can record the cancellation and is asked to.
  assert.deepEqual(brief(await B.run('inspect')), {
    pending: 'resume',
    saved: 'cancelling',
    canDiscard: true,
  });
  const n = B.sent.length;
  assert.equal((await B.run('discard')).pending, 'none');
  assert.deepEqual(discards(B, n), ['discard:']);
  assert.deepEqual([B.saved().attempt, B.saved().discard], [null, null]);
  // A delayed delivery of B's discarded proposal cannot bring it back.
  assert.equal((await B.request('publish', stuck)).refusal, 'checkpoint-cancelled');
  await f.upload(1);
  assert.equal((await B.run('create')).pending, 'waiting');
  assert.equal((await A.run('verify')).sequence, 1);
});

test('three devices: a snapshot verified by the third leaves the loser superseded; it discards it here and verifies the next', async (t) => {
  const f = await devices(t, 3);
  await f.upload(2);
  const [A, B, C] = f.devices;
  B.beforeSend(async (r) => {
    if (r.action !== 'publish') return;
    B.beforeSend(null);
    assert.equal((await A.run('create')).pending, 'waiting');
    assert.equal((await C.run('verify')).sequence, 1);
  });
  await assert.rejects(B.run('create'), refusedAs('unavailable'));
  const stuck = B.saved().attempt.checkpoint;
  const seen = await B.run('inspect');
  assert.deepEqual(brief(seen), { pending: 'resume', saved: 'superseded', canDiscard: true });
  assert.equal(seen.sequence, 1);
  await assert.rejects(B.run('resume'), refusedAs('unavailable'));
  // A's next proposal is pending, so the service would refuse a cancellation; none is needed,
  // because B's snapshot names a parent that is no longer latest.
  assert.equal((await A.run('resume')).pending, 'none');
  await f.upload(1);
  assert.equal((await A.run('create')).pending, 'waiting');
  assert.deepEqual(brief(await B.run('inspect')), {
    pending: 'resume',
    saved: 'superseded',
    canDiscard: true,
  });
  const n = B.sent.length;
  assert.deepEqual(brief(await B.run('discard')), {
    pending: 'verify',
    saved: undefined,
    canDiscard: false,
  });
  assert.deepEqual(discards(B, n), []);
  assert.deepEqual([B.saved().attempt, B.saved().discard], [null, null]);
  assert.equal((await B.request('publish', stuck)).ok, false);
  assert.equal((await B.run('verify')).sequence, 2);
  // The loser makes the next snapshot, and another device verifies it.
  await f.upload(1);
  assert.equal((await B.run('create')).pending, 'waiting');
  assert.equal((await C.run('verify')).sequence, 3);
  assert.equal((await A.run('resume')).pending, 'none');
});

test('every saved snapshot of this device that no device admitted can be discarded: not sent, and waiting', async (t) => {
  const f = await devices(t, 2);
  await f.upload(2);
  const [A] = f.devices;
  A.beforeSend((r) => {
    if (r.action !== 'publish') return;
    A.beforeSend(null);
    throw Error('request lost');
  });
  await assert.rejects(A.run('create'), /request lost/);
  const unsent = A.saved().attempt.checkpoint;
  assert.deepEqual(brief(await A.run('inspect')), {
    pending: 'resume',
    saved: 'sendable',
    canDiscard: true,
  });
  let n = A.sent.length;
  assert.equal((await A.run('discard')).pending, 'none');
  assert.deepEqual(discards(A, n), ['discard:']);
  assert.equal(A.saved().attempt, null);
  assert.equal((await A.request('publish', unsent)).refusal, 'checkpoint-cancelled');
  assert.equal((await A.run('create')).pending, 'waiting');
  assert.deepEqual(brief(await A.run('inspect')), {
    pending: 'resume',
    saved: 'waiting',
    canDiscard: true,
  });
  n = A.sent.length;
  assert.equal((await A.run('discard')).pending, 'none');
  assert.deepEqual(discards(A, n), ['discard:']);
  assert.equal(A.saved().attempt, null);
  assert.equal(f.rows().length, 0);
});

test('an admitted snapshot, or another device’s waiting snapshot, is never discarded from here', async (t) => {
  const f = await devices(t, 2);
  await f.upload(2);
  const [A, B] = f.devices;
  assert.equal((await A.run('create')).pending, 'waiting');
  // Someone else's snapshot that is still current.
  assert.deepEqual(brief(await B.run('inspect')), {
    pending: 'verify',
    saved: undefined,
    canDiscard: false,
  });
  await assert.rejects(B.run('discard'), /Only the producer can cancel/);
  assert.deepEqual(discards(B, 0), []);
  assert.deepEqual(
    f.rows().map((r) => r.admission),
    [null],
  );
  // This device's saved admission whose reply was lost reconciles; it is not discarded.
  B.afterSend((r) => {
    if (r.action !== 'admit') return;
    B.afterSend(null);
    throw Error('reply lost');
  });
  await assert.rejects(B.run('verify'), /reply lost/);
  assert(B.saved().attempt.admission);
  assert.deepEqual(brief(await B.run('inspect')), {
    pending: 'resume',
    saved: undefined,
    canDiscard: false,
  });
  let n = B.sent.length;
  assert.equal((await B.run('discard')).pending, 'none');
  assert.deepEqual(
    B.sent.slice(n).filter((s) => !s.startsWith('read')),
    ['admit:'],
  );
  assert.equal(B.saved().attempt, null);
  // This device's own snapshot, admitted by B while A's reply was lost, reconciles too.
  assert.deepEqual(brief(await A.run('inspect')), {
    pending: 'resume',
    saved: undefined,
    canDiscard: false,
  });
  n = A.sent.length;
  assert.equal((await A.run('discard')).pending, 'none');
  assert.deepEqual(
    A.sent.slice(n).filter((s) => !s.startsWith('read')),
    ['publish:'],
  );
  assert.equal(A.saved().attempt, null);
  assert.deepEqual(
    f.rows().map((r) => [r.sequence, r.admission !== null]),
    [[1, true]],
  );
});
