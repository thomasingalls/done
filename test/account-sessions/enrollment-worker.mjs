import { AccountCore } from '../../account-service/core.ts';
import { PrivateAuthority } from '../../account-service/authority.ts';
let core, authority;
process.on('message', async (m) => {
  if (m.path) {
    const key = Buffer.from(m.key, 'hex');
    authority = PrivateAuthority.open(m.authorityPath, m.pin, key);
    core = new AccountCore(
      m.path,
      { origin: m.pin.origin, rpId: m.pin.rpId },
      {
        now: () => 1000,
        sessions: { pin: m.pin, operatorKey: key },
        hook: (point, op) => {
          if (point === m.point && op === 'enrollment-finish') process.kill(process.pid, 'SIGKILL');
        },
      },
    );
    key.fill(0);
    process.send({ ready: true });
  } else await authority.enrollment(core, 'finish', m.proof);
});
