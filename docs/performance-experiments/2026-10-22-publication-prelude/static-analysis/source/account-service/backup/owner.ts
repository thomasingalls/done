import { Worker } from 'node:worker_threads';
import type { BackupConfig } from './config.ts';
import type { AuthorityPin } from '../../account-protocol/authority.ts';

export function startBackupOwner(
  directory: string,
  pin: AuthorityPin,
  config: BackupConfig,
  audit?: () => void,
) {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), {
    workerData: { directory, pin, config },
  });
  let latest: Record<string, unknown> = { enabled: true, healthy: false, stage: 'starting' };
  let updated = Date.now(),
    stopping = false;
  worker.on('message', (value) => {
    if (value?.kind === 'backup-cycle') {
      audit?.();
      return;
    }
    latest = value;
    updated = Date.now();
  });
  worker.on('error', () => {
    latest = { enabled: true, healthy: false, stage: 'worker-failed' };
  });
  const exited = new Promise<void>((accept) =>
    worker.once('exit', () => {
      if (!stopping) latest = { enabled: true, healthy: false, stage: 'worker-exited' };
      accept();
    }),
  );
  return {
    health: () => ({
      ...latest,
      healthy: latest.healthy === true && Date.now() - updated < 15000 && !stopping,
      reportAgeMs: Math.max(0, Date.now() - updated),
    }),
    close: async () => {
      stopping = true;
      worker.postMessage('stop');
      await exited;
    },
  };
}
