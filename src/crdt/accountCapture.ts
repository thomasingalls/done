import { verifyJoinedAccount } from './joinedAccount';
import { historyAuthority } from '../../account-protocol/admissionHistory';
import { claimScope } from './localGenesisRecord';
/** Private v6 source-capturing Account owner. No network position, envelope or send capability. */
import {
  prepareAccountCustody,
  type JournalSession,
  type ContentInput,
  type ContentReceipt,
} from './custody';
import { openAccountWriteSession, openJoinedWriteSession, type SessionTask } from './writeSession';
import {
  verifyAccountUnderPermit,
  captureAccountOptions,
  type AccountStartupOptions,
} from './accountStartup';
import { signPromotion, withPromotionRoot, writePromotion } from './promotionRecord';
import {
  captureCatalog,
  capturedRecovery,
  decodeSourceCapsule,
  makeSourceCapsule,
  eraseCapsule,
  captureError,
  type SourceCapsule,
  type CaptureRoute,
} from './sourceCapture';
import type { SourceUpdate } from './sourceCapture';
import { hex, type Bytes } from './custodyCrypto';
import {
  copyBatch,
  MAX_BATCH_BYTES,
  MAX_BATCH_RECORDS,
  type OpenedRecord,
  type ContentCounter,
} from './contentRecord';
import { eraseJournalSnapshot, type ObservedEntry } from './journalStore';
import { validateContentUpdates } from './contentCompaction';
import { createAdmissionOwner } from './admissionQueue';
import { createAdmittedWorkspace } from './admittedWorkspace';
import type { AccountWorkspaceOptions } from './accountWorkspace';

/** Internal composition hook; never supplied by application or transport callers. */
export interface CaptureExtension {
  version: 7 | 8 | 9;
  sourceRecords(records: readonly OpenedRecord[], route: CaptureRoute): OpenedRecord[];
  initialize(
    task: SessionTask,
    verified: Awaited<ReturnType<typeof verifyAccountUnderPermit>>,
  ): Promise<void>;
  initializeJoined?(
    task: SessionTask,
    verified: Awaited<ReturnType<typeof verifyJoinedAccount>>,
  ): Promise<void>;
  activate(task: SessionTask, owner: ReturnType<typeof prepareAccountCustody>): Promise<void>;
  validate(
    task: SessionTask,
    records: readonly OpenedRecord[],
    route: CaptureRoute,
    counter: ContentCounter,
    view?: object,
  ): Promise<void>;
  dispose(): void;
}
export async function openAccountCaptureOwner(
  input: AccountStartupOptions,
  principalId: string | undefined,
  extension?: CaptureExtension,
  joined = false,
) {
  const options = captureAccountOptions(input),
    cleanups = new Set<() => void | Promise<void>>();
  let owner: ReturnType<typeof prepareAccountCustody> | undefined;
  let account!: Awaited<ReturnType<typeof verifyAccountUnderPermit>>['account'];
  let route!: CaptureRoute;
  let suspended = false;
  let tail: Promise<unknown> = Promise.resolve();
  const sourceRecords = (records: readonly OpenedRecord[]) =>
    extension ? extension.sourceRecords(records, route) : records;
  const recovery = (records: OpenedRecord[], journal: ObservedEntry[]) => ({
    ...capturedRecovery({ records: [...sourceRecords(records)], journal }, route),
    records,
  });
  const live = await (joined ? openJoinedWriteSession : openAccountWriteSession)(
    options.slotId,
    options.code,
    {
      ...(options.signal ? { signal: options.signal } : {}),
      initialize: async (task) => {
        if (joined) {
          if (extension?.version !== 9 || !extension.initializeJoined)
            throw Error('Certified device needs the sync owner');
          const v = await verifyJoinedAccount(task, options);
          if (principalId !== undefined && principalId !== v.account.principalId)
            throw Error('Account actor identity changed');
          route = v.route;
          account = v.account;
          const scope = claimScope(v.claim);
          owner = prepareAccountCustody(
            { ...scope, resolvePrincipal: () => scope.principalId },
            options.code,
            (records, task, counter, view) =>
              extension.validate(task, records, route, counter, view),
            true,
            true,
          );
          await extension.initializeJoined(task, v);
          await owner.initialize(task);
          await extension.activate(task, owner);
          return;
        }
        const v = await verifyAccountUnderPermit(task, options, extension?.version === 9 ? 9 : 8);
        if (!extension && v.marker.v >= 7) throw Error('Account requires the spool owner');
        if (
          extension &&
          !(extension.version === 9 && v.marker.catchup && v.marker.v >= 6) &&
          v.marker.v !== extension.version - 1 &&
          v.marker.v !== extension.version
        )
          throw Error('Spool requires verified source capture');
        if (v.marker.v === 5) throw Error('Edited v5 Account needs a verified catch-up checkpoint');
        if (
          principalId === undefined
            ? extension?.version !== 9
            : v.account.principalId !== principalId
        )
          throw Error('Account actor identity changed');
        route = v.route;
        account = v.account;
        const certified = v.marker.genesis!.actors;
        if (
          !certified.some(
            (a) =>
              a.id === route.principal && a.kind === 'human' && a.credential === route.credential,
          ) ||
          !certified.some(
            (a) => a.id === 'system' && a.kind === 'system' && a.credential === route.credential,
          )
        )
          throw Error('Capture needs certified human and system actors');
        owner = prepareAccountCustody(
          {
            slotId: options.slotId,
            workspaceId: route.workspace,
            resolvePrincipal: () => route.principal,
          },
          options.code,
          (records, task, counter, view) => {
            if (extension?.version !== 9) captureCatalog(sourceRecords(records), route);
            return extension?.validate(task, records, route, counter, view);
          },
          extension ? true : undefined,
          extension?.version === 9 ? true : undefined,
        );
        await extension?.initialize(task, v);
        await owner.initialize(task);
        if (extension) {
          if (v.marker.v < extension.version)
            await withPromotionRoot(task, v.claim, v.record, options.code, async (root, subtle) => {
              const next = await signPromotion(
                root,
                {
                  ...v.marker,
                  v: extension.version,
                  stage:
                    extension.version === 9
                      ? 'account-receiving'
                      : extension.version === 8
                        ? 'account-delivering'
                        : 'account-spooling',
                },
                subtle,
              );
              await writePromotion(task, v.claim, v.record, v.record, v.marker, next);
            });
        }
        await extension?.activate(task, owner);
        if (v.marker.v === 4) {
          const records = await owner.carrier.load(task);
          try {
            if (records.some((r) => r.kind === 'outbound' || r.kind === 'heads'))
              captureError('Frozen genesis has unclassified outbound records');
          } finally {
            for (const r of records) r.bytes.fill(0);
          }
          // Close the old journal format before installing the authenticated new reader fence.
          const old = await owner.journal.readSnapshot(task);
          try {
            const receipt = await owner.journal.flush(task, old, (task, updates) =>
              owner!.carrier.append(
                task,
                updates.map((bytes) => ({ kind: 'update', bytes })),
              ),
            );
            if (receipt.retained) throw Error('Legacy journal cleanup must finish before capture');
          } finally {
            eraseJournalSnapshot(old);
          }
          await withPromotionRoot(task, v.claim, v.record, options.code, async (root, subtle) => {
            const next = await signPromotion(
              root,
              { ...v.marker, v: 6, stage: 'account-capturing' },
              subtle,
            );
            await writePromotion(task, v.claim, v.record, v.record, v.marker, next);
          });
        }
      },
      dispose: async () => {
        try {
          await tail;
          for (const cleanup of cleanups) await cleanup();
          cleanups.clear();
        } finally {
          extension?.dispose();
          owner?.dispose();
          options.networkLogin?.close();
        }
      },
    },
  );
  options.networkLogin?.activate(live);
  const run = <T>(operation: (task: SessionTask) => Promise<T>): Promise<T> => {
    const previous = tail;
    const result = live.run(async (task) => {
      await task.wait(() => previous);
      return operation(task);
    });
    tail = result.then(
      () => {},
      () => {},
    );
    void result.catch((cause) => {
      if (cause?.code === 'generation-changed' || cause?.code === 'repair-required')
        void live.close().catch(() => {});
    });
    return result;
  };
  const withSnapshot = <T>(
    task: SessionTask,
    operation: (entries: ObservedEntry[]) => Promise<T>,
  ) =>
    task.wait(async () => {
      const entries = await owner!.journal.readSnapshot(task);
      try {
        return await operation(entries);
      } finally {
        eraseJournalSnapshot(entries);
      }
    });
  const persist = async (task: SessionTask, values: readonly Bytes[]): Promise<ContentReceipt> => {
    const records = await owner!.carrier.load(task);
    const batches: ContentInput[][] = [];
    let batch: ContentInput[] = [],
      size = 0;
    try {
      const catalog = captureCatalog(sourceRecords(records), route);
      for (const bytes of values) {
        if (suspended) throw Error('Account generation is changing');
        const c = decodeSourceCapsule(bytes, route);
        try {
          const found = catalog.get(c.id);
          if (found && hex(found) !== hex(bytes))
            captureError('Conflicting source identity before commit');
          if (found) continue;
          catalog.set(c.id, bytes);
          const count = c.sources.length + 1,
            length = c.sources.reduce((n, s) => n + s.bytes.length, bytes.length);
          if (
            batch.length &&
            (batch.length + count > MAX_BATCH_RECORDS || size + length > MAX_BATCH_BYTES)
          ) {
            batches.push(batch);
            batch = [];
            size = 0;
          }
          if (count > MAX_BATCH_RECORDS || length > MAX_BATCH_BYTES)
            captureError('Capture batch is too large');
          batch.push(
            ...c.sources.map((s) => ({ kind: 'update' as const, bytes: s.bytes.slice() })),
            { kind: 'outbound', bytes: bytes.slice() },
          );
          size += length;
        } finally {
          eraseCapsule(c);
        }
      }
      if (batch.length) {
        batches.push(batch);
        batch = [];
      }
      const sequences: number[] = [];
      for (const b of batches) sequences.push(...(await owner!.carrier.append(task, b)).sequences);
      return { storeId: owner!.describe().storeId, generation: route.generation, sequences };
    } finally {
      for (const r of records) r.bytes.fill(0);
      for (const b of [...batches, batch]) for (const r of b) r.bytes.fill(0);
    }
  };
  const carrier: JournalSession = Object.freeze({
    ...owner!.describe(),
    get state() {
      return suspended && live.state === 'active' ? 'closing' : live.state;
    },
    signal: live.signal,
    close: () => live.close(),
    beforeRelease(cleanup: () => void | Promise<void>) {
      live.write(() => cleanups.add(cleanup));
    },
    get observedJournalCharacters() {
      return owner!.journal.observedCharacters;
    },
    captureLocal: (_update: Bytes, sources: readonly SourceUpdate[] | undefined) =>
      live.write(() => {
        if (suspended) throw Error('Account generation is changing');
        if (!sources?.length) captureError('Source metadata must accompany local admission');
        return makeSourceCapsule(route, sources!);
      }),
    appendLocal: (bytes: Bytes) =>
      live.write(() => {
        if (suspended) throw Error('Account generation is changing');
        const c = decodeSourceCapsule(bytes, route);
        eraseCapsule(c);
        return owner!.journal.append(bytes);
      }),
    appendBatch: (input: readonly ContentInput[]) => {
      let copied: ContentInput[];
      try {
        copied = live.write(() => {
          if (suspended) throw Error('Account generation is changing');
          return copyBatch(input);
        });
      } catch (e) {
        return Promise.reject(e);
      }
      return run(async (task) => {
        try {
          if (copied.some((r) => r.kind !== 'update'))
            captureError('Only source capsules may be admitted');
          return await persist(
            task,
            copied.map((r) => r.bytes),
          );
        } finally {
          for (const r of copied) r.bytes.fill(0);
        }
      }).finally(() => {
        for (const r of copied) r.bytes.fill(0);
      });
    },
    loadRecords: () =>
      run(async (task) => {
        const records = await owner!.carrier.load(task);
        try {
          captureCatalog(sourceRecords(records), route);
          return records;
        } catch (e) {
          for (const r of records) r.bytes.fill(0);
          throw e;
        }
      }),
    loadRecovery: () =>
      run((task) =>
        withSnapshot(task, async (journal) => {
          const records = await owner!.carrier.load(task);
          try {
            return recovery(records, journal);
          } catch (e) {
            for (const r of records) r.bytes.fill(0);
            throw e;
          }
        }),
      ),
    flushJournal: () =>
      run((task) =>
        withSnapshot(task, (entries) =>
          owner!.journal.flush(task, entries, (t, values) => persist(t, values)),
        ),
      ),
    compactContent: () =>
      run(async (task) => {
        // The generic compactor already retains every outbound row. Validate capsule syntax/identity
        // before it may delete any content, including exact journal/disk overlap.
        await withSnapshot(task, async (journal) => {
          const records = await owner!.carrier.load(task);
          let recovered;
          try {
            recovered = recovery(records, journal);
          } finally {
            for (const r of records) r.bytes.fill(0);
            for (const r of recovered?.journal ?? []) r.bytes.fill(0);
          }
        });
        return owner!.carrier.compact(task, () => {
          const entries = owner!.journal.snapshot();
          try {
            for (const entry of entries) {
              const c = decodeSourceCapsule(entry.bytes, route);
              try {
                validateContentUpdates(c.sources.map((s) => s.bytes));
              } finally {
                eraseCapsule(c);
              }
            }
          } finally {
            eraseJournalSnapshot(entries);
          }
        });
      }),
  });
  return {
    account,
    carrier,
    // Synchronous admission barrier. Retention still owns the permit and serialized storage tail.
    suspendCapture() {
      suspended = true;
    },
    // Internal composition only: caller persists and verifies authority before this synchronous swap.
    installRoute(task: SessionTask, next: CaptureRoute) {
      task.step(() => {
        if (
          extension?.version !== 9 ||
          !next.history ||
          next.epoch <= route.epoch ||
          (route.epoch === 1 && next.epoch !== 2) ||
          (route.epoch !== 1 && route.epoch < 3) ||
          next.workspace !== route.workspace ||
          next.principal !== route.principal ||
          next.credential !== route.credential ||
          next.generation !== route.generation
        )
          throw Error('Invalid owned authority transition');
        if (route.history) historyAuthority(next.history, route.history.current);
        route = next;
      });
    },
    // HTTP work keeps the same lifetime/permit without holding the serialized storage tail.
    runNetworkTask: <T>(operation: (task: SessionTask) => Promise<T>) => live.run(operation),
    // Only the composed private owner receives task authority; wrappers below omit this capability.
    runCaptureTask: <T>(
      operation: (
        task: SessionTask,
        owner: ReturnType<typeof prepareAccountCustody>,
        route: CaptureRoute,
      ) => Promise<T>,
    ) => run((task) => operation(task, owner!, route)),
    listCaptures: () =>
      run((task) =>
        withSnapshot(task, async (journal) => {
          const records = await owner!.carrier.load(task),
            result: SourceCapsule[] = [];
          try {
            const catalog = captureCatalog(sourceRecords(records), route);
            for (const e of journal) {
              const c = decodeSourceCapsule(e.bytes, route);
              try {
                const prior = catalog.get(c.id);
                if (prior && hex(prior) !== hex(e.bytes))
                  captureError('Conflicting source identity');
                catalog.set(c.id, e.bytes);
              } finally {
                eraseCapsule(c);
              }
            }
            for (const bytes of catalog.values()) result.push(decodeSourceCapsule(bytes, route));
            return result;
          } catch (e) {
            for (const c of result) eraseCapsule(c);
            throw e;
          } finally {
            for (const r of records) r.bytes.fill(0);
          }
        }),
      ),
  };
}

export async function openAccountCaptureSession(input: AccountStartupOptions, principalId: string) {
  const { account, carrier, listCaptures } = await openAccountCaptureOwner(input, principalId);
  return { account, carrier, listCaptures };
}

export async function openOwnedCapturedAccountWorkspace(input: AccountWorkspaceOptions) {
  const options = {
    ...captureAccountOptions(input),
    identity: structuredClone(input.identity),
    today: input.today,
  };
  const { account, carrier, listCaptures } = await openAccountCaptureSession(
    options,
    options.identity.id,
  );
  try {
    const workspace = await createAdmittedWorkspace(
      (config) => createAdmissionOwner(carrier, config),
      {
        identity: options.identity,
        captureSources: true,
        validateReceive: () => {
          throw Error('Account relay receiver is not configured');
        },
        ...(options.today ? { today: options.today } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      },
    );
    if (options.signal?.aborted || workspace.status.state !== 'active') {
      await workspace.close();
      throw Error('Account opening was cancelled');
    }
    return Object.freeze({
      ...account,
      kind: 'ready' as const,
      workspace,
      compactContent: async () => {
        await workspace.whenDurable();
        return carrier.compactContent();
      },
      // Internal inspection seam for the next spool owner; never an acknowledgement/removal capability.
      listCaptures,
    });
  } catch (e) {
    await carrier.close();
    throw e;
  }
}
