import { AccountCore } from '../../account-service/core.ts';
import { PrivateAuthority } from '../../account-service/authority.ts';
const [path, authorityPath, pinJson, keyHex, point = '', operation = '', mode = 'kill'] =
  process.argv.slice(2);
const pin = JSON.parse(pinJson);
const core = new AccountCore(
  path,
  { origin: pin.origin, rpId: pin.rpId },
  {
    hook(at, op) {
      if (at !== point || op !== operation) return;
      if (mode === 'pause') {
        process.send({ paused: true });
        process.kill(process.pid, 'SIGSTOP');
      } else process.kill(process.pid, 'SIGKILL');
    },
  },
);
const owner = PrivateAuthority.open(authorityPath, pin, Buffer.from(keyHex, 'hex'));
process.on('message', async (m) => {
  if (m.close) {
    owner.close();
    core.close();
    process.disconnect();
    return;
  }
  try {
    process.send({ result: await owner.enrollment(core, m.operation, m.input) });
  } catch (e) {
    process.send({ error: String(e) });
  }
});
process.send({ ready: true });
