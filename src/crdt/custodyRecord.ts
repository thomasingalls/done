import { HISTORY_PAGE_LIMIT } from '../../account-protocol/historyExchange';
import { parseSealedCreationSeed, type SealedCreationSeed } from './creationSeed';
import {
  fields,
  hex,
  hkdf,
  utf8,
  type Bytes,
  type KeyEnvelope,
  type LockSeal,
  type SealedCredential,
} from './custodyCrypto';
import type { SessionTask } from './writeSession';

export type CustodyRefusal =
  | 'invalid-input'
  | 'confirmation-required'
  | 'enrollment-closed'
  | 'locked-existing'
  | 'missing-custody'
  | 'creation-pending'
  | 'migration-required'
  | 'repair-required'
  | 'unlock-failed'
  | 'seal-budget-exhausted'
  | 'storage-failed';
export class CustodyError extends Error {
  override readonly name = 'CustodyError';
  constructor(
    readonly code: CustodyRefusal,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
export interface CustodyScope {
  slotId: string;
  principalId: string;
  workspaceId: string;
}
export interface CreationIntent {
  id: string;
  storeId: string;
  rootId: string;
  wrappingId: string;
  signingId: string;
}
export interface CustodyRecord {
  v: 2;
  state: 'creating' | 'protected';
  slot_id: string;
  principal_id: string;
  workspace_id: string;
  store_id: string;
  root_id: string;
  seals: [LockSeal];
  seal_reserved: number;
  rotation_owed: false;
  creation_intent: CreationIntent | null;
  envelope: KeyEnvelope | null;
  credentials: [SealedCredential, SealedCredential] | null;
  /** Private content-approval state. Absence is covered by the custody MAC too. */
  approval?: { v: 1; sequence: number; ct: Bytes };
  /** Separate encrypted rotation/applying state; older readers fail closed on this field. */
  rotation?: { v: 1; sequence: number; ct: Bytes };
  /** Encrypted checkpoint attempts; separate from enrollment and generation custody. */
  history?: { v: 1; sequence: number; ct: Bytes };
  /** Local commit pointer; installed atomically with the matching account membership. */
  active_rotation?: string;
  /** Replacement's first network generation; selected before its empty carrier is initialized. */
  initial_account?: {
    generation: number;
    deliveryHash: string;
    key: { sequence: number; ct: string };
  };
  /** Only present during seeded creation; the immutable Local claim retains its restart copy. */
  creation_seed?: SealedCreationSeed;
  mac: Bytes;
}
export const CUSTODY_DB = 'done.custody';
export const CUSTODY_STORE = 'entries';
export const SEAL_LIMIT = 2 ** 32;
export const CUSTODY_PROGRESS_LIMITS = {
  approval: 80 * 1024 * 1024,
  rotation: 16 * 1024 * 1024,
  history: HISTORY_PAGE_LIMIT + 16,
} as const;
export const recordKey = (scope: CustodyScope): string[] => [
  scope.slotId,
  scope.principalId,
  scope.workspaceId,
];
const fail = (): never => {
  throw new CustodyError(
    'repair-required',
    'Custody metadata is incomplete, unsupported, or inconsistent.',
  );
};
const object = (value: unknown, keys: string[]): Record<string, unknown> => {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).sort().join(',') !== keys.sort().join(',')
  )
    return fail();
  return value as Record<string, unknown>;
};
const bytes = (value: unknown, length: number): Bytes => {
  if (!(value instanceof Uint8Array) || value.byteLength !== length) return fail();
  return value.slice();
};
export const identity = (value: unknown): string => {
  if (typeof value !== 'string' || !value.length || value.length > 1024) return fail();
  try {
    fields(value);
  } catch {
    return fail();
  }
  return value;
};
const id = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[0-9a-f]{32}$/u.test(value)) return fail();
  return value;
};
const seal = (value: unknown, factor: 'code' | 'prf', expectedId: string): LockSeal => {
  const r = object(value, ['v', 'factor', 'id', 'salt', 'nonce', 'ct']);
  if (r['v'] !== 1 || r['factor'] !== factor || r['id'] !== expectedId) return fail();
  return {
    v: 1,
    factor,
    id: expectedId,
    salt: bytes(r['salt'], 16),
    nonce: bytes(r['nonce'], 12),
    ct: bytes(r['ct'], 48),
  };
};
const credential = (value: unknown, role: 'wrapping' | 'signing'): SealedCredential => {
  const r = object(value, ['role', 'id', 'publicKey', 'sealed']);
  if (r['role'] !== role) return fail();
  const sealed = object(r['sealed'], ['v', 'nonce', 'ct']);
  if (sealed['v'] !== 2) return fail();
  return {
    role,
    id: id(r['id']),
    publicKey: bytes(r['publicKey'], 32),
    sealed: { v: 2, nonce: bytes(sealed['nonce'], 12), ct: bytes(sealed['ct'], 48) },
  };
};
export const parseRecord = (value: unknown, scope: CustodyScope): CustodyRecord => {
  if (
    value &&
    typeof value === 'object' &&
    (('v' in value && value.v === 1) || ('state' in value && value.state === 'migrating'))
  )
    throw new CustodyError(
      'migration-required',
      'This custody needs the explicit migration owner.',
    );
  const r = object(value, [
    'v',
    'state',
    'slot_id',
    'principal_id',
    'workspace_id',
    'store_id',
    'root_id',
    'seals',
    'seal_reserved',
    'rotation_owed',
    'creation_intent',
    'envelope',
    'credentials',
    'mac',
    ...[
      'approval',
      'rotation',
      'history',
      'active_rotation',
      'initial_account',
      'creation_seed',
    ].filter((key) => value && typeof value === 'object' && Object.hasOwn(value, key)),
  ]);
  if (
    r['v'] !== 2 ||
    (r['state'] !== 'creating' && r['state'] !== 'protected') ||
    r['rotation_owed'] !== false ||
    r['slot_id'] !== scope.slotId ||
    r['principal_id'] !== scope.principalId ||
    r['workspace_id'] !== scope.workspaceId ||
    !Number.isSafeInteger(r['seal_reserved']) ||
    (r['seal_reserved'] as number) < 0 ||
    (r['seal_reserved'] as number) >= SEAL_LIMIT ||
    !Array.isArray(r['seals']) ||
    r['seals'].length !== 1
  )
    return fail();
  const storeId = id(r['store_id']),
    rootId = id(r['root_id']);
  let intent: CreationIntent | null = null;
  let envelope: KeyEnvelope | null = null;
  let credentials: [SealedCredential, SealedCredential] | null = null;
  if (r['state'] === 'creating') {
    const i = object(r['creation_intent'], ['id', 'storeId', 'rootId', 'wrappingId', 'signingId']);
    intent = {
      id: id(i['id']),
      storeId: id(i['storeId']),
      rootId: id(i['rootId']),
      wrappingId: id(i['wrappingId']),
      signingId: id(i['signingId']),
    };
    if (
      intent.storeId !== storeId ||
      intent.rootId !== rootId ||
      r['envelope'] !== null ||
      r['credentials'] !== null
    )
      return fail();
  } else {
    if (
      r['creation_intent'] !== null ||
      (r['seal_reserved'] as number) < 3 ||
      !Array.isArray(r['credentials']) ||
      r['credentials'].length !== 2
    )
      return fail();
    const e = object(r['envelope'], ['v', 'gen', 'nonce', 'ct']);
    if (e['v'] !== 1 || e['gen'] !== 1) return fail();
    envelope = { v: 1, gen: 1, nonce: bytes(e['nonce'], 12), ct: bytes(e['ct'], 48) };
    credentials = [
      credential(r['credentials'][0], 'wrapping'),
      credential(r['credentials'][1], 'signing'),
    ];
    if (credentials[0].id === credentials[1].id) return fail();
  }
  const progress: Pick<CustodyRecord, 'approval' | 'rotation' | 'history'> = {};
  for (const channel of ['approval', 'rotation', 'history'] as const) {
    if (!(channel in r)) continue;
    const a = object(r[channel], ['v', 'sequence', 'ct']);
    if (
      r['state'] !== 'protected' ||
      a['v'] !== 1 ||
      !Number.isSafeInteger(a['sequence']) ||
      (a['sequence'] as number) < 1 ||
      (a['sequence'] as number) > (r['seal_reserved'] as number) ||
      !(a['ct'] instanceof Uint8Array) ||
      a['ct'].length < 16 ||
      a['ct'].length > CUSTODY_PROGRESS_LIMITS[channel]
    )
      return fail();
    progress[channel] = { v: 1, sequence: a['sequence'] as number, ct: a['ct'].slice() };
  }
  let activeRotation: string | undefined;
  let initialAccount: CustodyRecord['initial_account'];
  if ('initial_account' in r) {
    const a = object(r['initial_account'], ['generation', 'deliveryHash', 'key']);
    const k = object(a['key'], ['sequence', 'ct']);
    if (
      r['state'] !== 'protected' ||
      !Number.isSafeInteger(a['generation']) ||
      (a['generation'] as number) < 2 ||
      (a['generation'] as number) > 0xffffffff ||
      typeof a['deliveryHash'] !== 'string' ||
      !/^[a-f0-9]{64}$/.test(a['deliveryHash']) ||
      !Number.isSafeInteger(k['sequence']) ||
      (k['sequence'] as number) < 1 ||
      (k['sequence'] as number) > (r['seal_reserved'] as number) ||
      typeof k['ct'] !== 'string' ||
      !/^[a-f0-9]{96}$/.test(k['ct'])
    )
      return fail();
    initialAccount = {
      generation: a['generation'] as number,
      deliveryHash: a['deliveryHash'],
      key: { sequence: k['sequence'] as number, ct: k['ct'] },
    };
  }
  if ('active_rotation' in r) {
    if (
      !progress.rotation ||
      typeof r['active_rotation'] !== 'string' ||
      !/^[a-f0-9]{64}$/.test(r['active_rotation'])
    )
      return fail();
    activeRotation = r['active_rotation'];
  }
  const creationSeed = Object.hasOwn(r, 'creation_seed')
    ? parseSealedCreationSeed(r['creation_seed'])
    : undefined;
  if (creationSeed && r['state'] !== 'creating') return fail();
  return {
    v: 2,
    ...(creationSeed ? { creation_seed: creationSeed } : {}),
    ...(activeRotation ? { active_rotation: activeRotation } : {}),
    ...(initialAccount ? { initial_account: initialAccount } : {}),
    ...progress,
    state: r['state'] as CustodyRecord['state'],
    slot_id: scope.slotId,
    principal_id: scope.principalId,
    workspace_id: scope.workspaceId,
    store_id: storeId,
    root_id: rootId,
    seals: [seal(r['seals'][0], 'code', 'code')],
    seal_reserved: r['seal_reserved'] as number,
    rotation_owed: false,
    creation_intent: intent,
    envelope,
    credentials,
    mac: bytes(r['mac'], 32),
  };
};
const sealTuple = (s: LockSeal) => [s.v, s.factor, s.id, hex(s.salt), hex(s.nonce), hex(s.ct)];
/** Closed, ordered encoding; JSON object enumeration order never enters the MAC. */
export const recordPayload = (r: CustodyRecord): Bytes =>
  utf8(
    JSON.stringify([
      'done/custody-metadata/v2',
      r.v,
      r.state,
      r.slot_id,
      r.principal_id,
      r.workspace_id,
      r.store_id,
      r.root_id,
      r.seals.map(sealTuple),
      r.seal_reserved,
      r.rotation_owed,
      r.creation_intent
        ? [
            r.creation_intent.id,
            r.creation_intent.storeId,
            r.creation_intent.rootId,
            r.creation_intent.wrappingId,
            r.creation_intent.signingId,
          ]
        : null,
      r.envelope ? [r.envelope.v, r.envelope.gen, hex(r.envelope.nonce), hex(r.envelope.ct)] : null,
      r.credentials?.map((c) => [
        c.role,
        c.id,
        hex(c.publicKey),
        [c.sealed.v, hex(c.sealed.nonce), hex(c.sealed.ct)],
      ]) ?? null,
      ...(r.creation_seed
        ? [
            [
              'creation-seed',
              r.creation_seed.v,
              hex(r.creation_seed.salt),
              hex(r.creation_seed.nonce),
              hex(r.creation_seed.ct),
            ],
          ]
        : []),
      ...(r.approval
        ? [['content-approval', r.approval.v, r.approval.sequence, hex(r.approval.ct)]]
        : []),
      ...(r.active_rotation ? [['active-rotation', r.active_rotation]] : []),
      ...(r.rotation
        ? [['content-rotation', r.rotation.v, r.rotation.sequence, hex(r.rotation.ct)]]
        : []),
      ...(r.history
        ? [['history-maintenance', r.history.v, r.history.sequence, hex(r.history.ct)]]
        : []),
      ...(r.initial_account
        ? [
            [
              'initial-account',
              r.initial_account.generation,
              r.initial_account.deliveryHash,
              r.initial_account.key.sequence,
              r.initial_account.key.ct,
            ],
          ]
        : []),
    ]),
  );
const macKey = (root: Bytes, r: CustodyRecord, subtle: SubtleCrypto) =>
  hkdf(
    root,
    new Uint8Array(),
    fields('done/custody-metadata/v2', r.slot_id, r.principal_id, r.workspace_id, r.root_id),
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    ['sign', 'verify'],
    subtle,
  );
export const authenticateRecord = async (
  root: Bytes,
  r: CustodyRecord,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<void> => {
  if (!(await subtle.verify('HMAC', await macKey(root, r, subtle), r.mac, recordPayload(r))))
    throw new CustodyError('repair-required', 'Custody metadata authentication failed.');
};
export const signRecord = async (
  root: Bytes,
  r: CustodyRecord,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<CustodyRecord> => ({
  ...r,
  mac: new Uint8Array(await subtle.sign('HMAC', await macKey(root, r, subtle), recordPayload(r))),
});
export const recordEqual = (a: CustodyRecord, b: CustodyRecord): boolean =>
  hex(recordPayload(a)) === hex(recordPayload(b)) && hex(a.mac) === hex(b.mac);

export const openCustodyDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    let abandoned = false;
    const req = indexedDB.open(CUSTODY_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(CUSTODY_STORE);
    };
    req.onblocked = () => {
      abandoned = true;
      reject(new CustodyError('storage-failed', 'Custody database is blocked.'));
    };
    req.onerror = () =>
      reject(
        new CustodyError('storage-failed', 'Custody database could not open.', {
          cause: req.error,
        }),
      );
    req.onsuccess = () => {
      const db = req.result;
      if (abandoned) {
        db.close();
        return;
      }
      db.onversionchange = () => db.close();
      if (db.objectStoreNames.length !== 1 || !db.objectStoreNames.contains(CUSTODY_STORE)) {
        db.close();
        reject(new CustodyError('repair-required', 'Unknown custody database layout.'));
        return;
      }
      resolve(db);
    };
  });

/** Request success is provisional. All public reads/writes settle at transaction completion. */
export const transact = (
  db: IDBDatabase,
  task: SessionTask,
  scope: CustodyScope,
  expected?: CustodyRecord | null,
  next?: CustodyRecord,
): Promise<CustodyRecord | null> =>
  new Promise((resolve, reject) => {
    let result: CustodyRecord | null = null;
    let failure: unknown;
    const tx = task.step(() =>
      db.transaction(
        CUSTODY_STORE,
        next ? 'readwrite' : 'readonly',
        next ? { durability: 'strict' } : undefined,
      ),
    );
    const abort = () => {
      try {
        tx.abort();
      } catch {
        /* already settled */
      }
    };
    task.signal.addEventListener('abort', abort, { once: true });
    const detach = () => task.signal.removeEventListener('abort', abort);
    tx.oncomplete = () => {
      detach();
      if (failure) reject(failure);
      else resolve(result);
    };
    tx.onabort = () => {
      detach();
      reject(
        failure ??
          new CustodyError('storage-failed', 'Custody transaction did not commit.', {
            cause: tx.error,
          }),
      );
    };
    if (next) {
      try {
        if (tx.durability !== 'strict') throw Error('Strict durability unavailable');
      } catch (cause) {
        failure = new CustodyError('storage-failed', 'Strict transaction durability is required.', {
          cause,
        });
        abort();
        return;
      }
    }
    const store = tx.objectStore(CUSTODY_STORE);
    const req = store.get(recordKey(scope));
    req.onsuccess = () => {
      try {
        task.step(() => {
          result = req.result === undefined ? null : parseRecord(req.result, scope);
          if (next) {
            if (expected === null && result !== null)
              throw new CustodyError(
                'locked-existing',
                'Custody already exists; unlock the winning creation.',
              );
            if (expected && (!result || !recordEqual(result, expected)))
              throw new CustodyError('repair-required', 'Custody changed during the operation.');
            store.put(next, recordKey(scope));
            result = next;
          }
        });
      } catch (cause) {
        failure = cause;
        abort();
      }
    };
  });
