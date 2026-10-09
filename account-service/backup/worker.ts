/** Only spawned by the authenticated public API owner. No independently runnable backup daemon. */
import { parentPort, workerData } from 'node:worker_threads';
import { join } from 'node:path';
import { SnapshotSource } from './snapshot.ts';
import { B2Store } from './b2.ts';
import { BackupCycle } from './cycle.ts';
import { cleanBackupWorkspace, backupNamespace } from './config.ts';

if (!parentPort) throw Error('Backup needs an API owner');
const { config, directory, pin } = workerData;
// The parent already holds service ownership. Previous API-owned threads are gone before another
// owner can open. Only our exact transient run names are reaped; never scan unrelated directories.
cleanBackupWorkspace(config.workDirectory);
const source = new SnapshotSource(join(directory, 'store'), pin);
const cycle = new BackupCycle(config, source, new B2Store(config, backupNamespace(config, pin)));
let stopped = false;
const report = () => parentPort!.postMessage(cycle.health());
const run = () => {
  if (!stopped) void cycle.tick().then(report);
};
const ticks = setInterval(run, 30000),
  health = setInterval(report, 5000);
parentPort.once('message', async (message) => {
  if (message !== 'stop') throw Error('Unexpected backup owner message');
  stopped = true;
  clearInterval(ticks);
  clearInterval(health);
  try {
    await cycle.close();
  } finally {
    source.close();
    parentPort!.close();
  }
});
report();
run();
