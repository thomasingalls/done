/** Disposable real service process. IPC belongs only to fixture orchestration/calibration. */
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createPrivateAccountServer } from '../../account-service/private-server.ts';
import { PrivateAuthority } from '../../account-service/authority.ts';
let server, key, dir;
process.on('message', async ({ id, method, args }) => {
  try {
    let result = null;
    if (method === 'start') {
      dir = args.dir;
      key = randomBytes(32);
      let pin;
      server = await createPrivateAccountServer({
        path: join(dir, 'core.sqlite'),
        token: args.token,
        authority(policy) {
          pin = PrivateAuthority.initialize(join(dir, 'authority.sqlite'), policy, key);
          return PrivateAuthority.open(join(dir, 'authority.sqlite'), pin, key);
        },
      });
      result = { origin: server.origin, pin };
    } else if (method === 'plant') {
      for (const [name, rows] of Object.entries(args)) {
        const db = new DatabaseSync(join(dir, name + '.sqlite'));
        try {
          db.exec('CREATE TABLE "unexpected-neutral-probe" (id TEXT PRIMARY KEY,value BLOB);');
          const put = db.prepare('INSERT INTO "unexpected-neutral-probe" VALUES(?,?)');
          for (const row of rows) put.run(row.id, row.text ?? Buffer.from(row.raw, 'base64'));
        } finally {
          db.close();
        }
      }
    } else if (method === 'diagnostic') {
      console.log(args.text);
    } else if (method === 'barrier') {
      await new Promise((r) => process.stdout.write('\nRESIDUE-FENCE:' + id + '\n', r));
      await new Promise((r) => process.stderr.write('\nRESIDUE-FENCE:' + id + '\n', r));
    } else if (method === 'close') {
      await server?.close();
      key?.fill(0);
    } else throw Error('Unknown fixture method');
    process.send({ id, result });
    if (method === 'close') process.disconnect();
  } catch (e) {
    process.send({ id, error: e.message });
  }
});
