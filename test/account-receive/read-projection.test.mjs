import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import {
  native,
  selected,
  openReceive,
  closeReceive,
  request,
  receive,
  envelope,
  answer,
  cold,
} from './fixtures.mjs';

const reference = process.env.RECEIVE_PROJECTION_REFERENCE;
let referenceBundle;
async function setup(t, id, count = 8) {
  const f = await native(t);
  if (reference) {
    referenceBundle ??= (async () => {
      let hits = 0;
      const result = await build({
        configFile: false,
        logLevel: 'error',
        plugins: [
          {
            name: 'projection-reference',
            enforce: 'pre',
            transform(code, id) {
              if (id.endsWith('/src/crdt/accountReceive.ts')) {
                hits++;
                return readFileSync(reference, 'utf8');
              }
            },
          },
        ],
        build: {
          write: false,
          minify: false,
          lib: {
            entry: resolve('test/account-receive/browser.ts'),
            name: 'Harness',
            formats: ['iife'],
          },
        },
      });
      assert.equal(hits, 1);
      return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk')
        .code;
    })();
    const script = await referenceBundle,
      base = f.setup;
    f.setup = async (p) => {
      await base(p);
      await p.evaluate(script);
    };
    await f.page.evaluate(script);
  }
  const item = await selected(f, id);
  const updates = await f.page.evaluate((count) => {
    const d = new Harness.Y.Doc({ gc: false }),
      rows = [];
    d.clientID = 908227;
    d.on('update', (b) => rows.push([...b]));
    for (let i = 0; i < count; i++) d.getText('projection-fixture').insert(i, String(i % 10));
    d.destroy();
    return rows;
  }, count);
  const wires = [];
  for (let i = 0; i < count; i++) wires.push(await envelope(f.page, item, i + 1, [updates[i]]));
  await openReceive(f.page, item);
  let previous;
  for (let i = 0; i < count; i++) {
    const reply = answer(f, item, await request(f.page), wires[i], previous, count);
    previous = reply.link;
    assert.equal((await receive(f.page, reply.bytes)).kind, 'received');
  }
  return { f, item, wires };
}

test(
  'owned read preparation and frozen status never clone retained receipt payloads',
  { timeout: 60000 },
  async (t) => {
    const { f, item, wires } = await setup(t, 'read-projection');
    const observed = await f.page.evaluate(async () => {
      const clone = globalThis.structuredClone,
        seen = [];
      const payloadBytes = (v, visited = new Set()) => {
        if (!v || typeof v !== 'object' || visited.has(v)) return 0;
        visited.add(v);
        if (v instanceof Uint8Array) return v.byteLength;
        if (v instanceof Map)
          return [...v.values()].reduce((n, x) => n + payloadBytes(x, visited), 0);
        return Object.values(v).reduce((n, x) => n + payloadBytes(x, visited), 0);
      };
      globalThis.structuredClone = (value, ...args) => {
        if (value && typeof value === 'object') {
          if (Object.hasOwn(value, 'inbound') && Object.hasOwn(value, 'pendingSelf'))
            seen.push({
              kind: 'preparation',
              bytes: payloadBytes(value),
              hasRetained: 'retained' in value.inbound,
            });
          else if (value.retained instanceof Map && value.prefix)
            seen.push({ kind: 'full-status', bytes: payloadBytes(value), hasRetained: true });
          else if (
            Object.hasOwn(value, 'receivedThrough') &&
            Object.hasOwn(value, 'observedThrough')
          )
            seen.push({ kind: 'status', bytes: payloadBytes(value), hasRetained: false });
        }
        return clone(value, ...args);
      };
      try {
        await receiver.prepareRead();
        const current = await receiver.status();
        return { seen, frozen: Object.isFrozen(current), status: current };
      } finally {
        globalThis.structuredClone = clone;
      }
    });
    t.diagnostic(
      JSON.stringify({
        projectionClones: observed.seen,
        frozen: observed.frozen,
        receivedThrough: observed.status.receivedThrough,
      }),
    );
    assert.equal(observed.status.receivedThrough, 8);
    assert.equal(observed.frozen, true);
    assert(observed.seen.some((s) => s.kind === 'preparation'));
    assert(observed.seen.some((s) => s.kind === 'status'));
    assert.equal(
      observed.seen.reduce((n, s) => n + s.bytes, 0),
      0,
    );
    assert(observed.seen.every((s) => !s.hasRetained));
    const replay = answer(f, item, await request(f.page, 0), wires[0], undefined, 8);
    assert.equal(
      (await receive(f.page, replay.bytes)).kind,
      'duplicate',
      'full retained evidence remains available for old-position verification',
    );
    await closeReceive(f.page);
    await cold(f);
    assert.equal((await openReceive(f.page, item)).receivedThrough, 8);
    await closeReceive(f.page);
  },
);

test(
  'narrow request hints preserve conflict persistence and stop later reads',
  { timeout: 60000 },
  async (t) => {
    const { f, item } = await setup(t, 'cursor-conflict', 2);
    await closeReceive(f.page);
    const other = await envelope(f.page, item, 1, [[0, 0]]);
    await openReceive(f.page, item);
    const reply = answer(f, item, await request(f.page, 0), other, undefined, 2);
    const result = await receive(f.page, reply.bytes);
    assert.equal(result.kind, 'conflict');
    assert.equal(result.status.state, 'conflict');
    await assert.rejects(request(f.page), /conflicted/);
    await closeReceive(f.page);
    await cold(f);
    assert.equal((await openReceive(f.page, item)).state, 'conflict');
    await closeReceive(f.page);
  },
);
