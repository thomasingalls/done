import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { ready, inventory } from '../account-service-delivery/fixtures.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { envelope } from '../account-transport/oracle.mjs';
import { query, read, pageProof, hash } from './oracle.mjs';
for (const cut of ['verified', 'signed'])
  test(
    `service SIGKILL after ${cut} read leaves no writes and retry returns originals`,
    { timeout: 12000 },
    async (t) => {
      const x = await ready(t),
        w = x.make(),
        r = await x.call(w),
        q = query(x);
      const before = inventory(x),
        child = fork(
          new URL('./worker.mjs', import.meta.url),
          [
            x.f.path,
            x.authority.path,
            JSON.stringify(x.authority.pin),
            x.authority.key.toString('hex'),
            cut,
          ],
          { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'advanced' },
        );
      let errors = '';
      child.stderr.on('data', (b) => {
        errors += b;
      });
      t.after(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      });
      const readyMessage = await Promise.race([
        once(child, 'message'),
        once(child, 'exit').then(() => {
          throw Error(errors);
        }),
      ]);
      assert.equal(readyMessage[0].ready, true);
      let replies = 0;
      child.on('message', () => {
        replies++;
      });
      const death = once(child, 'exit');
      child.send({ bytes: q });
      const [code, signal] = await death;
      assert.equal(code, null);
      assert.equal(signal, 'SIGKILL');
      assert.equal(replies, 0);
      assert.equal(inventory(x), before);
      x.f.restart();
      x.authority.restart();
      const recovered = await read(x, q);
      pageProof(recovered, q, x, [{ w, r }]);
      if (process.env.ACCOUNT_REPORT_DIR)
        writeFileSync(
          join(process.env.ACCOUNT_REPORT_DIR, 'restart-' + cut + '.json'),
          JSON.stringify(
            {
              cut,
              code,
              signal,
              replies,
              before: hash(before),
              after: hash(inventory(x)),
              publicKey: x.offer.epoch.acceptancePublicKey,
              request: Buffer.from(q).toString('hex'),
              result: { kind: recovered.kind, bytes: Buffer.from(recovered.bytes).toString('hex') },
              originals: [
                {
                  envelope: Buffer.from(envelope(w)).toString('hex'),
                  result: { kind: r.kind, bytes: Buffer.from(r.bytes).toString('hex') },
                },
              ],
            },
            null,
            2,
          ) + '\n',
        );
      assert.equal(inventory(x), before);
    },
  );
