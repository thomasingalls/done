// @vitest-environment node
/** Phase 556 probe: one real local reduction, either sliced through the resumable preparation
 * journal (RESUME on, the production profile) or as one uncached pass (RESUME off, the floor).
 * Real Account content owner, real WebCrypto, fake in-memory IndexedDB, real clocks and the
 * production slice target. Instrumentation wraps module boundaries only; no source is changed.
 *
 * Environment: PAIRS (own+peer pairs of history); ARMS, a comma list of 'uncached', 'sliced' and
 * 'sliced@<ms>' (a slice target emulating a slower device); REPS repetitions of every arm; OUTDIR
 * and LABEL for the JSON files. The history is built and sealed once per process; each reduction
 * starts from a byte-identical copy of that store. */
import { it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { Session } from 'node:inspector';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';

const c = vi.hoisted(() => {
  const zero = () => ({
    digestCalls: 0,
    digestBytes: 0,
    decryptCalls: 0,
    decryptBytes: 0,
    encryptCalls: 0,
    encryptBytes: 0,
    hmacSignCalls: 0,
    hmacSignBytes: 0,
    hmacVerifyCalls: 0,
    hmacVerifyBytes: 0,
    signatureVerifyCalls: 0,
    inventoryReads: 0,
    prefixCaptures: 0,
    checkpointLoads: 0,
    checkpointLoadMs: 0,
    hits: 0,
    misses: 0,
    lookupMisses: 0,
    deltaBytes: 0,
    firstMissAt: undefined as number | undefined,
    pauseAt: undefined as number | undefined,
    journals: 0,
    // Phase 557: whole-document forks and state comparisons (src/crdt/yjs.ts), and the coverage
    // view's own entry points, counted and timed at the module boundary.
    forks: 0,
    forkMs: 0,
    compares: 0,
    compareMs: 0,
    preparedBaselines: 0,
    directProofs: 0,
  });
  return {
    zero,
    now: zero(),
    size: (b: unknown): number => {
      if (b instanceof ArrayBuffer) return b.byteLength;
      if (ArrayBuffer.isView(b)) return b.byteLength;
      return 0;
    },
  };
});
vi.mock('../../../src/crdt/retentionPreparation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/crdt/retentionPreparation')>();
  return {
    ...actual,
    createPreparationJournal(options: Parameters<typeof actual.createPreparationJournal>[0]) {
      // SLICE_MS emulates a slower device: a device k times slower with the 2 s target slices like
      // this host with a 2/k s target, since every cost scales by k. Unset: the production target.
      const slice = Number(process.env['SLICE_MS'] ?? 0);
      const journal = actual.createPreparationJournal(
        slice ? { ...options, sliceMs: slice } : options,
      );
      c.now.journals++;
      const memo = journal.memo as unknown as Record<string, unknown>;
      const wrap = (name: 'check' | 'checkReceipt') => {
        const original = memo[name] as (...a: unknown[]) => Promise<unknown>;
        memo[name] = async (...args: unknown[]) => {
          let missed = false;
          const verify = args[3] as () => Promise<unknown>;
          args[3] = () => {
            missed = true;
            c.now.firstMissAt ??= performance.now();
            return verify();
          };
          try {
            const value = await original(...args);
            if (missed) c.now.misses++;
            else c.now.hits++;
            return value;
          } catch (cause) {
            if (cause instanceof actual.PreparationPause) {
              c.now.lookupMisses++;
              c.now.pauseAt ??= performance.now();
            }
            throw cause;
          }
        };
      };
      wrap('check');
      wrap('checkReceipt');
      return journal;
    },
  };
});
vi.mock('../../../src/crdt/yjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/crdt/yjs')>();
  return {
    ...actual,
    forkDoc(...args: Parameters<typeof actual.forkDoc>) {
      const t = performance.now();
      try {
        return actual.forkDoc(...args);
      } finally {
        c.now.forks++;
        c.now.forkMs += performance.now() - t;
      }
    },
    sameDocState(...args: Parameters<typeof actual.sameDocState>) {
      const t = performance.now();
      try {
        return actual.sameDocState(...args);
      } finally {
        c.now.compares++;
        c.now.compareMs += performance.now() - t;
      }
    },
    prepareDocCoverage(...args: Parameters<typeof actual.prepareDocCoverage>) {
      c.now.preparedBaselines++;
      return actual.prepareDocCoverage(...args);
    },
    provesIntegratedCoverage(...args: Parameters<typeof actual.provesIntegratedCoverage>) {
      c.now.directProofs++;
      return actual.provesIntegratedCoverage(...args);
    },
  };
});
vi.mock('../../../src/crdt/retentionPreparationBinding', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/crdt/retentionPreparationBinding')>();
  return {
    ...actual,
    async capturePreparationPrefix(...args: Parameters<typeof actual.capturePreparationPrefix>) {
      c.now.prefixCaptures++;
      return actual.capturePreparationPrefix(...args);
    },
    async matchesPreparationPrefix(...args: Parameters<typeof actual.matchesPreparationPrefix>) {
      // Captures the current prefix internally (one full pack and hash) once its cheap checks pass.
      c.now.prefixCaptures++;
      return actual.matchesPreparationPrefix(...args);
    },
  };
});
vi.mock('../../../src/crdt/retentionPreparationStorage', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/crdt/retentionPreparationStorage')>();
  return {
    ...actual,
    async loadPreparationCheckpoint(...args: Parameters<typeof actual.loadPreparationCheckpoint>) {
      const t = performance.now();
      c.now.checkpointLoads++;
      try {
        return await actual.loadPreparationCheckpoint(...args);
      } finally {
        c.now.checkpointLoadMs += performance.now() - t;
      }
    },
    async savePreparationDelta(...args: Parameters<typeof actual.savePreparationDelta>) {
      c.now.deltaBytes += args[3].payload.length;
      return actual.savePreparationDelta(...args);
    },
  };
});

/** Every database in a fake IndexedDB factory, with its stores' options and sealed rows. */
interface Snapshot {
  name: string;
  version: number;
  stores: {
    name: string;
    keyPath: string | string[] | null;
    autoIncrement: boolean;
    rows: [IDBValidKey, unknown][];
  }[];
}
const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
async function snapshot(factory: IDBFactory): Promise<Snapshot[]> {
  const out: Snapshot[] = [];
  for (const info of await factory.databases()) {
    const db = await request(factory.open(info.name!));
    const names = [...db.objectStoreNames];
    const tx = db.transaction(names, 'readonly');
    const stores: Snapshot['stores'] = [];
    for (const name of names) {
      const store = tx.objectStore(name);
      const [keys, values] = await Promise.all([
        request(store.getAllKeys()),
        request(store.getAll()),
      ]);
      stores.push({
        name,
        keyPath: store.keyPath,
        autoIncrement: store.autoIncrement,
        rows: keys.map((k, i) => [k, values[i]]),
      });
    }
    out.push({ name: db.name, version: db.version, stores });
    db.close();
  }
  return out;
}
/** A fresh factory holding exactly those databases, rows copied without re-sealing. */
async function restore(snaps: Snapshot[]): Promise<IDBFactory> {
  const factory = new IDBFactory();
  for (const s of snaps) {
    const open = factory.open(s.name, s.version);
    open.onupgradeneeded = () => {
      for (const st of s.stores)
        open.result.createObjectStore(st.name, {
          keyPath: st.keyPath ?? undefined,
          autoIncrement: st.autoIncrement,
        });
    };
    const db = await request(open);
    const tx = db.transaction(
      s.stores.map((st) => st.name),
      'readwrite',
    );
    for (const st of s.stores)
      for (const [k, v] of st.rows)
        tx.objectStore(st.name).put(structuredClone(v), st.keyPath === null ? k : undefined);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }
  return factory;
}

const W = process.cwd();
const REPS = Number(process.env['REPS'] ?? 1),
  // First repetition's number in file names, so a later process can add repetitions.
  REP_BASE = Number(process.env['REP_BASE'] ?? 0);
const PAIRS = Number(process.env['PAIRS'] ?? 16),
  ARMS = (process.env['ARMS'] ?? 'uncached,sliced').split(','),
  OUTDIR = process.env['OUTDIR'],
  LABEL = process.env['LABEL'] ?? 'run';
const TOTALS = [
  'prepareMs',
  'saveMs',
  'commitMs',
  'hits',
  'misses',
  'inventoryReads',
  'prefixCaptures',
  'checkpointLoadMs',
  'digestCalls',
  'digestBytes',
  'decryptCalls',
  'decryptBytes',
  'encryptCalls',
  'hmacSignCalls',
  'hmacVerifyCalls',
  'hmacVerifyBytes',
  'signatureVerifyCalls',
  'deltaBytes',
  'forks',
  'forkMs',
  'compares',
  'compareMs',
  'preparedBaselines',
  'directProofs',
];
// PROFILE=1: a CPU profile of each attempt's verifying stage and of its coverage loop, written to
// OUTDIR as .cpuprofile (phase 557). The inspector session is this process's own; nothing leaves it.
const profile = (() => {
  if (process.env['PROFILE'] !== '1' || !process.env['OUTDIR'])
    return { start() {}, stop(_name: string) {} };
  const session = new Session();
  session.connect();
  let running = false;
  return {
    start() {
      if (running) return;
      running = true;
      session.post('Profiler.enable');
      session.post('Profiler.setSamplingInterval', { interval: 500 });
      session.post('Profiler.start');
    },
    stop(name: string) {
      if (!running) return;
      running = false;
      session.post('Profiler.stop', (error, result) => {
        if (error) throw error;
        writeFileSync(
          `${process.env['OUTDIR']}/${process.env['LABEL'] ?? 'run'}-${name}.cpuprofile`,
          JSON.stringify(result.profile),
        );
      });
    },
  };
})();

it('reduction cost', async () => {
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const n of [
    'VITE_ACCOUNT_RETENTION',
    'VITE_ACCOUNT_BASELINE_READ',
    'VITE_ACCOUNT_BASELINE_INSTALL',
  ])
    vi.stubEnv(n, '1');
  const { createContentOwner } = await import(W + '/src/crdt/contentStore');
  const { preparationVerifierIdentity } = await import(W + '/src/crdt/localBaselineMode');
  const { accountLedgerMetrics } = await import(W + '/src/crdt/accountLedgerMetrics');
  const { extendSpoolWitness } = await import(W + '/src/crdt/spoolRecord');
  const { cryptFor, keys } = await import(W + '/test/local-baseline/anchor-fixture');
  // @ts-expect-error JavaScript fixture.
  const { memberFixture } = await import(W + '/test/local-baseline/fixtures.mjs');
  const task = {
    signal: new AbortController().signal,
    step: (f: () => unknown) => f(),
    wait: async (f: () => unknown) => f(),
  } as never;

  // History: PAIRS own positions (each with its spool, delivery and response rows) and PAIRS
  // received peer receipts. Built once; each arm seeds it into its own fresh store.
  const built = performance.now();
  const f = await memberFixture();
  for (let i = 0; i < PAIRS; i++) {
    await f.appendOwn();
    await f.appendPeer();
  }
  const historyMs = performance.now() - built;
  const context = f.ctx;

  // Instrument crypto and the inventory read. Counters reset at each attempt, so seeding work is
  // never counted.
  const subtle = crypto.subtle as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  const spy = (name: string, count: (args: unknown[]) => void) => {
    const original = subtle[name]!.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, name as never).mockImplementation(((...args: unknown[]) => {
      count(args);
      return original(...args);
    }) as never);
  };
  const alg = (a: unknown) => (typeof a === 'string' ? a : (a as { name?: string })?.name);
  spy('digest', (a) => {
    c.now.digestCalls++;
    c.now.digestBytes += c.size(a[1]);
  });
  spy('decrypt', (a) => {
    c.now.decryptCalls++;
    c.now.decryptBytes += c.size(a[2]);
  });
  spy('encrypt', (a) => {
    c.now.encryptCalls++;
    c.now.encryptBytes += c.size(a[2]);
  });
  spy('sign', (a) => {
    if (alg(a[0]) === 'HMAC') {
      c.now.hmacSignCalls++;
      c.now.hmacSignBytes += c.size(a[2]);
    }
  });
  spy('verify', (a) => {
    if (alg(a[0]) === 'HMAC') {
      c.now.hmacVerifyCalls++;
      c.now.hmacVerifyBytes += c.size(a[3]);
    } else c.now.signatureVerifyCalls++;
  });
  const getAll = IDBObjectStore.prototype.getAll;
  vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (
    this: IDBObjectStore,
    ...args: unknown[]
  ) {
    if (this.name === 'meta') c.now.inventoryReads++;
    return getAll.apply(this, args as never);
  });

  // Seed the history once into a store, then copy its sealed rows into a fresh store for every
  // arm and repetition, so each reduction starts from byte-identical storage.
  vi.stubGlobal('indexedDB', new IDBFactory());
  const seeded = performance.now();
  const crypt = {
    ...cryptFor(context.identity, await keys()),
    reuseOpened: true,
    exactBaselineReuse: true,
    readBaseline: true,
    baseline: async () => ({
      ...context,
      identity: { ...context.identity },
      route: { ...context.route },
    }),
  };
  const make = () => createContentOwner(context.identity, 1, crypt as never);
  const seed = make();
  await seed.initialize(task, { intent: '04'.repeat(16), checkCreation() {} });
  await seed.enableSpool(task);
  let batch: unknown[] = [];
  const flush = async () => {
    if (batch.length) await seed.append(task, batch as never);
    batch = [];
  };
  for (const row of f.rows as { kind: string; bytes: Uint8Array }[]) {
    const event =
      row.kind === 'heads' ||
      (row.kind === 'outbound' &&
        !new TextDecoder().decode(row.bytes).startsWith('["done/source-capture/v1"'));
    if (event) {
      await flush();
      const before = await seed.spoolWitness(task),
        after = await extendSpoolWitness(before, row.bytes, crypto.subtle);
      await seed.appendSpool(task, row as never, { before, after });
    } else {
      batch.push(row);
      if (batch.length >= 64) await flush();
    }
  }
  await flush();
  seed.dispose();
  const sealed = await snapshot(indexedDB);
  const rows = f.rows.length,
    seedMs = performance.now() - seeded;

  for (let rep = REP_BASE; rep < REP_BASE + REPS; rep++)
    for (const arm of ARMS) {
      const [kind, sliceText] = arm.split('@');
      const sliced = kind === 'sliced';
      process.env['SLICE_MS'] = sliceText ?? '';
      vi.stubEnv('VITE_ACCOUNT_RETENTION_RESUME', sliced ? '1' : '0');
      vi.stubEnv('PROD', sliced);
      if (sliced !== Boolean(preparationVerifierIdentity()))
        throw Error('Arm does not match the journal switch: ' + arm);
      vi.stubGlobal('indexedDB', await restore(sealed));
      const owner = make();
      await owner.initialize(task);
      const began = performance.now(),
        cpu = process.cpuUsage();
      const attempts: Record<string, unknown>[] = [];
      let durable = 0,
        outcome = 'none';
      for (let n = 0; n < 10000; n++) {
        c.now = c.zero();
        const start = performance.now();
        // Stage boundaries from the owner's own progress reports (first report of each stage).
        // 'coverage-loop' is the plan's bare coverage report after its per-row loop, so the stage
        // splits into the row checks and the final replay and comparison (phase 557). Counters are
        // copied at each boundary so every stage's forks and compares can be told apart.
        const stages: Record<string, number> = {};
        const stageCounts: Record<string, Record<string, number>> = {};
        const ledgerAt = () => {
          const t = accountLedgerMetrics().timings;
          return {
            coverageChecks: t.coverageCheck.calls,
            coverageCheckMs: t.coverageCheck.totalMs,
            coverageRebuilds: t.coverageRebuild.calls,
            coverageRebuildMs: t.coverageRebuild.totalMs,
          };
        };
        const ledgerStart = ledgerAt();
        const mark = (name: string) => {
          if (stages[name] !== undefined) return;
          stages[name] = performance.now() - start;
          const l = ledgerAt();
          stageCounts[name] = {
            forks: c.now.forks,
            forkMs: c.now.forkMs,
            compares: c.now.compares,
            compareMs: c.now.compareMs,
            coverageChecks: l.coverageChecks - ledgerStart.coverageChecks,
            coverageCheckMs: l.coverageCheckMs - ledgerStart.coverageCheckMs,
            coverageRebuilds: l.coverageRebuilds - ledgerStart.coverageRebuilds,
            coverageRebuildMs: l.coverageRebuildMs - ledgerStart.coverageRebuildMs,
          };
        };
        const progress = (value: { stage: string; completed?: number }) => {
          if (value.stage === 'coverage' && value.completed === undefined) {
            mark('coverage-loop');
            profile.stop(`${PAIRS}-${sliced ? 'sliced' : 'uncached'}-${rep}-${n}-coverage`);
          }
          if (stages[value.stage] === undefined) {
            if (value.stage === 'building')
              profile.stop(`${PAIRS}-${sliced ? 'sliced' : 'uncached'}-${rep}-${n}-verifying`);
            if (value.stage === 'verifying' || value.stage === 'coverage') profile.start();
          }
          mark(value.stage);
        };
        const prepared = await owner.prepareHistoryRemoval(
          task,
          async () => {},
          () => {},
          0,
          () => {},
          progress as never,
        );
        const prepareEnd = performance.now();
        const record: Record<string, unknown> = {
          n,
          kind: prepared.kind,
          prepareMs: prepareEnd - start,
          firstMissMs: c.now.firstMissAt === undefined ? null : c.now.firstMissAt - start,
          freshMs:
            c.now.firstMissAt === undefined
              ? null
              : (c.now.pauseAt ?? prepareEnd) - c.now.firstMissAt,
        };
        let saveMs = 0,
          commitMs = 0;
        if (prepared.kind === 'preparation-checkpoint') {
          const t = performance.now();
          try {
            await prepared.persist(
              { ...task, signal: new AbortController().signal } as never,
              async () => {},
              () => {},
            );
          } finally {
            prepared.dispose();
          }
          saveMs = performance.now() - t;
          durable += c.now.deltaBytes;
        } else if (prepared.kind === 'prepared-removal') {
          const t = performance.now();
          try {
            const done = await prepared.commit(
              task,
              async () => {},
              () => {},
              () => {},
            );
            outcome = done.kind;
          } finally {
            prepared.dispose();
          }
          commitMs = performance.now() - t;
        } else outcome = (prepared as { kind: string; reason?: string }).reason ?? prepared.kind;
        const { firstMissAt: _a, pauseAt: _b, ...counts } = c.now;
        attempts.push({
          ...record,
          saveMs,
          commitMs,
          durableBytes: durable,
          stages,
          stageCounts,
          ...counts,
        });
        if (prepared.kind !== 'preparation-checkpoint') break;
      }
      const totalMs = performance.now() - began,
        spent = process.cpuUsage(cpu),
        // Process CPU (all threads, user and system): less sensitive to other load than wall time.
        cpuMs = (spent.user + spent.system) / 1000;
      const sum = (k: string) => attempts.reduce((s, a) => s + Number(a[k] ?? 0), 0);
      const name = sliced ? 'sliced' + (sliceText ?? '') : 'uncached';
      const result = {
        pairs: PAIRS,
        arm: name,
        rep,
        sliceMs: sliced ? Number(sliceText ?? 2000) : null,
        rows,
        historyMs,
        seedMs,
        outcome,
        totalMs,
        cpuMs,
        attempts: attempts.length,
        fencedSaves: attempts.filter((a) => a['kind'] === 'preparation-checkpoint').length,
        totals: Object.fromEntries(TOTALS.map((k) => [k, sum(k)])),
        perAttempt: attempts,
      };
      process.stderr.write(
        `\nREDUCTION label=${LABEL} pairs=${PAIRS} arm=${name} rep=${rep} rows=${rows} outcome=${outcome} total=${Math.round(totalMs)}ms cpu=${Math.round(cpuMs)}ms attempts=${attempts.length} saves=${result.fencedSaves}\n`,
      );
      if (OUTDIR)
        writeFileSync(
          `${OUTDIR}/${LABEL}-${PAIRS}-${name}-${rep}.json`,
          JSON.stringify(result) + '\n',
        );
      owner.dispose();
      if (outcome !== 'removed') throw Error('Reduction did not complete: ' + outcome);
    }
});
