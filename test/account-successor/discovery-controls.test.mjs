import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ready, mutate, discoveryQuery, discoveryProof } from './discovery-fixtures.mjs';
import { worker, deadline } from './process-fixtures.mjs';

test(
  'omitting the final snapshot comparison returns a signed locator after the account becomes ineligible',
  { timeout: 15000 },
  async (t) => {
    const parent = resolve('test-results/account-successor-discovery-controls');
    mkdirSync(parent, { recursive: true });
    const dir = mkdtempSync(join(parent, 'mutant-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    for (const folder of ['account-protocol', 'account-service']) {
      mkdirSync(join(dir, folder));
      for (const file of readdirSync(folder).filter((f) => f.endsWith('.ts'))) {
        let source = readFileSync(join(folder, file), 'utf8');
        if (folder === 'account-service' && file === 'discovery.ts') {
          const anchor =
            'snapshotBytes(snapshot(db, request.workspaceId)) !== snapshotBytes(before)';
          assert.equal(source.split(anchor).length, 2);
          source = source.replace(anchor, 'false');
        }
        writeFileSync(join(dir, folder, file), source);
      }
    }
    for (const omitted of [false, true]) {
      const x = await ready(t),
        request = discoveryQuery(x),
        slow = await worker(
          t,
          x,
          'after-verify',
          'pause',
          omitted ? dir : process.cwd(),
          'discover-authority',
        );
      const hit = deadline(once(slow.child, 'message'));
      slow.child.send({ operation: 'discover', input: request });
      assert.equal((await hit)[0].paused, true);
      mutate(x, (db) => db.exec("UPDATE accounts SET state='pending'"));
      const reply = deadline(once(slow.child, 'message'));
      slow.child.kill('SIGCONT');
      const result = (await reply)[0].result;
      if (omitted) discoveryProof(x, result, request, null);
      else assert.equal(result.ok, false);
      await slow.close();
    }
  },
);
