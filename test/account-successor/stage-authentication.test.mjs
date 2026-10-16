import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nativeOwner,
  selected,
  syncing,
  settled,
  online,
  adopt,
  close,
  cold,
  inventory,
} from './owner-fixtures.mjs';

for (const mutation of [6, 7, 8, 'remove'])
  test(
    `unsigned successor ${mutation === 'remove' ? 'field removal' : 'stage ' + mutation} refuses cold authenticated reopening without writes`,
    { timeout: 60000 },
    async (t) => {
      const f = await nativeOwner(t),
        item = await selected(f, 'successor-stage-' + mutation);
      await syncing(f.page, item);
      await settled(f.page);
      await online(f.page, false);
      await adopt(f.page, await f.successor(item));
      await close(f.page);
      // Storage-attacker mutation: keep the original MAC and every sealed key byte.
      await f.page.evaluate(
        async ({ slot, mutation }) => {
          const db = await new Promise((yes, no) => {
            const r = indexedDB.open('done.custody');
            r.onsuccess = () => yes(r.result);
            r.onerror = () => no(r.error);
          });
          try {
            await new Promise((yes, no) => {
              const tx = db.transaction('entries', 'readwrite'),
                store = tx.objectStore('entries');
              const key = [slot, 'application-upgrade'],
                r = store.get(key);
              r.onsuccess = () => {
                const value = r.result;
                if (!value?.successor || value.v !== 9) {
                  tx.abort();
                  return;
                }
                if (mutation === 'remove') delete value.successor;
                else {
                  value.v = mutation;
                  value.stage = {
                    6: 'account-capturing',
                    7: 'account-spooling',
                    8: 'account-delivering',
                  }[mutation];
                }
                store.put(value, key);
              };
              tx.oncomplete = () => yes();
              tx.onabort = () => no(tx.error ?? Error('Missing mutation target'));
            });
          } finally {
            db.close();
          }
        },
        { slot: item.slotId, mutation },
      );
      await cold(f);
      await online(f.page, false);
      const before = await inventory(f.page);
      await assert.rejects(syncing(f.page, item), /Promotion authentication failed/);
      assert.equal(
        await inventory(f.page),
        before,
        'authentication refusal must preserve all stored carriers',
      );
    },
  );
