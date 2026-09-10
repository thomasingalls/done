import { AccountCore } from '../../account-service/core.ts';
import { PrivateAuthority } from '../../account-service/authority.ts';
const [path, rootPath, pinJSON, keyHex, point = ''] = process.argv.slice(2),
  pin = JSON.parse(pinJSON);
const core = new AccountCore(
  path,
  { origin: pin.origin, rpId: pin.rpId },
  {
    hook(at, op) {
      if (op === 'decide-submission' && at === point) process.kill(process.pid, 'SIGKILL');
    },
  },
);
const owner = PrivateAuthority.open(rootPath, pin, Buffer.from(keyHex, 'hex'));
process.on('message', async (input) => {
  if (input.close) {
    owner.close();
    core.close();
    process.disconnect();
    return;
  }
  try {
    process.send({ result: await owner.decideSubmission(core, input) });
  } catch (e) {
    process.send({ error: String(e) });
  }
});
process.send({ ready: true });
