/** Generic SQL, cookies and diagnostics acquisition. No product modules or table allowlists. */
import { DatabaseSync } from 'node:sqlite';
import { statSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { collectBrowser } from './browser-collector.mjs';
import { LIMITS } from './matcher.mjs';
export const REQUIRED = [
  'indexedDB',
  'localStorage',
  'sessionStorage',
  'cacheStorage',
  'opfs',
  'cookies',
  'sql:core',
  'sql:authority',
  'diagnostics:page',
  'diagnostics:service',
];
export function collectValues(surface, value, limits = LIMITS) {
  const c = { surface, entries: [], errors: [], complete: true };
  let bytes = 0;
  const add = (location, value, type) => {
    const raw = Buffer.from(value);
    bytes += raw.length;
    if (raw.length > limits.valueBytes || bytes > limits.surfaceBytes)
      throw Error('acquisition-byte-budget');
    c.entries.push({ location, type, raw: raw.toString('base64') });
  };
  const seen = new Set();
  const walk = (v, p, depth) => {
    if (depth > limits.cloneDepth) throw Error('clone-depth-budget');
    if (typeof v === 'string') return add(p, v, 'string');
    if (v === null || ['number', 'boolean', 'bigint', 'undefined'].includes(typeof v))
      return add(p, String(v), 'scalar');
    if (seen.has(v)) return;
    seen.add(v);
    if (ArrayBuffer.isView(v))
      return add(p, new Uint8Array(v.buffer, v.byteOffset, v.byteLength), 'bytes');
    if (v instanceof ArrayBuffer) return add(p, new Uint8Array(v), 'bytes');
    if (!Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v)))
      throw Error('unsupported-clone-type');
    for (const k of Reflect.ownKeys(v)) {
      if (typeof k !== 'string') throw Error('unsupported-symbol-key');
      add([...p, 'property-key', k], k, 'key');
      const d = Object.getOwnPropertyDescriptor(v, k);
      if (!('value' in d)) throw Error('unsupported-accessor');
      walk(d.value, [...p, k], depth + 1);
    }
  };
  try {
    walk(value, [], 0);
  } catch (e) {
    c.complete = false;
    c.errors.push(e.message);
  }
  return c;
}
export function collectSql(path, surface, limits = LIMITS) {
  let db;
  try {
    if (!statSync(path).isFile()) throw Error('missing-sql-file');
    db = new DatabaseSync(path, { readOnly: true });
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000; BEGIN;');
    const schema = db
      .prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name')
      .all();
    const tables = [];
    for (const s of schema.filter((s) => s.type === 'table')) {
      const quoted = '"' + s.name.replaceAll('"', '""') + '"';
      const stmt = db.prepare('SELECT * FROM ' + quoted);
      stmt.setReadBigInts(true);
      tables.push({
        name: s.name,
        columns: db.prepare('PRAGMA table_info(' + quoted + ')').all(),
        rows: stmt.all(),
      });
    }
    const result = collectValues(surface, { schema, tables }, limits);
    db.exec('ROLLBACK;');
    return result;
  } catch (e) {
    return { surface, entries: [], complete: false, errors: [e.message] };
  } finally {
    db?.close();
  }
}
/** Terminate a blocked SQL reader; synchronous SQLite cannot be interrupted by a same-thread timer. */
export function boundedSql(path, surface, limits = LIMITS) {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./sql-worker.mjs', import.meta.url), {
      workerData: { path, surface, limits },
    });
    let done = false;
    const finish = async (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      await worker.terminate();
      resolve(result);
    };
    const failed = (reason) => finish({ surface, entries: [], complete: false, errors: [reason] });
    const timer = setTimeout(() => failed('collector-timeout'), limits.collectorMs);
    worker.on('message', finish);
    worker.on('error', () => failed('sql-worker-error'));
    worker.on('exit', () => {
      if (!done) failed('sql-worker-exited');
    });
  });
}

/** Two full acquisitions are compared raw, before matching/hashing. Neither is a whole-origin atomic snapshot. */
export async function acquire(f, options = {}) {
  const limits = options.limits ?? LIMITS;
  const once = async () => {
    const result = [];
    for (const [i, page] of f.context.pages().entries())
      if (page.url().startsWith(f.origin)) {
        const read = await page.evaluate(collectBrowser, {
          limits,
          omit: options.omit ?? '',
          fault: options.fault ?? '',
        });
        for (const c of read) {
          c.page = i;
          result.push(c);
        }
      }
    if (options.omit !== 'cookies')
      result.push(collectValues('cookies', await f.context.cookies(), limits));
    for (const [name, path] of Object.entries(f.dbPaths))
      if (options.omit !== 'sql:' + name)
        result.push(await boundedSql(path, 'sql:' + name, limits));
    if (options.omit !== 'diagnostics:page')
      result.push(collectValues('diagnostics:page', await f.diagnostics(), limits));
    // A child stdout/stderr fence ensures all earlier bytes have reached the parent.
    await f.rpc('barrier');
    if (options.omit !== 'diagnostics:service')
      result.push(collectValues('diagnostics:service', f.serviceDiagnostics(), limits));
    const diagnosticErrors = f.diagnosticErrors?.() ?? [];
    for (const c of result.filter((c) => c.surface.startsWith('diagnostics:')))
      if (diagnosticErrors.length) {
        c.complete = false;
        c.errors.push(...diagnosticErrors);
      }
    return result;
  };
  const before = await once(),
    after = await once();
  const signature = (all) =>
    JSON.stringify(
      all.map((c) => ({
        surface: c.surface,
        page: c.page,
        // Observer IPC fences are scanned verbatim, then excluded only from the stability comparison.
        entries:
          c.surface === 'diagnostics:service'
            ? c.entries.map((e) => ({
                ...e,
                raw: Buffer.from(
                  Buffer.from(e.raw, 'base64')
                    .toString('latin1')
                    .replace(/\nRESIDUE-FENCE:\d+\n/g, ''),
                  'latin1',
                ).toString('base64'),
              }))
            : c.entries,
        errors: c.errors,
        opaque: c.opaque,
      })),
    );
  const stable = signature(before) === signature(after);
  if (!stable)
    for (const c of after) {
      c.complete = false;
      c.errors.push('acquisition-changed');
    }
  return {
    collections: before.concat(after),
    stable,
    passes: 2,
    opfsObservation: 'getDirectory may create origin bookkeeping',
    workerCoverage: await f.workers(),
    observerFrames:
      'stdout/stderr IPC fences retained and matched verbatim; excluded only from stability comparison',
  };
}
