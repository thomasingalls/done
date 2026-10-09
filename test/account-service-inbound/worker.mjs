import { AccountCore } from '../../account-service/core.ts';
import { PrivateAuthority } from '../../account-service/authority.ts';
import { AcceptanceCustody } from '../../account-service/acceptance.ts';
const [path, rootPath, pinJSON, keyHex, cut] = process.argv.slice(2),
  pin = JSON.parse(pinJSON);
const die = () => process.kill(process.pid, 'SIGKILL');
const core = new AccountCore(
  path,
  { origin: pin.origin, rpId: pin.rpId },
  {
    hook(at, op) {
      if (op === 'read-inbound' && at === 'after-verify' && cut === 'verified') die();
    },
  },
);
if (cut === 'signed') {
  const original = AcceptanceCustody.prototype.inboundPage;
  AcceptanceCustody.prototype.inboundPage = function (...args) {
    original.apply(this, args);
    die();
  };
}
const owner = PrivateAuthority.open(rootPath, pin, Buffer.from(keyHex, 'hex'));
process.on('message', async (input) => {
  if (input.close) {
    owner.close();
    core.close();
    process.disconnect();
    return;
  }
  try {
    process.send({ result: await owner.readInbound(core, input.bytes) });
  } catch (e) {
    process.send({ error: String(e) });
  }
});
process.send({ ready: true });
