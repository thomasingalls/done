import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPublicKey, verify } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ready, decision } from './service-fixtures.mjs';
import { message } from './oracle.mjs';
import { worker, deadline } from './process-fixtures.mjs';

for (const control of ['delivery-snapshot', 'prepared-row'])
  test(
    `omitting final ${control} comparison returns a signed forbidden admission`,
    { timeout: 15000 },
    async (t) => {
      const parent = resolve('test-results/account-successor-service-controls');
      mkdirSync(parent, { recursive: true });
      const dir = mkdtempSync(join(parent, 'mutant-'));
      t.after(() => rmSync(dir, { recursive: true, force: true }));
      for (const folder of ['account-protocol', 'account-service']) {
        mkdirSync(join(dir, folder));
        for (const name of readdirSync(folder).filter((n) => n.endsWith('.ts'))) {
          let text = readFileSync(join(folder, name), 'utf8');
          if (folder === 'account-service' && name === 'successor.ts') {
            const from =
              control === 'delivery-snapshot'
                ? 'snapshotBytes(current.delivery) !== snapshotBytes(delivery)'
                : 'JSON.stringify(current.row) !== JSON.stringify(row)';
            assert.equal(text.split(from).length, 2, 'unique final comparison');
            text = text.replace(from, 'false');
          }
          writeFileSync(join(dir, folder, name), text);
        }
      }
      for (const mutant of [false, true]) {
        const x = await ready(t),
          p = await x.prepare(),
          slow = await worker(t, x, 'after-verify', 'pause', mutant ? dir : process.cwd());
        const stopped = deadline(once(slow.child, 'message'));
        slow.child.send({ operation: 'admit', input: p.input });
        assert.equal((await stopped)[0].paused, true);
        if (control === 'delivery-snapshot') {
          const w = x.make();
          decision(x, await x.call(w), w);
        } else
          assert.equal(
            (await x.enroll('cancel', { retryKey: p.input.retryKey })).stage,
            'cancelled',
          );
        const resumed = deadline(once(slow.child, 'message'));
        slow.child.kill('SIGCONT');
        const r = (await resumed)[0].result;
        if (!mutant) {
          if (control === 'delivery-snapshot')
            assert.equal(r.epoch.heads.find((h) => h.credentialId === x.credential).position, 1);
          else assert.equal(r.refusal, 'cancelled');
        } else {
          assert.equal(r.kind, 'device-admission-successor', JSON.stringify(r));
          const pub = createPublicKey({
            key: Buffer.from('302a300506032b6570032100' + x.authority.pin.authRoot, 'hex'),
            type: 'spki',
            format: 'der',
          });
          assert(
            verify(
              null,
              message('done/admission-successor/v1', r.epoch),
              pub,
              Buffer.from(r.signature, 'hex'),
            ),
          );
          if (control === 'delivery-snapshot') {
            assert.equal(r.epoch.heads.find((h) => h.credentialId === x.credential).position, 0);
            assert.equal(x.f.rows('delivery_decisions')[0].position, 1);
            assert.equal(
              (await x.call(x.make(2))).kind,
              'unknown',
              'stale boundary breaks subsequent census',
            );
          } else assert.equal(x.f.rows('enrollment_preparations')[0].stage, 'cancelled');
          assert.equal(x.f.rows('workspace_successors').length, 1);
        }
        await slow.close();
      }
    },
  );
