import { PrivateAuthority } from '../../account-service/authority.ts';
process.on('message', (message) => {
  try {
    if (message.operation === 'initialize') {
      const pin = PrivateAuthority.initialize(
        message.path,
        message.policy,
        Buffer.from(message.key, 'hex'),
        (point) => {
          if (point === message.killAt) process.kill(process.pid, 'SIGKILL');
        },
      );
      process.send({ ok: true, pin });
    } else {
      const key = Buffer.from(message.key, 'hex'),
        pin = PrivateAuthority.recoverPin(message.path, key),
        owner = PrivateAuthority.open(message.path, pin, key);
      const proof = owner.prove({ nonce: message.nonce });
      owner.close();
      process.send({ ok: true, pin, proof });
    }
  } catch (error) {
    process.send({ ok: false, error: String(error) });
  } finally {
    process.disconnect();
  }
});
