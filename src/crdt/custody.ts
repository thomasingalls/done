/**
 * Phase-two custody owner. No caller receives a root, generation key, or private
 * credential. Startup supplies verified identity and the cross-carrier census;
 * completing this component alone does not complete workspace genesis.
 */
import { assertNoLocalClear } from './localClearState';
import { assertNoPreactiveImport } from './legacyImportState';
import { validateContentUpdates, type ContentCompactionReceipt } from './contentCompaction';
export type { ContentCompactionReceipt } from './contentCompaction';
import { deriveStoreName } from './storeName';
import { deriveJournalKey, type JournalError } from './journalCodec';
import {
  createJournalOwner,
  eraseJournalSnapshot,
  isJournalChanged,
  type JournalAdmission,
  type JournalUpdate,
  type JournalFlushReceipt,
} from './journalStore';
export { JournalError, MAX_JOURNAL_UPDATE, JOURNAL_WATERMARK } from './journalCodec';
export type { JournalRefusal } from './journalCodec';
export type { JournalAdmission, JournalUpdate, JournalFlushReceipt } from './journalStore';
import {
  createContentOwner,
  type ContentCreationOptions,
  type ContentReceipt,
} from './contentStore';
import {
  ContentError,
  copyBatch,
  parseStoredRecord,
  recordAAD,
  type ContentInput,
  type OpenedRecord,
  type StoredRecord,
} from './contentRecord';
export { ContentError } from './contentRecord';
export type { ContentRefusal, ContentInput, OpenedRecord } from './contentRecord';
export type { ContentCreationOptions, ContentReceipt } from './contentStore';
import {
  createCredential,
  fields,
  guardedSubtle,
  generateDeviceCode,
  hex,
  hkdf,
  normalizeDeviceCode,
  openCredential,
  openEnvelope,
  openFactor,
  random,
  sealEnvelope,
  sealFactor,
  utf8,
  type Bytes,
} from './custodyCrypto';
import {
  authenticateRecord,
  CustodyError,
  identity,
  openCustodyDb,
  SEAL_LIMIT,
  signRecord,
  transact,
  type CreationIntent,
  type CustodyRecord,
  type CustodyScope,
} from './custodyRecord';
import {
  openWriteSession,
  type WriteSession,
  withExclusiveSlot,
  type SessionTask,
  type WriteSessionState,
} from './writeSession';
export { CustodyError } from './custodyRecord';
export type { CustodyRefusal, CustodyScope, CreationIntent } from './custodyRecord';

export interface CustodyAuthority {
  readonly slotId: string;
  readonly workspaceId: string;
  /** Reread/verify Local identity or Account binding under this granted permit. */
  resolvePrincipal(task: SessionTask): string | PromiseLike<string>;
}
export interface CustodyCreationOptions {
  signal?: AbortSignal;
  /**
   * Required owner of SC-06's OTHER carriers. Throw unless they are absent for
   * fresh creation, or match this authenticated intent on resume. Never a cached
   * earlier census. Runs under exclusion before this component changes custody.
   */
  checkCreation(
    task: SessionTask,
    scope: Readonly<CustodyScope>,
    intent: Readonly<CreationIntent>,
    mode: 'fresh' | 'resume',
  ): void | PromiseLike<void>;
}
export interface CustodyEnrollment {
  /** Display once, outside persistent app state. Null after confirm starts/cancel. */
  readonly displayCode: string | null;
  confirm(typedCode: string): Promise<CustodyDescriptor>;
  cancel(): void;
}
export interface CustodyDescriptor {
  readonly scope: Readonly<CustodyScope>;
  readonly storeId: string;
  readonly rootId: string;
  readonly generation: 1;
  readonly publicCredentials: ReadonlyArray<{
    readonly role: 'wrapping' | 'signing';
    readonly id: string;
    readonly publicKey: Bytes;
  }>;
}
export interface CustodyContentRecord {
  v: 1;
  gen: number;
  seq: number;
  kind: 'update' | 'state' | 'heads' | 'outbound';
  nonce: Bytes;
  ct: Bytes;
}
export interface CustodyTask extends SessionTask {
  /** Authenticated read only. Allocated writes belong to ContentSession; admission and compaction use the journal-capable owner. */
  openRecord(record: CustodyContentRecord): Promise<Bytes>;
}
export interface CustodySession extends CustodyDescriptor {
  readonly state: WriteSessionState;
  readonly signal: AbortSignal;
  run<T>(operation: (task: CustodyTask) => T | PromiseLike<T>): Promise<T>;
  close(): Promise<void>;
}
const captureAuthority = (authority: CustodyAuthority) => {
  try {
    const { slotId, workspaceId, resolvePrincipal } = authority;
    identity(slotId);
    identity(workspaceId);
    if (typeof resolvePrincipal !== 'function') throw Error('Missing authority resolver');
    return { slotId, workspaceId, resolvePrincipal };
  } catch (cause) {
    throw new CustodyError('invalid-input', 'Custody requires an identity authority.', { cause });
  }
};
const resolveScope = async (
  task: SessionTask,
  a: CustodyAuthority,
  preactive = false,
): Promise<CustodyScope> => {
  await assertNoLocalClear(task, a.slotId);
  if (!preactive) await assertNoPreactiveImport(task, a.slotId);
  const principalId = await task.wait(() => a.resolvePrincipal(task));
  identity(principalId);
  return Object.freeze({ slotId: a.slotId, workspaceId: a.workspaceId, principalId });
};
const codeBytes = (code: string): Bytes => {
  try {
    return utf8(normalizeDeviceCode(code));
  } catch (cause) {
    throw new CustodyError('confirmation-required', 'Enter the generated device-lock code.', {
      cause,
    });
  }
};
const descriptor = (scope: CustodyScope, record: CustodyRecord): CustodyDescriptor =>
  Object.freeze({
    scope,
    storeId: record.store_id,
    rootId: record.root_id,
    generation: 1,
    publicCredentials: Object.freeze(
      record.credentials!.map((c) =>
        Object.freeze({ role: c.role, id: c.id, publicKey: c.publicKey.slice() }),
      ),
    ),
  });
const newIntent = (): CreationIntent =>
  Object.freeze({
    id: hex(random(16)),
    storeId: hex(random(16)),
    rootId: hex(random(16)),
    wrappingId: hex(random(16)),
    signingId: hex(random(16)),
  });

interface OwnedKeys {
  store: CryptoKey | null;
  metadata?: CryptoKey | null;
  journal?: Bytes | null;
  wrapping: CryptoKey | null;
  signing: CryptoKey | null;
}
const clearKeys = (keys: OwnedKeys) => {
  keys.store = null;
  keys.metadata = null;
  keys.journal?.fill(0);
  keys.journal = null;
  keys.wrapping = null;
  keys.signing = null;
};
const loadKeys = async (
  task: SessionTask,
  scope: CustodyScope,
  record: CustodyRecord,
  root: Bytes,
  keys: OwnedKeys,
  content = false,
  journal = false,
): Promise<void> => {
  let generation: Bytes | undefined;
  try {
    await task.wait(async () => {
      generation = await openEnvelope(
        scope,
        root,
        record.envelope!,
        guardedSubtle(() => task.step(() => {})),
      );
    });
    if (generation!.length !== 32) throw Error('Invalid generation key');
    await task.wait(async () => {
      keys.store = await hkdf(
        generation!,
        new Uint8Array(),
        fields('done/store/v1', scope.workspaceId, record.store_id),
        { name: 'AES-GCM', length: 256 },
        content ? ['encrypt', 'decrypt'] : ['decrypt'],
        guardedSubtle(() => task.step(() => {})),
      );
    });
    if (content)
      await task.wait(async () => {
        keys.metadata = await hkdf(
          generation!,
          new Uint8Array(),
          fields(
            'done/content-metadata/v1',
            scope.slotId,
            scope.principalId,
            scope.workspaceId,
            record.store_id,
          ),
          { name: 'HMAC', hash: 'SHA-256', length: 256 },
          ['sign', 'verify'],
          guardedSubtle(() => task.step(() => {})),
        );
      });
    if (journal)
      await task.wait(async () => {
        keys.journal = await deriveJournalKey(
          generation!,
          scope.workspaceId,
          guardedSubtle(() => task.step(() => {})),
        );
      });
    await task.wait(async () => {
      keys.wrapping = await openCredential(
        scope,
        root,
        record.credentials![0],
        guardedSubtle(() => task.step(() => {})),
      );
    });
    await task.wait(async () => {
      keys.signing = await openCredential(
        scope,
        root,
        record.credentials![1],
        guardedSubtle(() => task.step(() => {})),
      );
    });
  } catch (cause) {
    if (task.signal.aborted) throw cause;
    throw new CustodyError('repair-required', 'A retained custody opener could not authenticate.', {
      cause,
    });
  } finally {
    generation?.fill(0);
  }
};

/** Reserve the entire next batch durably BEFORE any corresponding encryption. */
const finishCreation = async (
  db: IDBDatabase,
  task: SessionTask,
  scope: CustodyScope,
  initial: CustodyRecord,
  root: Bytes,
): Promise<CustodyRecord> => {
  const intent = initial.creation_intent!;
  if (initial.seal_reserved + 3 >= SEAL_LIMIT)
    throw new CustodyError(
      'seal-budget-exhausted',
      'This custody root cannot reserve another creation attempt.',
    );
  const reserved = await task.wait(() =>
    signRecord(
      root,
      { ...initial, seal_reserved: initial.seal_reserved + 3 },
      guardedSubtle(() => task.step(() => {})),
    ),
  );
  await task.wait(() => transact(db, task, scope, initial, reserved));
  const generation = random(32);
  const verified: OwnedKeys = { store: null, wrapping: null, signing: null };
  try {
    const envelope = await task.wait(() =>
      sealEnvelope(
        scope,
        root,
        1,
        generation,
        guardedSubtle(() => task.step(() => {})),
      ),
    );
    const wrapping = await task.wait(() =>
      createCredential(
        scope,
        root,
        'wrapping',
        intent.wrappingId,
        guardedSubtle(() => task.step(() => {})),
      ),
    );
    const signing = await task.wait(() =>
      createCredential(
        scope,
        root,
        'signing',
        intent.signingId,
        guardedSubtle(() => task.step(() => {})),
      ),
    );
    const completed = await task.wait(() =>
      signRecord(
        root,
        {
          ...reserved,
          state: 'protected',
          creation_intent: null,
          envelope,
          credentials: [wrapping, signing],
        },
        guardedSubtle(() => task.step(() => {})),
      ),
    );
    await loadKeys(task, scope, completed, root, verified);
    await task.wait(() => transact(db, task, scope, reserved, completed));
    return completed;
  } finally {
    generation.fill(0);
    clearKeys(verified);
  }
};

const createOrResume = async (
  authority: CustodyAuthority,
  factor: Bytes,
  options: CustodyCreationOptions,
  mode: 'fresh' | 'resume',
  owned?: { task: SessionTask; installInitial?: InitialCustodyInstaller },
): Promise<CustodyDescriptor> => {
  const { checkCreation, signal } = options;
  if (typeof checkCreation !== 'function') {
    factor.fill(0);
    throw new CustodyError('invalid-input', 'Creation requires the startup carrier check.');
  }
  let db: IDBDatabase | undefined;
  let root: Bytes | undefined;
  const dispose = () => {
    factor.fill(0);
    root?.fill(0);
    root = undefined;
    db?.close();
    db = undefined;
  };
  const operation = async (task: SessionTask) => {
    const scope = await resolveScope(task, authority, Boolean(owned));
    await task.wait(async () => {
      db = await openCustodyDb();
    });
    let record = await task.wait(() => transact(db!, task, scope));
    if (mode === 'fresh') {
      if (record)
        throw new CustodyError(
          'locked-existing',
          'Custody already exists; unlock or resume its winning factor.',
        );
      const intent = newIntent();
      await task.wait(() => checkCreation(task, scope, intent, 'fresh'));
      root = random(32);
      const seal = await task.wait(() =>
        sealFactor(
          scope,
          factor,
          root!,
          'code',
          'code',
          guardedSubtle(() => task.step(() => {})),
        ),
      );
      record = await task.wait(() =>
        signRecord(
          root!,
          {
            v: 2,
            state: 'creating',
            slot_id: scope.slotId,
            principal_id: scope.principalId,
            workspace_id: scope.workspaceId,
            store_id: intent.storeId,
            root_id: intent.rootId,
            seals: [seal],
            seal_reserved: 0,
            rotation_owed: false,
            creation_intent: intent,
            envelope: null,
            credentials: null,
            mac: new Uint8Array(32),
          },
          guardedSubtle(() => task.step(() => {})),
        ),
      );
      if (owned?.installInitial)
        await task.wait(() => owned.installInitial!(task, db!, scope, record!));
      else await task.wait(() => transact(db!, task, scope, null, record!));
    } else {
      if (!record)
        throw new CustodyError(
          'missing-custody',
          'Missing custody is not permission to create a replacement.',
        );
      if (record.state !== 'creating')
        throw new CustodyError(
          'locked-existing',
          'Creation already completed; use ordinary factor unlock.',
        );
      try {
        await task.wait(async () => {
          root = await openFactor(
            scope,
            factor,
            record!.seals[0],
            guardedSubtle(() => task.step(() => {})),
          );
        });
      } catch (cause) {
        if (task.signal.aborted) throw cause;
        throw new CustodyError(
          'unlock-failed',
          'The factor did not open custody; it may be wrong or the seal damaged.',
          { cause },
        );
      }
      await task.wait(() =>
        authenticateRecord(
          root!,
          record!,
          guardedSubtle(() => task.step(() => {})),
        ),
      );
      await task.wait(() =>
        checkCreation(task, scope, Object.freeze({ ...record!.creation_intent! }), 'resume'),
      );
    }
    factor.fill(0);
    const completed = await finishCreation(db!, task, scope, record, root!);
    return descriptor(scope, completed);
  };
  try {
    return owned
      ? await operation(owned.task)
      : await withExclusiveSlot(authority.slotId, operation, {
          ...(signal ? { signal } : {}),
          dispose,
        });
  } finally {
    dispose();
  }
};

/** Internal composition seam: the genesis owner holds exclusion throughout all stages. */
export type InitialCustodyInstaller = (
  task: SessionTask,
  db: IDBDatabase,
  scope: CustodyScope,
  record: CustodyRecord,
) => Promise<void>;
export const createCustodyUnderPermit = (
  task: SessionTask,
  authority: CustodyAuthority,
  code: string,
  options: CustodyCreationOptions,
  mode: 'fresh' | 'resume',
  installInitial?: InitialCustodyInstaller,
): Promise<CustodyDescriptor> =>
  createOrResume(captureAuthority(authority), codeBytes(code), options, mode, {
    task,
    ...(installInitial ? { installInitial } : {}),
  });

/** Internal authenticated read/initialization, with keys disposed before returning to the owner. */
export const checkContentUnderPermit = async (
  task: SessionTask,
  authority: CustodyAuthority,
  code: string,
  creation?: ContentCreationOptions,
): Promise<CustodyDescriptor> => {
  const owner = prepareCustody(authority, code, true, false, true);
  try {
    await owner.initialize(task, creation);
    return owner.describe();
  } finally {
    owner.dispose();
  }
};

/** Only this generated-code ceremony can create fresh custody. No chosen-code setter. */
export const beginCustodyEnrollment = (
  input: CustodyAuthority,
  options: CustodyCreationOptions,
): CustodyEnrollment => {
  const authority = captureAuthority(input);
  const captured = { ...options };
  if (typeof captured.checkCreation !== 'function')
    throw new CustodyError('invalid-input', 'Creation requires the startup carrier check.');
  let display: string | null = generateDeviceCode();
  let expected: Bytes | null = codeBytes(display);
  let used = false;
  const controller = new AbortController();
  const erase = () => {
    used = true;
    display = null;
    expected?.fill(0);
    expected = null;
  };
  const detach = () => captured.signal?.removeEventListener('abort', cancel);
  const cancel = () => {
    erase();
    controller.abort();
    detach();
  };
  captured.signal?.addEventListener('abort', cancel, { once: true });
  if (captured.signal?.aborted) cancel();
  return {
    get displayCode() {
      return display;
    },
    cancel,
    confirm: async (typedCode) => {
      if (used || !expected)
        throw new CustodyError(
          'enrollment-closed',
          'Start a new ceremony or resume the saved creation.',
        );
      const typed = codeBytes(typedCode);
      if (!typed.every((b, i) => b === expected![i])) {
        typed.fill(0);
        throw new CustodyError(
          'confirmation-required',
          'The confirmation does not match the generated code.',
        );
      }
      // Consume the ceremony before the first await: two confirms cannot race it.
      erase();
      return createOrResume(
        authority,
        typed,
        { ...captured, signal: controller.signal },
        'fresh',
      ).finally(detach);
    },
  };
};
export const resumeCustodyCreation = (
  input: CustodyAuthority,
  code: string,
  options: CustodyCreationOptions,
): Promise<CustodyDescriptor> =>
  createOrResume(captureAuthority(input), codeBytes(code), { ...options }, 'resume');

/** Internal owner shared by read-only custody and the allocated content carrier. */
const prepareCustody = (
  input: CustodyAuthority,
  code: string,
  content: boolean,
  withJournal = false,
  preactive = false,
  validateRecords?: (records: readonly OpenedRecord[]) => void,
) => {
  const authority = captureAuthority(input),
    factor = codeBytes(code);
  const keys: OwnedKeys = { store: null, wrapping: null, signing: null };
  let db: IDBDatabase | undefined, root: Bytes | undefined;
  let scope!: CustodyScope, record!: CustodyRecord;
  let carrier: ReturnType<typeof createContentOwner> | undefined;
  let journal: ReturnType<typeof createJournalOwner> | undefined;
  const openRecord = (task: SessionTask, inputRecord: StoredRecord): Promise<Bytes> => {
    const value = task.step(() => parseStoredRecord(inputRecord));
    if (value.gen !== 1)
      throw new CustodyError('repair-required', 'No opener for this content generation.');
    return task.wait(async () => {
      try {
        return new Uint8Array(
          await crypto.subtle.decrypt(
            {
              name: 'AES-GCM',
              iv: value.nonce,
              tagLength: 128,
              additionalData: recordAAD({ ...scope, storeId: record.store_id }, value),
            },
            keys.store!,
            value.ct,
          ),
        );
      } catch (cause) {
        throw new CustodyError('repair-required', 'Content authentication failed.', { cause });
      }
    });
  };
  return {
    authority,
    eraseFactor() {
      factor.fill(0);
    },
    describe: () => descriptor(scope, record),
    get journal() {
      return journal!;
    },
    get carrier() {
      return carrier!;
    },
    openRecord,
    initialize: async (task: SessionTask, creation?: ContentCreationOptions) => {
      scope = await resolveScope(task, authority, preactive);
      await task.wait(async () => {
        db = await openCustodyDb();
      });
      const current = await task.wait(() => transact(db!, task, scope));
      if (!current)
        throw new CustodyError(
          'missing-custody',
          'No custody exists for this identity. Normal open never creates it.',
        );
      if (current.state !== 'protected')
        throw new CustodyError(
          'creation-pending',
          'Custody creation must resume before normal open.',
        );
      record = current;
      try {
        await task.wait(async () => {
          root = await openFactor(
            scope,
            factor,
            record.seals[0],
            guardedSubtle(() => task.step(() => {})),
          );
        });
      } catch (cause) {
        if (task.signal.aborted) throw cause;
        throw new CustodyError(
          'unlock-failed',
          'The factor did not open custody; it may be wrong or the seal damaged.',
          { cause },
        );
      }
      factor.fill(0);
      await task.wait(() =>
        authenticateRecord(
          root!,
          record,
          guardedSubtle(() => task.step(() => {})),
        ),
      );
      await loadKeys(task, scope, record, root!, keys, content, withJournal);
      root!.fill(0);
      root = undefined;
      db!.close();
      db = undefined;

      if (content) {
        carrier = createContentOwner(
          { ...scope, storeId: record.store_id, rootId: record.root_id },
          1,
          {
            ...(validateRecords ? { validate: validateRecords } : {}),
            open: openRecord,
            seal: (task, header, plaintext) =>
              task.wait(async () => {
                const nonce = random(12);
                const ct = new Uint8Array(
                  await crypto.subtle.encrypt(
                    {
                      name: 'AES-GCM',
                      iv: nonce,
                      tagLength: 128,
                      additionalData: recordAAD({ ...scope, storeId: record.store_id }, header),
                    },
                    keys.store!,
                    plaintext,
                  ),
                );
                return { ...header, nonce, ct };
              }),
            sign: (task, payload) =>
              task.wait(
                async () =>
                  new Uint8Array(await crypto.subtle.sign('HMAC', keys.metadata!, payload)),
              ),
            verify: (task, payload, mac) =>
              task.wait(() => crypto.subtle.verify('HMAC', keys.metadata!, mac, payload)),
          },
        );
        await carrier.initialize(task, creation);
      }
      if (withJournal) {
        const name = await task.wait(() => deriveStoreName(scope.principalId, scope.workspaceId));
        journal = task.step(() =>
          createJournalOwner(
            { ...scope, storeId: record.store_id, rootId: record.root_id },
            name,
            1,
            keys.journal!,
          ),
        );
        // Erasure is cleanup and must also run if cancellation follows the successful read.
        eraseJournalSnapshot(await journal.readSnapshot(task));
      }
    },
    dispose: () => {
      factor.fill(0);
      root?.fill(0);
      root = undefined;
      clearKeys(keys);
      db?.close();
      db = undefined;
      carrier?.dispose();
      journal?.dispose();
    },
  };
};

export const openCustodySession = async (
  input: CustodyAuthority,
  code: string,
  options: { signal?: AbortSignal } = {},
): Promise<CustodySession> => {
  const owner = prepareCustody(input, code, false);
  let live;
  try {
    live = await openWriteSession(owner.authority.slotId, {
      ...options,
      initialize: (task) => owner.initialize(task),
      dispose: owner.dispose,
    });
  } finally {
    owner.eraseFactor();
  }
  return Object.freeze({
    ...owner.describe(),
    get state() {
      return live.state;
    },
    signal: live.signal,
    close: () => live.close(),
    run: <T>(operation: (task: CustodyTask) => T | PromiseLike<T>): Promise<T> =>
      live.run((task) =>
        operation({
          ...task,
          openRecord: (input) => owner.openRecord(task, input),
        }),
      ),
  });
};

export interface ContentSession extends CustodyDescriptor {
  readonly state: WriteSessionState;
  readonly signal: AbortSignal;
  /** Exact immutable batch; receipt only after content transaction completion. */
  appendBatch(input: readonly ContentInput[]): Promise<ContentReceipt>;
  /** Every record in one disk snapshot authenticates, or no result is returned. */
  loadRecords(): Promise<OpenedRecord[]>;
  close(): Promise<void>;
}

/** Internal pre-active owner seam. Caller owns exclusion and verifies its import claim on this task.
 * No key, journal, transport or long-lived carrier escapes the callback. */
export const withPreactiveContentUnderPermit = async <T>(
  task: SessionTask,
  authority: CustodyAuthority,
  code: string,
  operation: (content: Pick<ContentSession, 'appendBatch' | 'loadRecords'>) => Promise<T>,
): Promise<T> => {
  const owner = prepareCustody(authority, code, true, false, true);
  try {
    await owner.initialize(task);
    return await operation({
      loadRecords: () => owner.carrier.load(task),
      appendBatch: async (input) => {
        const copied = task.step(() => copyBatch(input));
        try {
          return await owner.carrier.append(task, copied);
        } finally {
          for (const record of copied) record.bytes.fill(0);
        }
      },
    });
  } finally {
    owner.dispose();
  }
};

/** Internal cold recovery under an already-held lifecycle permit. No writes or keys escape. */
export const withRecoveryUnderPermit = async <T>(
  task: SessionTask,
  authority: CustodyAuthority,
  code: string,
  operation: (recovery: JournalRecovery) => Promise<T>,
): Promise<T> => {
  const owner = prepareCustody(authority, code, true, true);
  let journal: JournalUpdate[] | undefined, records: OpenedRecord[] | undefined;
  try {
    await owner.initialize(task);
    journal = await owner.journal.readSnapshot(task);
    records = await owner.carrier.load(task);
    return await operation({ records, journal });
  } finally {
    journal?.forEach((row) => row.bytes.fill(0));
    records?.forEach((row) => row.bytes.fill(0));
    owner.dispose();
  }
};

export const initializeContentStore = async (
  input: CustodyAuthority,
  code: string,
  options: ContentCreationOptions,
): Promise<CustodyDescriptor> => {
  if (typeof options?.checkCreation !== 'function')
    throw new ContentError(
      'invalid-input',
      'Content initialization requires the startup carrier check.',
    );
  const captured = { ...options },
    owner = prepareCustody(input, code, true);
  try {
    return await withExclusiveSlot(
      owner.authority.slotId,
      async (task) => {
        await owner.initialize(task, captured);
        return owner.describe();
      },
      { ...(captured.signal ? { signal: captured.signal } : {}), dispose: owner.dispose },
    );
  } finally {
    owner.eraseFactor();
  }
};

export const openContentSession = async (
  input: CustodyAuthority,
  code: string,
  options: { signal?: AbortSignal } = {},
): Promise<ContentSession> => {
  const owner = prepareCustody(input, code, true);
  let live;
  try {
    live = await openWriteSession(owner.authority.slotId, {
      ...options,
      initialize: (task) => owner.initialize(task),
      dispose: owner.dispose,
    });
  } finally {
    owner.eraseFactor();
  }
  return Object.freeze({
    ...owner.describe(),
    get state() {
      return live.state;
    },
    signal: live.signal,
    close: () => live.close(),
    appendBatch: (input: readonly ContentInput[]) => {
      // Capture before the caller can mutate its buffer or the task's first await.
      let copied: ContentInput[];
      try {
        copied = live.write(() => copyBatch(input));
      } catch (cause) {
        return Promise.reject(cause);
      }
      return live
        .run((task) => owner.carrier.append(task, copied))
        .finally(() => {
          for (const v of copied) v.bytes.fill(0);
        });
    },
    loadRecords: () => live.run((task) => owner.carrier.load(task)),
  });
};

export interface JournalRecovery {
  readonly records: OpenedRecord[];
  readonly journal: JournalUpdate[];
}
export interface JournalSession extends ContentSession {
  /** Private Account adapter: encode stable source capture once per prepared slice, before admission. */
  captureLocal?(
    update: Bytes,
    sources: readonly import('./sourceCapture').SourceUpdate[] | undefined,
  ): Bytes;
  /** Internal composed lifetime cleanup, after native drain and before permit release. */
  beforeRelease?(cleanup: () => void | Promise<void>): void;
  /** Explicit disk-union maintenance. Never accepts a caller snapshot or deletes journal/heads/outbound. */
  compactContent(): Promise<ContentCompactionReceipt>;
  /** Synchronous carrier result. No canonical mutation, timer, or implicit flush. */
  appendLocal(update: Bytes): JournalAdmission;
  /** Capture journal before content, so concurrent handoff cannot fall between reads. */
  loadRecovery(): Promise<JournalRecovery>;
  /** Commit the captured exact journal bytes, then attempt identity/value-matched cleanup. */
  flushJournal(): Promise<JournalFlushReceipt>;
  readonly observedJournalCharacters: number;
}
export const openJournalSession = async (
  input: CustodyAuthority,
  code: string,
  options: { signal?: AbortSignal } = {},
): Promise<JournalSession> => {
  const owner = prepareCustody(input, code, true, true);
  let live;
  try {
    live = await openWriteSession(owner.authority.slotId, {
      ...options,
      initialize: (task) => owner.initialize(task),
      dispose: owner.dispose,
    });
  } finally {
    owner.eraseFactor();
  }
  return attachJournal(owner, live);
};
export const attachJournal = (
  owner: ReturnType<typeof prepareCustody>,
  live: WriteSession,
): JournalSession => {
  const withSnapshot = <T>(
    operation: (
      task: SessionTask,
      snapshot: ReturnType<typeof owner.journal.snapshot>,
    ) => Promise<T>,
  ): Promise<T> => {
    let snapshot: ReturnType<typeof owner.journal.snapshot> | undefined;
    let firstFailure: JournalError | undefined;
    try {
      // Preserve the existing invocation-time fast path, including the exact captured entry set.
      snapshot = live.write(() => owner.journal.snapshot());
    } catch (cause) {
      if (!isJournalChanged(cause)) return Promise.reject(cause);
      firstFailure = cause;
    }
    return live
      .run(async (task) => {
        try {
          snapshot ??= await owner.journal.readSnapshot(task, firstFailure);
          return await operation(task, snapshot);
        } finally {
          if (snapshot) eraseJournalSnapshot(snapshot);
        }
      })
      .finally(() => {
        // run can reject before invoking its callback if close wins after the eager capture.
        if (snapshot) eraseJournalSnapshot(snapshot);
      });
  };
  return Object.freeze({
    ...owner.describe(),
    get state() {
      return live.state;
    },
    signal: live.signal,
    close: () => live.close(),
    get observedJournalCharacters() {
      return owner.journal.observedCharacters;
    },
    appendLocal: (update: Bytes) => live.write(() => owner.journal.append(update)),
    compactContent: () =>
      live
        .run((task) =>
          owner.carrier.compact(task, () => {
            const snapshot = owner.journal.snapshot();
            try {
              validateContentUpdates(snapshot.map((e) => e.bytes));
            } finally {
              eraseJournalSnapshot(snapshot);
            }
          }),
        )
        .catch(async (cause: unknown) => {
          // A known unreadable carrier closes ordinary use and drains owned work; persisted openers stay intact.
          if (cause instanceof ContentError && cause.code === 'missing-content')
            cause = new ContentError(
              'repair-required',
              'Initialized content metadata is missing.',
              { cause },
            );
          if (
            cause instanceof Error &&
            'code' in cause &&
            (cause.code === 'repair-required' || cause.code === 'generation-changed')
          )
            await live.close();
          throw cause;
        }),
    appendBatch: (input: readonly ContentInput[]) => {
      let copied: ContentInput[];
      try {
        copied = live.write(() => copyBatch(input));
      } catch (cause) {
        return Promise.reject(cause);
      }
      return live.run(async (task) => {
        try {
          return await owner.carrier.append(task, copied);
        } finally {
          for (const v of copied) v.bytes.fill(0);
        }
      });
    },
    loadRecords: () => live.run((task) => owner.carrier.load(task)),
    loadRecovery: () =>
      withSnapshot(async (task, snapshot) => {
        let records: OpenedRecord[] | undefined;
        try {
          records = await owner.carrier.load(task);
          return task.step(() => ({
            records: records!,
            journal: snapshot.map(({ key, generation, bytes }) => ({
              key,
              generation,
              bytes: bytes.slice(),
            })),
          }));
        } catch (cause) {
          if (records) for (const r of records) r.bytes.fill(0);
          throw cause;
        }
      }),
    flushJournal: () =>
      withSnapshot((task, snapshot) =>
        owner.journal.flush(task, snapshot, (task, bytes) =>
          owner.carrier.append(
            task,
            bytes.map((bytes) => ({ kind: 'update', bytes })),
          ),
        ),
      ),
  });
};

/** Internal Account composition seam; the Account owner authenticates before loading these caches. */
export const prepareAccountCustody = (
  input: CustodyAuthority,
  code: string,
  validateRecords?: (records: readonly OpenedRecord[]) => void,
) => prepareCustody(input, code, true, true, false, validateRecords);
