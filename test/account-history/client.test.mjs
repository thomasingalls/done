import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './service-fixture.mjs';
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
