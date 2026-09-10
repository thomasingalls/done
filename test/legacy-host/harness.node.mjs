import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as fc from 'fast-check';
import { savePacket, readPacket, classifyCarriers } from '../../scripts/legacy-host/recovery.mjs';
import { PreflightExclusion } from '../../scripts/legacy-host/exclusion.mjs';
import { CDP } from '../../scripts/legacy-host/cdp.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
test('generated file readback detects actual replacement and loss after save', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'host-readback-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let serial = 0;
  await fc.assert(
    fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 1024 }), async (bytes) => {
      const file = join(dir, String(++serial)),
        original = Buffer.from(bytes),
        digest = sha(original);
      const captured = {
        bytes: [...bytes],
        digest,
        sourceDigest: 'source',
        origin: 'https://fixture.invalid',
        policy: 'markdown-system-v1',
      };
      const binding = await savePacket(file, captured);
      captured.bytes.fill(0);
      assert.deepEqual(await readPacket(file, binding), original);
      const changed = Buffer.from(original);
      changed[0] ^= 1;
      await writeFile(file, changed);
      await assert.rejects(() => readPacket(file, binding), /saved-file-mismatch/u);
      await unlink(file);
      await assert.rejects(() => readPacket(file, binding), { code: 'ENOENT' });
    }),
    { seed: 8941, numRuns: 100 },
  );
});
test('save refusal cannot overwrite an existing recovery file', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'host-save-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'existing'),
    bytes = Buffer.from('original');
  await writeFile(file, bytes);
  await assert.rejects(() => savePacket(file, { bytes: [...bytes], digest: sha(bytes) }), {
    code: 'EEXIST',
  });
  assert.deepEqual(await readFile(file), bytes);
  await assert.rejects(
    () => savePacket(join(dir, 'absent', 'packet'), { bytes: [...bytes], digest: sha(bytes) }),
    { code: 'ENOENT' },
  );
});
test('connection epochs reject stale handles independently of coverage gaps', () => {
  const cdp = new EventEmitter(),
    host = new PreflightExclusion(cdp);
  const epoch = host.epoch;
  host.guard(epoch);
  host.coverageGaps.add('unsupported-target');
  host.guard(epoch);
  assert.throws(() => host.guard('another-epoch'), /host-epoch-lost/u);
  cdp.emit('disconnected');
  assert.throws(() => host.guard(epoch), /host-epoch-lost/u);
});
test('the experiment refuses production authority even for an empty target census', async () => {
  const cdp = new EventEmitter();
  cdp.send = async () => ({});
  const host = new PreflightExclusion(cdp);
  assert.equal((await host.install()).production, 'unsupported');
});
test('unknown carriers and configured remote sources never become known-source-only', () => {
  const base = { databases: [{ name: 'done' }], local: [['done.actor', 'a']] };
  assert.equal(classifyCarriers(base), 'known-source-only');
  for (const key of [
    'ws://relay/room',
    'wss://relay/room',
    'other-app',
    'done.pending-update.done.bad-key',
  ])
    assert.equal(classifyCarriers({ ...base, local: [[key, 'value']] }), 'unsupported-carrier');
  assert.equal(
    classifyCarriers({ ...base, local: [['done.sync', '{}']] }),
    'remote-reconciliation-required',
  );
});
class Socket extends EventTarget {
  sent = [];
  send(message) {
    this.sent.push(JSON.parse(message));
  }
  reply(message) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  }
}
test('debugger timeouts and disconnects reject pending work and clear its bookkeeping', async () => {
  const socket = new Socket(),
    cdp = new CDP(socket, 20);
  await assert.rejects(() => cdp.send('Runtime.evaluate'), /exceeded/u);
  assert.equal(cdp.pending.size, 0);
  const pending = cdp.send('Target.getTargets');
  socket.dispatchEvent(new Event('close'));
  await assert.rejects(pending, /disconnected/u);
  assert.equal(cdp.pending.size, 0);
});
test('debugger results are correlated by request id across out-of-order completion', async () => {
  const socket = new Socket(),
    cdp = new CDP(socket, 1000);
  const first = cdp.send('first'),
    second = cdp.send('second');
  await new Promise((resolve) => setTimeout(resolve, 0));
  socket.reply({ id: socket.sent[1].id, result: { value: 2 } });
  socket.reply({ id: socket.sent[0].id, result: { value: 1 } });
  assert.deepEqual(await Promise.all([first, second]), [{ value: 1 }, { value: 2 }]);
  assert.equal(cdp.pending.size, 0);
});
