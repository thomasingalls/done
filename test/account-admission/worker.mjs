import { AccountCore } from '../../account-service/core.ts';
import { PrivateAuthority } from '../../account-service/authority.ts';
const [path, rootPath, pinJSON, keyHex, point, operation] = process.argv.slice(2),
  pin = JSON.parse(pinJSON);
const core = new AccountCore(
  path,
  { origin: pin.origin, rpId: pin.rpId },
  {
    hook(at, kind) {
      if (at === point && kind === operation) process.kill(process.pid, 'SIGKILL');
    },
  },
);
const owner = PrivateAuthority.open(rootPath, pin, Buffer.from(keyHex, 'hex'));
process.on('message', async (m) => {
  if (m.action === 'close') {
    owner.close();
    core.close();
    process.disconnect();
    return;
  }
  try {
    process.send({ result: await owner[m.action](core, m.input) });
  } catch (e) {
    process.send({ error: String(e) });
  }
});
process.send({ ready: true });
