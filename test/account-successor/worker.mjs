import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const [
  path,
  authorityPath,
  pinJSON,
  keyHex,
  point = '',
  mode = 'kill',
  root = process.cwd(),
  hookOperation = 'admit-prepared',
] = process.argv.slice(2);
const { AccountCore } = await import(pathToFileURL(join(resolve(root), 'account-service/core.ts')));
const { PrivateAuthority } = await import(
  pathToFileURL(join(resolve(root), 'account-service/authority.ts'))
);
const pin = JSON.parse(pinJSON);
let armed = true;
const core = new AccountCore(
  path,
  { origin: pin.origin, rpId: pin.rpId },
  {
    hook(at, op) {
      if (!armed || at !== point || op !== hookOperation) return;
      armed = false;
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
    const result =
      m.operation === 'discover'
        ? await owner.discoverAuthority(core, m.input)
        : m.operation === 'admit'
          ? await owner.admitPrepared(core, m.input)
          : m.operation === 'submit'
            ? await owner.decideSubmission(core, m.input)
            : await owner.enrollment(core, m.operation, m.input);
    process.send({ result });
  } catch (e) {
    process.send({ error: String(e) });
  }
});
process.send({ ready: true });
