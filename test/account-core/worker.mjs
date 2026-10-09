import { AccountCore } from '../../account-service/core.ts';
import { policy } from './fixtures.mjs';
const [path, point, operation] = process.argv.slice(2);
const core = new AccountCore(path, policy, {
  hook(at, kind) {
    if (at === point && kind === operation) process.kill(process.pid, 'SIGKILL');
  },
});
process.on('message', async (message) => {
  if (message.action === 'close') {
    core.close();
    process.disconnect();
    return;
  }
  try {
    process.send({ result: await core[message.action](message.input) });
  } catch (error) {
    process.send({ error: String(error) });
  }
});
process.send({ ready: true });
