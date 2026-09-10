import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fc from 'fast-check';
import {
  readerChannel,
  decodeValue,
  readInventory,
} from '../../scripts/legacy-host-cold/observer.mjs';
import { denialConfig, triggerVerdict } from '../../scripts/legacy-host-cold/checks.mjs';

const remote = (bytes) => ({
  type: 'object',
  subtype: 'typedarray',
  className: 'Uint8Array',
  objectId: 'bytes',
  description: `Uint8Array(${bytes.length})`,
});
const properties = (bytes) =>
  [...bytes]
    .map((value, i) => ({ name: String(i), isOwn: true, value: { type: 'number', value } }))
    .reverse();
test('generated exact binary readback rejects missing bytes and always releases objects', async () => {
  await fc.assert(
    fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 2048 }), async (bytes) => {
      const calls = [];
      const channel = {
        send: async (method) => {
          calls.push(method);
          return { result: properties(bytes) };
        },
      };
      assert.deepEqual(await decodeValue(channel, 'session', remote(bytes)), { bytes: [...bytes] });
      assert.equal(calls.at(-1), 'Runtime.releaseObject');
      const corrupt = properties(bytes).slice(1);
      let released = false;
      await assert.rejects(
        decodeValue(
          {
            send: async (method) => {
              if (method === 'Runtime.releaseObject') released = true;
              return { result: corrupt };
            },
          },
          'session',
          remote(bytes),
        ),
        /observer-byte-truncation/,
      );
      assert.equal(released, true);
    }),
    { seed: 8941, numRuns: 200 },
  );
});
test('byte decoder refuses accessors, out-of-range bytes, duplicates, unsupported objects and previews', async () => {
  for (const result of [
    [{ name: '0', get: { objectId: 'getter' } }],
    [{ name: '0', value: { type: 'number', value: 256 } }],
    [...properties([1]), ...properties([1])],
  ]) {
    await assert.rejects(
      decodeValue({ send: async () => ({ result }) }, 's', remote([1])),
      /observer-(accessor|byte-property)/,
    );
  }
  for (const value of [
    { type: 'object', subtype: 'array', objectId: 'x' },
    { type: 'object', preview: { properties: [] } },
    { type: 'number', unserializableValue: 'NaN' },
  ])
    await assert.rejects(decodeValue({}, 's', value), /observer-value-unsupported/);
});
test('observation facade refuses source-string evaluation, mutation and fallback permissions', () => {
  let calls = 0;
  const channel = readerChannel({
    send() {
      calls++;
    },
  });
  for (const method of [
    'Runtime.evaluate',
    'Runtime.callFunctionOn',
    'DOMStorage.clear',
    'IndexedDB.deleteDatabase',
    'CacheStorage.deleteCache',
    'Emulation.setScriptExecutionDisabled',
    'Page.navigate',
    'Storage.clearDataForOrigin',
  ])
    assert.throws(() => channel.send(method, {}), /observer-command-forbidden/);
  assert.equal(calls, 0);
});
function nativeStub(rows, control) {
  let frames = 0,
    metadataReads = 0;
  const origin = 'http://127.0.0.1:43101';
  return {
    async send(method, params) {
      switch (method) {
        case 'Target.attachToTarget':
          return { sessionId: 'session' };
        case 'Page.getFrameTree':
          return {
            frameTree: {
              frame: {
                id: 'frame',
                loaderId: control === 'context' && frames++ ? 'new-loader' : 'loader',
                url: origin + '/inert',
              },
            },
          };
        case 'Storage.getStorageKeyForFrame':
          return { storageKey: origin + '/' };
        case 'DOMStorage.getDOMStorageItems':
          return { entries: [['unknown.😀', 'exact\u0000κ']] };
        case 'IndexedDB.requestDatabaseNames':
          return { databaseNames: ['native'] };
        case 'IndexedDB.requestDatabase':
          return {
            databaseWithObjectStores: {
              name: 'native',
              version: 1,
              objectStores: [
                { name: 'rows', autoIncrement: false, keyPath: { type: 'null' }, indexes: [] },
              ],
            },
          };
        case 'IndexedDB.getMetadata':
          return {
            entriesCount: rows.length + (control === 'changed' && metadataReads++ ? 1 : 0),
            keyGeneratorValue: 1,
          };
        case 'IndexedDB.requestData': {
          const offset = control === 'duplicate' && params.skipCount ? 0 : params.skipCount;
          const entries = rows.slice(offset, offset + params.pageSize).map(([key, value]) => ({
            primaryKey: { type: 'number', value: key },
            value:
              control === 'unknown'
                ? { type: 'object', subtype: 'array' }
                : { type: 'string', value },
          }));
          return {
            objectStoreDataEntries: entries,
            hasMore:
              control === 'omitted-page' ? false : params.skipCount + entries.length < rows.length,
          };
        }
        case 'CacheStorage.requestCacheNames':
          return { caches: [] };
        default:
          assert.ok(
            [
              'DOMStorage.enable',
              'IndexedDB.enable',
              'Runtime.releaseObjectGroup',
              'Target.detachFromTarget',
            ].includes(method),
            'only read commands',
          );
          return {};
      }
    },
  };
}
test('generated paged inventory agrees with independent ledger and catches page omission', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.string(), { minLength: 3, maxLength: 40 }),
      fc.integer({ min: 1, max: 2 }),
      async (values, pageSize) => {
        const rows = values.map((v, i) => [i, v]);
        const actual = await readInventory(nativeStub(rows), 'target', 'http://127.0.0.1:43101', {
          pageSize,
        });
        assert.deepEqual(actual.databases[0].stores[0].rows, rows);
        assert.deepEqual(actual.local, [['unknown.😀', 'exact\u0000κ']]);
        await assert.rejects(
          readInventory(nativeStub(rows, 'omitted-page'), 'target', 'http://127.0.0.1:43101', {
            pageSize,
          }),
          /observer-pagination/,
        );
        // The oracle includes unknown carriers: broad deletion cannot be accepted as preservation.
        assert.notDeepEqual({ ...actual, local: [] }, actual);
      },
    ),
    { seed: 8941, numRuns: 100 },
  );
});
test('observer refuses duplicate pages, moving storage, navigation and unknown values', async () => {
  const rows = [
    [0, 'zero'],
    [1, 'one'],
    [2, 'two'],
  ];
  for (const [control, reason] of [
    ['duplicate', 'duplicate-row'],
    ['changed', 'storage-changed'],
    ['context', 'context-changed'],
    ['unknown', 'value-unsupported'],
  ])
    await assert.rejects(
      readInventory(nativeStub(rows, control), 'target', 'http://127.0.0.1:43101', { pageSize: 2 }),
      new RegExp('observer-' + reason),
    );
});
test('denial preconditions reject missing/malformed/ignored/recommended/late/exception configurations', () => {
  const flags = { readonly: true, mandatory: true, beforeLaunch: true };
  denialConfig('{"DefaultJavaScriptSetting":2}', flags);
  for (const text of [
    '',
    '{',
    '{}',
    '{"DefaultJavaScriptSetting":1}',
    '{"DefaultJavaScriptSetting":2,"JavaScriptAllowedForUrls":["*"]}',
  ])
    assert.throws(() => denialConfig(text, flags));
  for (const flag of Object.keys(flags))
    assert.throws(() =>
      denialConfig('{"DefaultJavaScriptSetting":2}', { ...flags, [flag]: false }),
    );
  assert.equal(
    triggerVerdict({ denied: true, positiveWrite: true, delivered: false }),
    'trigger-unproven',
  );
  assert.equal(
    triggerVerdict({ denied: true, positiveWrite: false, delivered: false }),
    'control-failed',
  );
});
test('poll timeout terminates its process without an orphan polling loop', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {poll} from './scripts/legacy-host-cold/checks.mjs';await poll('absent',()=>false,Boolean,30).catch(()=>{});`,
    ],
    { timeout: 2000, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.error, undefined);
});
