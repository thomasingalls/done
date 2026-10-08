/** Exact-coverage local re-encryption. The caller holds exclusive slot ownership and a durable
 * authenticated apply record with the successor opener. This does not retire any opener. */
import { equalStoredRecord, type DiskState } from './contentCompaction';
import { contentTransaction } from './contentDatabase';
import {
  CONTENT_STORES,
  CONTENT_LIMIT,
  counterPayload,
  equalCounter,
  parseCounter,
  parseStoredRecord,
  recordStore,
  corrupt,
  type ContentCounter,
  type ContentIdentity,
  type StoredRecord,
  type OpenedRecord,
} from './contentRecord';
import type { ContentCrypto } from './contentStore';
import type { SessionTask } from './writeSession';
import type { Bytes } from './custodyCrypto';

export interface ContentRotation {
  generation: number;
  /** Commits a non-reusable invocation range in authenticated custody BEFORE any encryption.
   * Returns the cumulative count for this key (a conservative shared count is also safe). */
  reserve(count: number): Promise<number>;
  seal(header: Omit<StoredRecord, 'nonce' | 'ct'>, plain: Bytes): Promise<StoredRecord>;
  open(record: StoredRecord): Promise<Bytes>;
  /** Synchronous fresh census; must throw unless all journal work is durably covered. */
  checkJournal(): void;
}
/** Only the verified replacement installer may call this, after committing its custody opener.
 * It changes an unused counter, never rewrites content or reuses an allocated invocation. */
export async function initializeEmptyAccountGeneration(
  task: SessionTask,
  owner: {
    db: IDBDatabase;
    scope: ContentIdentity;
    generation: number;
    intent: string;
    read(): Promise<DiskState>;
    crypt: ContentCrypto;
  },
  checkJournal: () => void,
) {
  const snapshot = await owner.read(),
    before = snapshot.counter;
  if (!before || !(await owner.crypt.verify(task, counterPayload(owner.scope, before), before.mac)))
    return corrupt('Initial account counter authentication failed.');
  task.step(checkJournal);
  if (before.active_gen === owner.generation) return; // committed transition, including later install prefixes
  if (
    !Number.isSafeInteger(owner.generation) ||
    owner.generation < 2 ||
    owner.generation > 0xffffffff ||
    before.v !== 1 ||
    before.active_gen !== 1 ||
    before.next_seq !== 1 ||
    snapshot.rows.length ||
    Object.keys(before.reserved).join(',') !== '1' ||
    before.reserved['1'] !== 0
  )
    corrupt('Initial account generation requires an untouched empty carrier.');
  let next: ContentCounter = {
    ...before,
    active_gen: owner.generation,
    reserved: { 1: 0, [owner.generation]: 0 },
  };
  next = { ...next, mac: await owner.crypt.sign(task, counterPayload(owner.scope, next)) };
  await task.wait(() =>
    contentTransaction<void>(
      owner.db,
      task,
      [...CONTENT_STORES],
      'readwrite',
      (tx, _result, guard) => {
        let remaining = CONTENT_STORES.length;
        for (const name of CONTENT_STORES) {
          let seen = false;
          const req = tx.objectStore(name).openCursor();
          req.onsuccess = () =>
            guard(() => {
              const row = req.result;
              if (row) {
                if (
                  name !== 'meta' ||
                  seen ||
                  row.key !== 'counter' ||
                  !equalCounter(
                    owner.scope,
                    parseCounter(row.value, owner.scope, owner.intent),
                    before,
                  )
                )
                  corrupt('Carrier changed before initial generation activation.');
                seen = true;
                row.continue();
                return;
              }
              if (name === 'meta' && !seen) corrupt('Initial counter disappeared.');
              if (--remaining === 0) {
                checkJournal();
                tx.objectStore('meta').put(next, 'counter');
              }
            });
        }
      },
      'strict',
    ),
  );
}
export async function rotateContent(
  task: SessionTask,
  owner: {
    db: IDBDatabase;
    scope: ContentIdentity;
    generation: number;
    intent: string;
    read(): Promise<DiskState>;
    authenticate(snapshot: DiskState): Promise<OpenedRecord[]>;
    crypt: ContentCrypto;
  },
  next: ContentRotation,
): Promise<void> {
  next = {
    generation: next.generation,
    reserve: next.reserve.bind(next),
    seal: next.seal.bind(next),
    open: next.open.bind(next),
    checkJournal: next.checkJournal.bind(next),
  };
  if (
    !Number.isSafeInteger(next.generation) ||
    next.generation !== owner.generation + 1 ||
    next.generation > 0xffffffff
  )
    corrupt('Rotation must name the immediate successor generation.');
  const snapshot = await owner.read();
  const opened = await owner.authenticate(snapshot);
  try {
    const before = snapshot.counter!;
    if (before.active_gen !== owner.generation) corrupt('Rotation predecessor changed.');
    task.step(next.checkJournal);
    const reserved = await task.wait(() => next.reserve(opened.length));
    if (!Number.isSafeInteger(reserved) || reserved < opened.length || reserved >= CONTENT_LIMIT)
      corrupt('Invalid successor invocation reservation.');
    const replacements: StoredRecord[] = [];
    for (const record of opened) {
      const header = { v: 1 as const, gen: next.generation, seq: record.seq, kind: record.kind };
      const sealed = parseStoredRecord(await task.wait(() => next.seal(header, record.bytes)));
      if (sealed.gen !== header.gen || sealed.seq !== header.seq || sealed.kind !== header.kind)
        corrupt('Successor record header changed.');
      const cold = await task.wait(() => next.open(sealed));
      try {
        if (cold.length !== record.bytes.length || cold.some((b, i) => b !== record.bytes[i]))
          corrupt('Successor content did not reopen exactly.');
      } finally {
        cold.fill(0);
      }
      replacements.push(sealed);
    }
    let counter: ContentCounter = {
      ...before,
      active_gen: next.generation,
      next_seq: before.next_seq + reserved,
      reserved: { ...before.reserved, [next.generation]: reserved },
    };
    counter = {
      ...counter,
      mac: await owner.crypt.sign(task, counterPayload(owner.scope, counter)),
    };
    await task.wait(() =>
      contentTransaction<void>(
        owner.db,
        task,
        [...CONTENT_STORES],
        'readwrite',
        (tx, _result, guard) => {
          const rows: DiskState['rows'] = [];
          let current: ContentCounter | null = null,
            complete = 0;
          const finish = () => {
            if (++complete !== CONTENT_STORES.length) return;
            if (
              !current ||
              !equalCounter(owner.scope, current, before) ||
              rows.length !== snapshot.rows.length
            )
              corrupt('Content changed before generation activation.');
            const expected = new Map(snapshot.rows.map((r) => [r.store + ':' + String(r.key), r]));
            for (const row of rows) {
              const saved = expected.get(row.store + ':' + String(row.key));
              if (
                !saved ||
                row.key !== saved.key ||
                !equalStoredRecord(parseStoredRecord(row.value), parseStoredRecord(saved.value))
              )
                corrupt('Content census changed before generation activation.');
            }
            // The same slot permit excludes all conforming writers; the synchronous check also catches
            // an unexpected journal append before this atomic disk replacement.
            next.checkJournal();
            for (const record of replacements)
              tx.objectStore(recordStore(record.kind)).put(record, record.seq);
            tx.objectStore('meta').put(counter, 'counter');
          };
          for (const name of CONTENT_STORES) {
            const request = tx.objectStore(name).openCursor();
            request.onsuccess = () =>
              guard(() => {
                const c = request.result;
                if (!c) {
                  finish();
                  return;
                }
                if (name === 'meta') {
                  if (current || c.key !== 'counter')
                    corrupt('Unknown metadata during generation activation.');
                  current = parseCounter(c.value, owner.scope, owner.intent);
                } else rows.push({ store: name, key: c.key, value: c.value });
                c.continue();
              });
          }
        },
        'strict',
      ),
    );
  } finally {
    for (const r of opened) r.bytes.fill(0);
  }
}
