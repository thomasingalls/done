import test from 'node:test';
import assert from 'node:assert/strict';
import { native } from '../account-promotion/fixtures.mjs';
import { bundle, promotions, report } from './helpers.mjs';

test(
  'IndexedDB retains sparse and coercible data; cold parser readback refuses each malformed record',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t);
    await f.page.evaluate(await bundle(undefined, true));
    const input = structuredClone(promotions[12]);
    input.mac = Array.from(input.mac);
    for (const c of input.credentials) {
      c.publicKey = Array.from(c.publicKey);
      c.sealed.nonce = Array.from(c.sealed.nonce);
      c.sealed.ct = Array.from(c.sealed.ct);
    }
    const result = await f.page.evaluate(async (input) => {
      input.mac = new Uint8Array(input.mac);
      for (const c of input.credentials) {
        c.publicKey = new Uint8Array(c.publicKey);
        c.sealed.nonce = new Uint8Array(c.sealed.nonce);
        c.sealed.ct = new Uint8Array(c.sealed.ct);
      }
      const samples = [input];
      for (const change of [
        'credentials',
        'actors',
        'wraps',
        'stage',
        'promotionId',
        'requestDigest',
        'epochHead',
      ]) {
        const v = structuredClone(input);
        if (change === 'credentials') delete v.credentials[1];
        else if (change === 'actors') delete v.genesis.actors[1];
        else if (change === 'wraps') delete v.genesis.wraps[1];
        else if (change === 'stage') v.stage = [v.stage];
        else v.handoff.destination.account[change] = [v.handoff.destination.account[change]];
        samples.push(v);
      }
      const open = () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open('parser-conformance', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('records');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      let db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readwrite');
        samples.forEach((v, i) => tx.objectStore('records').put(v, i));
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
      db.close();
      db = await open();
      const stored = await new Promise((resolve, reject) => {
        const req = db.transaction('records').objectStore('records').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return {
        holes: [
          !(1 in stored[1].credentials),
          !(1 in stored[2].genesis.actors),
          !(1 in stored[3].genesis.wraps),
        ],
        accepted: stored.map((v) => {
          try {
            Parsers.parsePromotion(v);
            return true;
          } catch {
            return false;
          }
        }),
      };
    }, input);
    assert.deepEqual(result.holes, [true, true, true]);
    assert.deepEqual(result.accepted, [true, false, false, false, false, false, false, false]);
    report('native-data-shapes', result);
  },
);
