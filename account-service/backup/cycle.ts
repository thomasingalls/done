/** Timely uploads, hourly exact remote verification/pruning, five-minute local checks. */
import { lstatSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { BackupConfig } from './config.ts';
import { fileDigest, type SnapshotSource } from './snapshot.ts';
import { B2QuotaExceeded, type B2Store } from './b2.ts';
import { encryptSnapshot } from './archive.ts';
import { retentionDeletes, type BackupVersion } from './retention.ts';
const identity = (v: BackupVersion) => JSON.stringify([v.fileName, v.bytes, v.sha256]);
export const REMOTE_CHECK_MS = 3600000;
export const LOCAL_CHECK_MS = 300000;
type Candidate = {
  directory: string;
  path: string;
  name: string;
  digest: Awaited<ReturnType<typeof fileDigest>>;
  snapshot: Awaited<ReturnType<SnapshotSource['capture']>>;
  remote?: BackupVersion;
};

export class BackupCycle {
  private config: BackupConfig;
  private source: Pick<SnapshotSource, 'version' | 'capture'>;
  private store: Pick<B2Store, 'prefix' | 'put' | 'verify' | 'list' | 'delete' | 'reset'>;
  private encrypt: typeof encryptSnapshot;
  private clock: () => number;
  private running?: Promise<void>;
  private stopping = false;
  private abort?: AbortController;
  private version?: number; // Last acknowledged upload, never a connection-local value from disk.
  private candidate?: Candidate;
  private anchor?: BackupVersion;
  private verified = new Map<string, string>();
  private nextRemoteAt = 0;
  private networkRetryAt = 0;
  private remoteRetryAt = 0;
  private retryFailures = 0;
  private dirtySince: number | null = null;
  private pendingCleanup = new Set<string>();
  private status = {
    enabled: true,
    busy: false,
    stage: 'starting',
    lastFailureStage: null as string | null,
    failures: 0,
    lastCheckedAt: null as number | null,
    lastSnapshotAt: null as number | null, // Exact remote-verified recovery point.
    lastUploadedAt: null as number | null,
    lastRemoteVerifiedAt: null as number | null,
    lastLocalVerifiedAt: null as number | null,
    lastPrunedAt: null as number | null,
    snapshotBytes: 0,
    uploadedBytes: 0,
    totalUploadedBytes: 0,
    attemptedUploadBytes: 0,
    uploads: 0,
    backups: 0,
    quotaBlocked: false,
  };
  constructor(
    config: BackupConfig,
    source: BackupCycle['source'],
    store: BackupCycle['store'],
    encrypt = encryptSnapshot,
    clock = Date.now,
  ) {
    this.config = config;
    this.source = source;
    this.store = store;
    this.encrypt = encrypt;
    this.clock = clock;
  }
  health(now = this.clock()) {
    return {
      ...this.status,
      dirtySince: this.dirtySince,
      pendingVerification:
        !!this.candidate?.remote && this.candidate.remote.fileId !== this.anchor?.fileId,
      nextRemoteVerificationAt: this.nextRemoteAt || null,
      networkRetryAt: this.networkRetryAt || null,
      remoteRetryAt: this.remoteRetryAt || null,
      snapshotAgeMs:
        this.status.lastSnapshotAt === null ? null : Math.max(0, now - this.status.lastSnapshotAt),
      unprotectedChangeAgeMs: this.dirtySince === null ? 0 : Math.max(0, now - this.dirtySince),
      healthy:
        this.anchor !== undefined &&
        !this.status.lastFailureStage &&
        !this.stopping &&
        this.status.lastRemoteVerifiedAt !== null &&
        now - this.status.lastRemoteVerifiedAt <= REMOTE_CHECK_MS + 90000 &&
        this.status.lastLocalVerifiedAt !== null &&
        now - this.status.lastLocalVerifiedAt <= LOCAL_CHECK_MS + 90000 &&
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
    if (this.candidate) this.pendingCleanup.add(this.candidate.directory);
    this.candidate = undefined;
    this.cleanup();
  }
  private cleanup() {
    for (const directory of this.pendingCleanup) {
      rmSync(directory, { recursive: true, force: true });
      this.pendingCleanup.delete(directory);
    }
  }
  private recovered(...stages: string[]) {
    if (this.status.lastFailureStage && stages.includes(this.status.lastFailureStage))
      this.status.lastFailureStage = null;
  }
  private async localCheck(candidate: Candidate, signal: AbortSignal) {
    const stat = lstatSync(candidate.path);
    if (!stat.isFile() || stat.mode & 0o077 || (process.getuid && stat.uid !== process.getuid()))
      throw Error('Backup copy must remain a private owned file');
    const actual = await fileDigest(candidate.path);
    signal.throwIfAborted();
    if (actual.bytes !== candidate.digest.bytes || actual.sha256 !== candidate.digest.sha256)
      throw Error('Local encrypted backup changed');
    this.status.lastLocalVerifiedAt = this.clock();
    this.recovered('local-check');
  }
  private async run() {
    const now = this.clock();
    this.status.busy = true;
    this.status.lastCheckedAt = now;
    this.abort = new AbortController();
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(300000)]);
    let directory: string | undefined;
    try {
      this.status.stage = 'cleanup';
      this.cleanup();
      this.recovered('cleanup');
      this.status.stage = 'observe';
      const observed = this.source.version();
      if (observed !== this.version) this.dirtySince ??= now;
      // Capture each observed source version once. Retry/readback failures retain the encrypted
      // bytes and acknowledged receipt rather than recapturing/reuploading the same writing.
      if (!this.candidate || this.candidate.snapshot.version !== observed) {
        directory = join(this.config.workDirectory, 'run-' + randomBytes(16).toString('hex'));
        mkdirSync(directory, { mode: 0o700 });
        this.status.stage = 'snapshot';
        const snapshot = await this.source.capture(directory, this.config.sourceRevision);
        signal.throwIfAborted();
        this.status.stage = 'encrypt';
        const path = join(directory, 'payload.age');
        const digest = await this.encrypt(directory, path, this.config.recipient, signal);
        signal.throwIfAborted();
        // Only encrypted bytes survive a tick; never retain the plaintext SQLite/manifest copies.
        for (const name of readdirSync(directory))
          if (name !== 'payload.age')
            rmSync(join(directory, name), { recursive: true, force: true });
        const name =
          this.store.prefix +
          snapshot.capturedAt +
          '-' +
          randomBytes(16).toString('hex') +
          '-' +
          digest.sha256 +
          '.tar.gz.age';
        if (this.candidate) this.pendingCleanup.add(this.candidate.directory);
        this.candidate = { directory, path, name, digest, snapshot };
        directory = undefined;
        this.recovered('snapshot', 'encrypt');
        // This check also guards against a mutated retained file before its first upload.
        this.status.lastLocalVerifiedAt = null;
      }
      const candidate = this.candidate;
      if (
        this.status.lastLocalVerifiedAt === null ||
        now - this.status.lastLocalVerifiedAt >= LOCAL_CHECK_MS
      ) {
        this.status.stage = 'local-check';
        await this.localCheck(candidate, signal);
      }
      if (now < this.networkRetryAt) {
        this.status.stage = 'backoff';
        return;
      }
      if (!candidate.remote) {
        this.status.stage = 'upload';
        this.status.attemptedUploadBytes += candidate.digest.bytes;
        candidate.remote = await this.store.put(
          candidate.path,
          candidate.name,
          candidate.digest,
          signal,
        );
        signal.throwIfAborted();
        this.version = candidate.snapshot.version;
        this.status.lastUploadedAt = this.clock();
        this.status.uploadedBytes = candidate.digest.bytes;
        this.status.totalUploadedBytes += candidate.digest.bytes;
        this.status.uploads++;
        this.dirtySince =
          this.source.version() === this.version ? null : candidate.snapshot.capturedAt;
        this.recovered('upload');
      }
      if (now >= Math.max(this.nextRemoteAt, this.remoteRetryAt)) {
        // One cycle/hour, regardless of dirty state or whether the previous check failed.
        this.nextRemoteAt = this.clock() + REMOTE_CHECK_MS;
        this.status.stage = 'remote-verify';
        await this.store.verify(candidate.remote, signal);
        signal.throwIfAborted();
        const newAnchor = this.anchor?.fileId !== candidate.remote.fileId;
        this.anchor = candidate.remote;
        this.verified.set(this.anchor.fileId, identity(this.anchor));
        this.status.lastSnapshotAt = candidate.snapshot.capturedAt;
        this.status.lastRemoteVerifiedAt = this.clock();
        this.status.snapshotBytes = candidate.snapshot.snapshotBytes;
        if (newAnchor) this.status.backups++;
        this.recovered('remote-verify');
        this.status.stage = 'retention';
        const versions = await this.store.list(signal);
        const anchor = versions.find((v) => v.fileId === this.anchor!.fileId);
        if (!anchor || identity(anchor) !== identity(this.anchor))
          throw Error('Retention anchor disappeared or changed');
        const deletes = retentionDeletes(versions, this.anchor.fileId, this.clock());
        const deleting = new Set(deletes.map((v) => v.fileId));
        const kept = versions.filter((v) => !deleting.has(v.fileId));
        // A listing/receipt is never proof of recoverability. Verify every unfamiliar keeper
        // before deleting anything; cache only exact immutable identities, not names or ages.
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
        this.verified = new Map(kept.map((v) => [v.fileId, identity(v)]));
        this.status.lastPrunedAt = this.clock();
        this.recovered('retention');
        this.remoteRetryAt = 0;
        this.status.quotaBlocked = false;
      }
      this.networkRetryAt = 0;
      this.retryFailures = 0;
      this.status.stage = 'idle';
    } catch (cause) {
      this.status.lastFailureStage = this.status.stage;
      this.status.failures++;
      if (['upload', 'remote-verify', 'retention'].includes(this.status.stage)) {
        const failedAt = this.clock();
        this.status.quotaBlocked = cause instanceof B2QuotaExceeded;
        const resetAt = (Math.floor(failedAt / 86400000) + 1) * 86400000;
        if (cause instanceof B2QuotaExceeded && cause.scope === 'download')
          this.remoteRetryAt = resetAt; // A read cap must not stop new encrypted uploads.
        else
          this.networkRetryAt = this.status.quotaBlocked
            ? resetAt
            : failedAt + Math.min(REMOTE_CHECK_MS, 30000 * 2 ** Math.min(this.retryFailures++, 7));
        this.store.reset();
      }
      this.status.stage = this.stopping ? 'stopped' : 'failed';
    } finally {
      if (directory) this.pendingCleanup.add(directory);
      try {
        this.cleanup();
      } catch {
        this.status.lastFailureStage = 'cleanup';
        this.status.failures++;
      }
      this.status.busy = false;
    }
  }
}
