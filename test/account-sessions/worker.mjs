import { AccountCore } from '../../account-service/core.ts';
let core;
process.on('message', async (message) => {
  if (message.kind === 'open') {
    const { path, config, policy, point } = message;
    core = new AccountCore(path, policy, {
      sessions: { ...config, operatorKey: Buffer.from(config.operatorKey, 'hex') },
      now: () => 1000,
      hook(at, op) {
        if (at === point && op === 'session-finish') process.kill(process.pid, 'SIGKILL');
      },
    });
    process.send({ ready: true });
  } else if (message.kind === 'finish') process.send(await core.sessions.finish(message.proof));
  else {
    core?.close();
    process.disconnect();
  }
});
