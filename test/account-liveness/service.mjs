import { registerHooks } from 'node:module';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { instrument } from './instrument.mjs';
import { installProbe } from './probe.mjs';
const hits = {};
registerHooks({
  load(url, context, next) {
    const r = next(url, context);
    if (url.endsWith('/account-service/delivery.ts'))
      return { ...r, source: instrument(String(r.source), url, hits) };
    return r;
  },
});
installProbe();
const { createPrivateAccountServer } = await import('../../account-service/private-server.ts');
const { PrivateAuthority } = await import('../../account-service/authority.ts');
let server, key;
process.on('message', async ({ id, method, args }) => {
  try {
    let result;
    if (method === 'start') {
      key = randomBytes(32);
      let pin;
      server = await createPrivateAccountServer({
        path: join(args.dir, 'core.sqlite'),
        token: args.token,
        authority(policy) {
          pin = PrivateAuthority.initialize(join(args.dir, 'authority.sqlite'), policy, key);
          return PrivateAuthority.open(join(args.dir, 'authority.sqlite'), pin, key);
        },
      });
      result = { origin: server.origin, pin, hits };
    } else if (method === 'reset') {
      livenessProbe.reset();
      result = null;
    } else if (method === 'metrics') result = livenessProbe.stop();
    else if (method === 'close') {
      await server?.close();
      key?.fill(0);
      result = null;
    } else throw Error('Unknown fixture method');
    process.send({ id, result });
    if (method === 'close') process.disconnect();
  } catch (e) {
    process.send({ id, error: e.stack });
  }
});
