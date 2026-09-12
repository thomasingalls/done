import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { instrument, clockSeam, targets, verificationOracle } from './instrument.mjs';
import { installProbe } from './probe.mjs';

test('every current source anchor is exact; duplicate or missing anchors refuse', () => {
  const hits = {};
  for (const path of Object.keys(targets)) instrument(readFileSync('.' + path, 'utf8'), path, hits);
  assert.equal(Object.keys(hits).length, 12);
  assert(Object.values(hits).every((n) => n === 1));
  assert.throws(() => instrument('', '/src/crdt/contentStore.ts'));
  const code = readFileSync('src/crdt/contentStore.ts', 'utf8');
  assert.throws(() =>
    instrument(code + '\nconst load = async () => 1;', '/src/crdt/contentStore.ts'),
  );
  assert.throws(() => clockSeam('', '/src/crdt/accountReceive.ts'));
  assert.throws(() => verificationOracle('', '/src/crdt/accountReceive.ts'));
  verificationOracle(
    readFileSync('src/crdt/accountReceive.ts', 'utf8'),
    '/src/crdt/accountReceive.ts',
  );
});

test('probe preserves async result, awaited work, throws and crypto; never retains arguments', async () => {
  installProbe();
  const source = `export const openSnapshot = async (task, snapshot) => {
    await task(); if (snapshot.fail) throw Error('expected'); return snapshot.rows.length;
  }; export const load = async (task, snapshot) => openSnapshot(task, snapshot);`;
  const module = await import(
    'data:text/javascript;base64,' +
      Buffer.from(stripTypeScriptTypes(instrument(source, '/src/crdt/contentStore.ts'))).toString(
        'base64',
      )
  );
  let release;
  livenessProbe.reset();
  const work = module.load(() => new Promise((r) => (release = r)), { rows: [1, 2] });
  assert.throws(() => livenessProbe.stop(), /active/);
  release();
  assert.equal(await work, 2);
  await assert.rejects(
    module.load(async () => {}, { rows: [], fail: true }),
    /expected/,
  );
  const secret = new TextEncoder().encode('synthetic probe argument');
  assert.equal((await crypto.subtle.digest('SHA-256', secret)).byteLength, 32);
  const result = livenessProbe.stop();
  assert.equal(result.rows['content.load'].calls, 2);
  assert.equal(result.rows['content.open'].size, 2);
  assert.equal(result.rows['crypto.digest'].calls, 1);
  assert(!JSON.stringify(result).includes('synthetic probe argument'));
  const end = livenessProbe.start('disabled');
  assert.equal(end, undefined);
});
