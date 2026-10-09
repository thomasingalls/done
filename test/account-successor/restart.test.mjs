import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { ready, decision, ZERO } from './service-fixtures.mjs';
import { worker, deadline } from './process-fixtures.mjs';
for (const point of ['before-commit', 'after-commit'])
  for (const history of [false, true])
    test(
      `SIGKILL ${point} admission with history=${history} recovers one complete authority`,
      { timeout: 15000 },
      async (t) => {
        const x = await ready(t),
          p = await x.prepare();
        let previous = ZERO;
        if (history) {
          const w = x.make();
          previous = decision(x, await x.call(w), w).head.link;
        }
        const a = await worker(t, x, point),
          death = deadline(once(a.child, 'exit'));
        a.child.send({ operation: 'admit', input: p.input });
        assert.deepEqual(await death, [null, 'SIGKILL']);
        assert.equal(x.f.rows('workspace_successors').length, point === 'before-commit' ? 0 : 1);
        const b = await worker(t, x),
          s = await b.call('admit', p.input);
        assert.equal(s.kind, 'device-admission-successor', JSON.stringify(s));
        assert.deepEqual(await b.call('admit', p.input), s);
        const w = x.make(history ? 2 : 1, 'after restart', { epoch: 2 });
        decision(x, await x.call(w), w, previous, 2);
        await b.close();
      },
    );
for (const action of ['delivery', 'cancel', 'competing-admission'])
  test(
    `another process ${action} while admission waits after verification`,
    { timeout: 15000 },
    async (t) => {
      const x = await ready(t),
        p = await x.prepare(),
        other = action === 'competing-admission' ? await x.prepare() : null;
      const slow = await worker(t, x, 'after-verify', 'pause'),
        fast = await worker(t, x);
      const paused = deadline(once(slow.child, 'message'));
      slow.child.send({ operation: 'admit', input: p.input });
      assert.equal((await paused)[0].paused, true);
      let link = ZERO;
      if (action === 'delivery') {
        const w = x.make(),
          r = await fast.call('submit', { workspaceId: x.workspace, bytes: w.bytes });
        link = decision(x, r, w).head.link;
      }
      if (action === 'cancel')
        assert.equal(
          (await fast.call('cancel', { retryKey: p.input.retryKey })).stage,
          'cancelled',
        );
      if (other)
        assert.equal((await fast.call('admit', other.input)).kind, 'device-admission-successor');
      const resumed = deadline(once(slow.child, 'message'));
      slow.child.kill('SIGCONT');
      const result = (await resumed)[0].result;
      if (action === 'delivery')
        assert.deepEqual(
          result.epoch.heads.find((h) => h.credentialId === x.credential),
          { credentialId: x.credential, position: 1, link },
        );
      else assert.equal(result.refusal, action === 'cancel' ? 'cancelled' : 'stale');
      assert.equal(x.f.rows('workspace_successors').length, action === 'cancel' ? 0 : 1);
      await slow.close();
      await fast.close();
    },
  );
