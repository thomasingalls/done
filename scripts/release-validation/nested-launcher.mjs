/** A registered group leader publishes its PID before it can launch any payload.
 * Cooperative test ownership only; this is not a hostile-code sandbox.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const [root, id, encoded] = process.argv.slice(2);
const spec = JSON.parse(encoded);
const closed = () => {
  let dir = root;
  for (;;) {
    if (existsSync(join(dir, 'closed'))) return true;
    if (dir === process.env.RELEASE_NESTED_TOP) return false;
    const parent = dirname(dir);
    if (parent === dir) throw Error('Invalid nested owner ancestry');
    dir = parent;
  }
};
writeFileSync(join(root, id + '.started.json'), JSON.stringify({ id, pid: process.pid }), {
  flag: 'wx',
});
// A late-starting leader never launches after the outer owner has begun teardown.
let published = false;
const until = Date.now() + 5000;
while (!closed() && Date.now() < until) {
  try {
    const record = JSON.parse(readFileSync(join(root, id + '.spawned.json'), 'utf8'));
    if (record.pid !== process.pid) throw Error('Nested leader PID mismatch');
    published = true;
    break;
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
  await new Promise((resolve) => setTimeout(resolve, 5));
}
if (!published || closed()) {
  process.exitCode = 1;
  process.disconnect?.();
} else {
  const child = spawn(spec.file, spec.args, {
    detached: false,
    stdio: process.send ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit',
    ...(spec.serialization ? { serialization: spec.serialization } : {}),
  });
  if (child.pid)
    writeFileSync(
      join(root, id + '.payload.json'),
      JSON.stringify({ id, leader: process.pid, pid: child.pid }),
      { flag: 'wx' },
    );
  if (process.send) {
    process.on('message', (message) => {
      if (child.connected) child.send(message, () => {});
    });
    child.on('message', (message) => {
      if (process.connected) process.send(message, () => {});
    });
    process.on('disconnect', () => {
      if (child.connected) child.disconnect();
    });
    child.on('disconnect', () => {
      if (process.connected) process.disconnect();
    });
  }
  child.on('error', (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  child.on('close', (code, signal) => {
    process.exitCode = signal ? 1 : (code ?? 1);
    if (process.connected) process.disconnect();
  });
}
