import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, largestInstallable } from './service-fixture.mjs';
import { client as c } from './client.mjs';
import { mutate } from '../account-successor/service-fixtures.mjs';
import { same } from '../../account-protocol/admission.ts';
async function client(t) {
  const f = await setup(t),
    authorities = new Map([[f.p.head, f.membership]]);
  let saved = null,
    prepares = 0,
    admits = 0,
    beforeSave = () => {},
    afterSend = () => {};
  const sent = [],
    signal = new AbortController();
  const owner = {
    get authority() {
      return f.membership;
    },
    credentialId: f.credential,
    async authorityAt(epoch, head) {
      const at = authorities.get(head);
      assert(at && c.membershipState(at).epoch === epoch);
      return at;
    },
    sign: f.signer,
    prepare(previous, heads) {
      prepares++;
      return f.create(previous, heads);
    },
    admit(cp) {
      admits++;
      return f.admit(cp);
    },
  };
  const io = {
    signal: signal.signal,
    now: () => 1000,
    load: async () => structuredClone(saved),
    replace: async (before, next) => {
      assert(same(before, saved));
      beforeSave(next);
      saved = structuredClone(next);
    },
    async exchange(request) {
      if (request.action === 'publish') assert(same(request.payload, saved.attempt.checkpoint));
      if (request.action === 'admit') assert(same(request.payload, saved.attempt.admission));
      if (request.action === 'discard') assert.equal(request.payload, saved.discard);
      sent.push(structuredClone(request));
      const reply = await f.exchange(request);
      assert.equal(reply.ok, true, JSON.stringify(reply));
      afterSend(request, reply);
      return reply.page;
    },
  };
  return {
    ...f,
    owner,
    io,
    sent,
    signal,
    run: (command) => c.runHistoryMaintenance(owner, command, io),
    saved: () => structuredClone(saved),
    replaceSaved: (next) => {
      saved = structuredClone(next);
    },
    stats: () => ({ prepares, admits }),
    beforeSave: (fn) => {
      beforeSave = fn;
    },
    afterSend: (fn) => {
      afterSend = fn;
    },
    async advance() {
      await f.advance();
      authorities.set(f.p.head, f.membership);
    },
  };
}
for (const action of ['publish', 'admit'])
  test(`client reopens exact ${action} attempt after a lost reply and service restart`, async (t) => {
    const f = await client(t);
    f.afterSend((request) => {
      if (request.action === action) throw Error('lost reply');
    });
    await assert.rejects(f.run('create'), /lost reply/);
    const attempt = f.saved().attempt;
    assert(attempt);
    f.f.restart();
    f.authority.restart();
    f.afterSend(() => {});
    assert.equal((await f.run('resume')).sequence, 1);
    assert.equal(f.saved().attempt, null);
    assert.equal(f.stats().prepares, 1);
    assert.equal(f.stats().admits, 1);
    assert.equal(f.f.rows('history_checkpoint_records').length, 1);
    assert.deepEqual(
      JSON.parse(f.f.rows('history_checkpoint_records')[0].checkpoint),
      attempt.checkpoint,
    );
    assert.equal((await f.run('inspect')).sequence, 1);
    assert.equal(f.stats().prepares, 1, 'inspection never prepares another snapshot');
  });
test('failed progress persistence never publishes, while later attempts remain repeatable', async (t) => {
  const f = await client(t);
  f.beforeSave((next) => {
    if (next.attempt) throw Error('storage full');
  });
  await assert.rejects(f.run('create'), /storage full/);
  assert(!f.sent.some((r) => r.action === 'publish' || r.action === 'admit'));
  f.beforeSave(() => {});
  assert.equal((await f.run('create')).sequence, 1);
  f.doc.getText('master').insert(0, 'later ');
  const head = await f.upload(1, 'later');
  assert.equal((await f.run('create')).sequence, 2);
  const second = JSON.parse(f.f.rows('history_checkpoint_records')[1].checkpoint);
  assert.deepEqual(second.heads, [head]);
  assert.equal(f.f.rows('delivery_decisions').length, 1, 'client maintenance does not prune');
});
test('untrusted replies and wrong-owner progress cannot clear a retained attempt', async (t) => {
  const f = await client(t);
  f.afterSend((request, reply) => {
    if (request.action === 'publish') reply.page.signature = '00'.repeat(64);
  });
  await assert.rejects(f.run('create'));
  const saved = f.saved();
  assert(saved.attempt);
  f.afterSend(() => {});
  f.replaceSaved({ ...saved, credentialId: 'ff'.repeat(16) });
  await assert.rejects(f.run('resume'), /another owner/);
  f.replaceSaved(saved);
  assert.equal((await f.run('resume')).pending, 'none');
});
test('stale attempts preserve progress until explicitly cancelled; a lost cancellation reply resumes cancellation', async (t) => {
  const f = await client(t);
  f.afterSend((request) => {
    if (request.action === 'publish') throw Error('lost reply');
  });
  await assert.rejects(f.run('create'));
  const cp = f.saved().attempt.checkpoint;
  await f.advance();
  f.afterSend(() => {});
  assert.equal((await f.run('inspect')).pending, 'stale');
  f.afterSend((request) => {
    if (request.action === 'discard') throw Error('cancel reply lost');
  });
  await assert.rejects(f.run('discard'), /cancel reply lost/);
  assert.equal(f.saved().discard, await c.historyCheckpointHash(cp));
  const n = f.sent.length;
  f.f.restart();
  f.authority.restart();
  f.afterSend(() => {});
  assert.equal((await f.run('resume')).pending, 'none');
  assert.deepEqual(
    f.sent.slice(n).map((r) => r.action),
    ['discard'],
  );
  assert.equal(f.saved().attempt, null);
});
test('cancelling an unsent proposal fences a delayed original publication', async (t) => {
  const f = await client(t);
  const original = f.io.exchange;
  f.io.exchange = async (request) => {
    if (request.action === 'publish') throw Error('not sent');
    return original(request);
  };
  await assert.rejects(f.run('create'), /not sent/);
  const cp = f.saved().attempt.checkpoint;
  f.io.exchange = original;
  assert.equal((await f.run('discard')).pending, 'none');
  const late = await f.makeRequest('publish', cp);
  assert.equal((await f.exchange(late)).refusal, 'checkpoint-cancelled');
  assert.equal(f.f.rows('history_checkpoint_records').length, 0);
  assert.equal(
    (await f.run('create')).sequence,
    1,
    'a new snapshot may reuse the unadmitted sequence',
  );
});
test('catalog rollback and progress changes during async signing refuse', async (t) => {
  const f = await client(t);
  let old;
  f.afterSend((request, reply) => {
    if (!old && request.action === 'read') old = structuredClone(reply.page.catalog);
  });
  await f.run('create');
  const saved = f.saved();
  // A signed old catalog cannot replace the locally authenticated higher sequence.
  mutate(f, (db) => {
    db.exec('DELETE FROM history_checkpoint_records');
    db.prepare('UPDATE history_checkpoint_catalog SET value=?').run(JSON.stringify(old));
  });
  await assert.rejects(f.run('inspect'), /regressed or forked/);
  assert.deepEqual(f.saved(), saved);
  f.afterSend(() => {});
  const sign = f.owner.sign;
  f.owner.sign = async (b) => {
    const r = await sign(b);
    f.replaceSaved(null);
    return r;
  };
  await assert.rejects(f.run('inspect'), /progress changed/);
});

test('explicit pruning requires two snapshots and retries an uncertain reply without losing saved progress', async (t) => {
  const f = await client(t);
  await f.run('create');
  await assert.rejects(f.run('prune'), /two unchanged admitted snapshots/);
  await f.run('create');
  f.afterSend((request) => {
    if (request.action === 'prune') throw Error('prune reply lost');
  });
  await assert.rejects(f.run('prune'), /prune reply lost/);
  f.f.restart();
  f.authority.restart();
  f.afterSend(() => {});
  const status = await f.run('prune');
  assert.equal(status.pruned, true);
  assert.equal(status.sequence, 2);
  assert.equal(f.saved().attempt, null);
  assert.equal(f.sent.filter((r) => r.action === 'prune').length, 2);
});

test('a retained old admission resolves after its snapshot ciphertext has been pruned', async (t) => {
  const f = await client(t);
  f.afterSend((r) => {
    if (r.action === 'admit') throw Error('admission reply lost');
  });
  await assert.rejects(f.run('create'), /admission reply lost/);
  const oldProgress = f.saved();
  f.afterSend(() => {});
  await f.run('resume');
  await f.run('create');
  await f.run('create');
  await f.run('prune');
  for (const command of ['resume', 'discard']) {
    f.replaceSaved(oldProgress);
    const completed = await f.run(command);
    assert.equal(completed.sequence, 3);
    assert.equal(f.saved().attempt, null);
  }
});

test('creation refuses a snapshot devices cannot install before saving or sending anything; the largest one is published and admitted', async (t) => {
  const f = await client(t);
  const largest = await largestInstallable(f);
  let snapshot = await f.sized(largest + 1);
  f.owner.prepare = async () => snapshot.cp;
  const refused = await f.run('create');
  assert.deepEqual(refused, {
    sequence: 0,
    pending: 'none',
    canDiscard: false,
    tooLarge: {
      snapshot: 'new',
      needed: c.historyInstallBytes(snapshot.cp),
      allowed: c.HISTORY_INSTALL_LIMIT,
    },
  });
  assert(refused.tooLarge.needed > refused.tooLarge.allowed);
  assert.deepEqual(
    f.sent.map((r) => r.action + ':' + r.payload),
    ['read:latest', 'read:pending'],
  );
  assert.equal(f.saved().attempt, null);
  assert.equal(f.saved().discard, null);
  assert.equal(f.f.rows('history_checkpoint_records').length, 0);
  snapshot = await f.sized(largest);
  f.owner.prepare = async () => snapshot.cp;
  assert.deepEqual(await f.run('create'), { sequence: 1, pending: 'none', canDiscard: false });
  assert.equal(f.f.rows('history_checkpoint_records').length, 1);
  assert.equal(f.saved().attempt, null);
});
test('resuming a saved proposal too large to install sends nothing, and it can be discarded', async (t) => {
  const f = await client(t);
  const over = await f.sized((await largestInstallable(f)) + 1);
  await f.run('inspect');
  // An earlier build saved this proposal before publishing it.
  f.replaceSaved({ ...f.saved(), attempt: { checkpoint: over.cp, admission: null } });
  const n = f.sent.length;
  const status = await f.run('resume');
  assert.deepEqual(status, {
    sequence: 0,
    pending: 'resume',
    canDiscard: true,
    tooLarge: {
      snapshot: 'saved',
      needed: c.historyInstallBytes(over.cp),
      allowed: c.HISTORY_INSTALL_LIMIT,
    },
  });
  assert.deepEqual(f.sent.slice(n), []);
  assert.equal((await f.run('discard')).pending, 'none');
  assert.deepEqual(
    f.sent.slice(n).map((r) => r.action),
    ['read', 'read', 'discard'],
  );
  assert.equal(f.saved().attempt, null);
  const late = await f.makeRequest('publish', over.cp);
  assert.equal((await f.exchange(late)).refusal, 'checkpoint-cancelled');
});
test('verification never admits a pending snapshot too large to install, and inspection names it', async (t) => {
  const f = await client(t);
  const over = await f.sized((await largestInstallable(f)) + 1);
  await f.legacy([over], { pending: over.hash });
  const tooLarge = {
    snapshot: 'pending',
    needed: c.historyInstallBytes(over.cp),
    allowed: c.HISTORY_INSTALL_LIMIT,
  };
  assert.deepEqual(await f.run('inspect'), {
    tooLarge,
    // Phase 547: checking history also reports positions since the last admitted snapshot.
    positions: { since: 0, allowed: 4096 },
    sequence: 0,
    pending: 'verify',
    canDiscard: true,
  });
  assert.deepEqual(await f.run('verify'), {
    tooLarge,
    sequence: 0,
    pending: 'verify',
    canDiscard: true,
  });
  assert(!f.sent.some((r) => r.action === 'admit'));
  assert.equal(f.stats().admits, 0);
  assert.equal(f.saved().attempt, null);
  assert.equal(f.f.rows('history_checkpoint_records')[0].admission, null);
  assert.equal((await f.run('discard')).pending, 'none');
  assert.equal(f.f.rows('history_checkpoint_records').length, 0);
});
test('pruning is refused while the latest snapshot is too large to install', async (t) => {
  const f = await client(t);
  await f.run('create');
  const first = JSON.parse(f.f.rows('history_checkpoint_records')[0].checkpoint);
  const over = await f.sized((await largestInstallable(f)) + 100, first);
  await f.legacy([{ ...over, admitted: true }], {
    sequence: 2,
    latest: over.hash,
    previous: await c.historyCheckpointHash(first),
  });
  const tooLarge = {
    snapshot: 'latest',
    needed: c.historyInstallBytes(over.cp),
    allowed: c.HISTORY_INSTALL_LIMIT,
  };
  assert.deepEqual(await f.run('inspect'), {
    tooLarge,
    // Phase 547: checking history also reports positions since the last admitted snapshot.
    positions: { since: 0, allowed: 4096 },
    sequence: 2,
    pending: 'none',
    canDiscard: false,
  });
  const n = f.sent.length;
  assert.deepEqual(await f.run('prune'), {
    sequence: 2,
    pending: 'none',
    canDiscard: false,
    tooLarge,
  });
  assert(!f.sent.slice(n).some((r) => r.action === 'prune'));
});
test('a saved snapshot left behind by a membership change is named stale, offered for discard and cancelled (phase 547)', async (t) => {
  const f = await client(t);
  const original = f.io.exchange;
  f.io.exchange = async (request) => {
    if (request.action === 'publish') throw Error('not sent');
    return original(request);
  };
  await assert.rejects(f.run('create'), /not sent/);
  const cp = f.saved().attempt.checkpoint;
  f.io.exchange = original;
  await f.advance();
  const seen = await f.run('inspect');
  assert.equal(seen.pending, 'resume');
  assert.equal(seen.saved, 'stale');
  assert.equal(seen.canDiscard, true);
  const n = f.sent.length;
  assert.equal((await f.run('discard')).pending, 'none');
  assert.deepEqual(
    f.sent.slice(n).map((r) => r.action),
    ['read', 'read', 'discard'],
  );
  assert.deepEqual([f.saved().attempt, f.saved().discard], [null, null]);
  assert.equal((await f.exchange(await f.makeRequest('publish', cp))).ok, false);
  assert.equal((await f.run('create')).sequence, 1);
});
