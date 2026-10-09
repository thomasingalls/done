/** One bounded backup/prune attempt; no overlapping work or accumulated timer ticks. */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { BackupConfig } from './config.ts';
import type { SnapshotSource } from './snapshot.ts';
import type { B2Store } from './b2.ts';
import { encryptSnapshot } from './archive.ts';
import { retentionDeletes, type BackupVersion } from './retention.ts';
const identity = (v: BackupVersion) => JSON.stringify([v.fileName, v.bytes, v.sha256]);

export class BackupCycle {
  private config: BackupConfig;
  private source: Pick<SnapshotSource, 'version' | 'capture'>;
  private store: Pick<B2Store, 'prefix' | 'upload' | 'verify' | 'list' | 'delete' | 'reset'>;
  private encrypt: typeof encryptSnapshot;
  private running?: Promise<void>;
  private stopping = false;
  private abort?: AbortController;
  private version?: number;
  private anchor?: BackupVersion;
  private verified = new Map<string, string>();
  private lastPruned = 0;
  private dirtySince: number | null = null;
  private pendingCleanup?: string;
  private status = {
    enabled: true,
    busy: false,
    stage: 'starting',
    lastFailureStage: null as string | null,
    failures: 0,
    lastCheckedAt: null as number | null,
    lastSnapshotAt: null as number | null,
    lastUploadedAt: null as number | null,
    lastPrunedAt: null as number | null,
    snapshotBytes: 0,
    uploadedBytes: 0,
    totalUploadedBytes: 0,
    attemptedUploadBytes: 0,
    backups: 0,
  };
  constructor(
    config: BackupConfig,
    source: BackupCycle['source'],
    store: BackupCycle['store'],
    encrypt = encryptSnapshot,
  ) {
    this.config = config;
    this.source = source;
    this.store = store;
    this.encrypt = encrypt;
  }
  health(now = Date.now()) {
    return {
      ...this.status,
      dirtySince: this.dirtySince,
      snapshotAgeMs:
        this.status.lastSnapshotAt === null ? null : Math.max(0, now - this.status.lastSnapshotAt),
      unprotectedChangeAgeMs: this.dirtySince === null ? 0 : Math.max(0, now - this.dirtySince),
      healthy:
        this.anchor !== undefined &&
        !this.status.lastFailureStage &&
        !this.stopping &&
        (this.dirtySince === null || now - this.dirtySince <= 90000),
    };
  }
  tick(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    return (this.running ??= this.run().finally(() => {
      this.running = undefined;
    }));
  }
  async close() {
    this.stopping = true;
    this.abort?.abort();
    await this.running;
  }
  private async run() {
    const now = Date.now();
    this.status.busy = true;
    this.status.lastCheckedAt = now;
    this.abort = new AbortController();
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(300000)]);
    let directory: string | undefined;
    try {
      if (this.pendingCleanup) {
        this.status.stage = 'cleanup';
        rmSync(this.pendingCleanup, { recursive: true, force: true });
        this.pendingCleanup = undefined;
      }
      this.status.stage = 'observe';
      const dirty = this.source.version() !== this.version;
      if (dirty) {
        this.dirtySince ??= now;
        directory = join(this.config.workDirectory, 'run-' + randomBytes(16).toString('hex'));
        mkdirSync(directory, { mode: 0o700 });
        this.status.stage = 'snapshot';
        const snapshot = await this.source.capture(directory, this.config.sourceRevision);
        signal.throwIfAborted();
        this.status.stage = 'encrypt';
        const path = join(directory, 'payload.age');
        const digest = await this.encrypt(directory, path, this.config.recipient, signal);
        this.status.stage = 'upload-verify';
        const name =
          this.store.prefix +
          snapshot.capturedAt +
          '-' +
          randomBytes(16).toString('hex') +
          '-' +
          digest.sha256 +
          '.tar.gz.age';
        this.status.attemptedUploadBytes += digest.bytes;
        this.anchor = await this.store.upload(path, name, digest, signal);
        this.verified.set(this.anchor.fileId, identity(this.anchor));
        this.version = snapshot.version;
        this.status.lastSnapshotAt = snapshot.capturedAt;
        this.status.lastUploadedAt = Date.now();
        this.status.snapshotBytes = snapshot.snapshotBytes;
        this.status.uploadedBytes = digest.bytes;
        this.status.totalUploadedBytes += digest.bytes;
        this.status.backups++;
        // Do not credit writes accepted during copying/upload to the earlier read point.
        this.dirtySince = this.source.version() === this.version ? null : snapshot.capturedAt;
      }
      if (
        this.anchor &&
        (dirty || now - this.lastPruned >= 300000 || this.status.lastFailureStage)
      ) {
        this.status.stage = 'retention';
        if (!dirty) await this.store.verify(this.anchor, signal);
        const versions = await this.store.list(signal);
        // A complete, unambiguous listing containing the exact verified anchor is required.
        const anchor = versions.find((v) => v.fileId === this.anchor!.fileId);
        if (
          !anchor ||
          anchor.fileName !== this.anchor.fileName ||
          anchor.sha256 !== this.anchor.sha256 ||
          anchor.bytes !== this.anchor.bytes
        )
          throw Error('Retention anchor disappeared or changed');
        const deletes = retentionDeletes(versions, this.anchor.fileId, Date.now());
        const deleting = new Set(deletes.map((v) => v.fileId));
        const kept = versions.filter((v) => !deleting.has(v.fileId));
        // A lost reply or failed readback leaves an unverified remote version. It cannot replace
        // a known-good hourly/daily copy merely by having a newer timestamp in the same bucket.
        for (const v of kept) {
          const key = identity(v);
          if (this.verified.get(v.fileId) !== key) {
            await this.store.verify(v, signal);
            this.verified.set(v.fileId, key);
          }
        }
        for (const v of deletes) {
          signal.throwIfAborted();
          await this.store.delete(v, signal);
        }
        this.lastPruned = Date.now();
        this.verified = new Map(kept.map((v) => [v.fileId, identity(v)]));
        this.status.lastPrunedAt = this.lastPruned;
      }
      this.status.lastFailureStage = null;
      this.status.stage = 'idle';
    } catch {
      this.status.lastFailureStage = this.status.stage;
      this.status.failures++;
      this.store.reset();
      this.status.stage = this.stopping ? 'stopped' : 'failed';
    } finally {
      if (directory) {
        try {
          rmSync(directory, { recursive: true, force: true });
        } catch {
          this.pendingCleanup = directory;
          this.status.lastFailureStage = 'cleanup';
          this.status.failures++;
        }
      }
      this.status.busy = false;
    }
  }
}
