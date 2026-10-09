import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, marker, report } from './fixtures.mjs';
import { variants } from './representations.mjs';
import { LIMITS, assess } from './matcher.mjs';
import { acquire, REQUIRED } from './node-collector.mjs';
const needle = (id) => ({ id, values: [marker(id)] });
const rawResult = (raw, needles) => assess(raw.collections, needles, REQUIRED);
const matched = (r, id, surface) => r.matches.some((m) => m.needle === id && m.surface === surface);

test(
  'native neutral collector matrix: clean controls and planted representation per applicable surface',
  { timeout: 120000 },
  async (t) => {
    const f = await fixture(t),
      cells = [];
    for (const surface of REQUIRED)
      for (const kind of Object.keys(variants('example'))) {
        // Binary UTF-16 cannot be represented as a raw cookie/header. Other string APIs retain NUL code units.
        if (
          surface === 'cookies' &&
          ['utf16le', 'utf16be', 'json', 'escaped', 'byteArray', 'nested'].includes(kind)
        )
          continue;
        const id = 'cell' + cells.length,
          n = needle(id),
          bytes = variants(n.values[0])[kind];
        cells.push({
          id,
          surface,
          kind,
          n,
          raw: bytes.toString('base64'),
          text: bytes.toString('latin1'),
        });
      }
    const needles = cells.map((c) => c.n),
      clean = rawResult(await acquire(f), needles);
    assert.equal(clean.verdict, 'complete-no-prohibited-match', JSON.stringify(clean.issues));
    await f.page.evaluate(async (cells) => {
      const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open('unexpected-neutral-db', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('unknown');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction('unknown', 'readwrite');
          for (const c of cells.filter((c) => c.surface === 'indexedDB'))
            tx.objectStore('unknown').put({ payload: bytes(c.raw) }, c.id);
          tx.oncomplete = resolve;
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
      for (const name of ['localStorage', 'sessionStorage'])
        for (const c of cells.filter((c) => c.surface === name))
          globalThis[name].setItem(c.id, c.text);
      const cache = await caches.open('unexpected-cache');
      for (const c of cells.filter((c) => c.surface === 'cacheStorage'))
        await cache.put('/probe/' + c.id, new Response(bytes(c.raw)));
      const root = await navigator.storage.getDirectory(),
        dir = await root.getDirectoryHandle('unknown', { create: true });
      for (const c of cells.filter((c) => c.surface === 'opfs')) {
        const file = await dir.getFileHandle(c.id, { create: true }),
          w = await file.createWritable();
        await w.write(bytes(c.raw));
        await w.close();
      }
      for (const c of cells.filter((c) => c.surface === 'diagnostics:page')) console.log(c.text);
    }, cells);
    for (const c of cells.filter((c) => c.surface === 'cookies'))
      await f.context.addCookies([{ name: c.id, value: c.text, url: f.origin, httpOnly: true }]);
    await f.rpc(
      'plant',
      Object.fromEntries(
        ['core', 'authority'].map((name) => [
          name,
          cells.filter((c) => c.surface === 'sql:' + name).map((c) => ({ id: c.id, raw: c.raw })),
        ]),
      ),
    );
    for (const c of cells.filter((c) => c.surface === 'diagnostics:service'))
      await f.rpc('diagnostic', { text: c.text });
    const raw = await acquire(f),
      positive = rawResult(raw, needles);
    assert.equal(positive.verdict, 'prohibited-match');
    assert.deepEqual(positive.issues, []);
    for (const c of cells) assert(matched(positive, c.id, c.surface), c.surface + '/' + c.kind);
    // Omit each whole acquisition surface: both its detection assertion and required census must fail.
    const omissions = [];
    for (const surface of REQUIRED) {
      const probe = cells.find((c) => c.surface === surface);
      const omitted = rawResult(await acquire(f, { omit: surface }), [probe.n]);
      assert(omitted.issues.some((i) => i.surface === surface && i.reason === 'missing-collector'));
      assert(!matched(omitted, probe.id, surface));
      omissions.push(surface);
    }
    report('calibration-matrix', {
      cells: cells.map(({ id, surface, kind }) => ({
        id,
        surface,
        kind,
        clean: 'absent',
        plant: 'detected',
      })),
      omissions,
      issues: positive.issues,
      acquisitionStable: raw.stable,
    });
    report('calibration-matrix.raw', {
      notice: 'Synthetic calibration values, not personal data',
      ...raw,
    });
  },
);

test(
  'native structured clone, key, blob, view, header, chunk and false-coverage controls',
  { timeout: 90000 },
  async (t) => {
    const f = await fixture(t),
      names = [
        'key',
        'blob',
        'view',
        'map',
        'set',
        'file',
        'numeric',
        'chunk',
        'header',
        'cookie',
        'diagBlob',
        'diagView',
      ],
      ns = names.map(needle),
      lookup = Object.fromEntries(ns.map((n) => [n.id, n.values[0]]));
    const clean = rawResult(await acquire(f), ns);
    assert.equal(clean.verdict, 'complete-no-prohibited-match');
    await f.page.evaluate(async (v) => {
      const db = await new Promise((resolve) => {
        const r = indexedDB.open('second-unknown-db', 1);
        r.onupgradeneeded = () => {
          const s = r.result.createObjectStore('unknown');
          s.createIndex(v.key, 'unused');
        };
        r.onsuccess = () => resolve(r.result);
      });
      const padded = new Uint8Array(new TextEncoder().encode('prefix!' + v.view + 'suffix'));
      const row = {
        blob: new Blob([v.blob]),
        view: new Uint8Array(padded.buffer, 7, v.view.length),
        map: new Map([[v.map, 1]]),
        set: new Set([v.set]),
        file: new File([v.file], 'some-file'),
        numeric: [...new TextEncoder().encode(v.numeric)],
      };
      row[v.key] = 'metadata';
      row.cycle = row;
      row.opaque = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
      ]);
      await new Promise((resolve, reject) => {
        const tx = db.transaction('unknown', 'readwrite');
        tx.objectStore('unknown').put(row, 'row');
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
      db.close();
      const cache = await caches.open('header-cache');
      await cache.put(
        new Request(location.origin + '/header', { headers: { 'x-probe': v.header } }),
        new Response('empty', { headers: { 'x-probe': v.header } }),
      );
      const root = await navigator.storage.getDirectory(),
        file = await root.getFileHandle('chunk', { create: true }),
        w = await file.createWritable();
      await w.write('x'.repeat(65520) + v.chunk + 'tail');
      await w.close();
      document.cookie = 'readable=' + v.cookie + '; SameSite=Strict';
      console.log(new Blob([v.diagBlob]), new TextEncoder().encode(v.diagView));
    }, lookup);
    const rawBase = await acquire(f),
      base = rawResult(rawBase, ns);
    assert(rawBase.collections.some((c) => c.opaque?.some((k) => k.algorithm.name === 'AES-GCM')));
    assert.deepEqual(base.issues, []);
    for (const n of ns)
      assert(
        base.matches.some((m) => m.needle === n.id),
        n.id,
      );
    const controls = [];
    for (const [fault, id] of [
      ['blob', 'blob'],
      ['view', 'view'],
      ['truncate', 'chunk'],
    ]) {
      const r = rawResult(await acquire(f, { fault }), ns);
      assert(!r.matches.some((m) => m.needle === id), fault);
      controls.push(fault);
    }
    // Key-only marker also occurs in index metadata; use a separate object-property-only marker.
    const only = needle('propertyOnly');
    await f.page.evaluate(async (v) => {
      const db = await new Promise((resolve) => {
        const r = indexedDB.open('second-unknown-db');
        r.onsuccess = () => resolve(r.result);
      });
      await new Promise((resolve) => {
        const tx = db.transaction('unknown', 'readwrite');
        tx.objectStore('unknown').put({ [v]: 'not a needle' }, 'key-only');
        tx.oncomplete = resolve;
      });
      db.close();
    }, only.values[0]);
    assert(rawResult(await acquire(f), [only]).matches.length > 0);
    assert.equal(rawResult(await acquire(f, { fault: 'key' }), [only]).matches.length, 0);
    controls.push('key');
    const absent = rawResult(await acquire(f, { omit: 'localStorage' }), ns);
    assert(absent.issues.some((i) => i.reason === 'missing-collector'));
    const tiny = rawResult(await acquire(f, { limits: { ...LIMITS, valueBytes: 10 } }), ns);
    assert(tiny.issues.length > 0);
    await f.page.evaluate(async () => {
      const db = await new Promise((resolve) => {
        const r = indexedDB.open('second-unknown-db');
        r.onsuccess = () => resolve(r.result);
      });
      await new Promise((resolve) => {
        const tx = db.transaction('unknown', 'readwrite');
        tx.objectStore('unknown').put(/unsupported-clone/, 'unsupported');
        tx.oncomplete = resolve;
      });
      db.close();
    });
    const unknown = rawResult(await acquire(f), ns);
    assert(unknown.issues.some((i) => i.reason === 'unsupported-clone-type'));

    report('collector-controls', {
      controls,
      omission: 'detected',
      budget: 'incomplete',
      unsupportedClone: 'incomplete',
      opaqueCryptoKey: 'metadata observed; contents excluded',
      baselineMatches: base.matches.map(({ needle, surface, representation }) => ({
        needle,
        surface,
        representation,
      })),
    });
  },
);
