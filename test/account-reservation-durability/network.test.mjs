import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  native,
  selected,
  open,
  edit,
  prepare,
  status,
  close,
} from '../account-spool/fixtures.mjs';
const report = (n, v) => {
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, n + '.json'),
      JSON.stringify(v, null, 2) + '\n',
    );
  }
};
for (const fault of ['abandon-encryption', 'downgrade-grant'])
  test(
    `network attempt requires strict event retention: ${fault}`,
    { timeout: 40000 },
    async (t) => {
      const f = await native(t),
        item = await selected(f, 'f15-' + fault);
      await open(f.page, item);
      await edit(f.page, 0, 0, 'durability ');
      await f.page.evaluate((fault) => {
        window.grantTrace = [];
        window.fault = fault;
        window.attemptReady = false;
        const transaction = IDBDatabase.prototype.transaction,
          add = IDBObjectStore.prototype.add;
        const grants = new Map(),
          pending = new WeakMap();
        IDBDatabase.prototype.transaction = function (stores, mode, options) {
          let downgrade = false;
          if (mode === 'readwrite' && attemptReady && window.fault === 'downgrade-grant') {
            downgrade = true;
            attemptReady = false;
            window.fault = null;
          }
          const tx = transaction.call(
            this,
            stores,
            mode,
            downgrade ? { durability: 'default' } : options,
          );
          if (downgrade)
            grantTrace.push({
              kind: 'downgrade',
              requested: options?.durability,
              reported: tx.durability,
            });
          tx.addEventListener('complete', () => {
            if (pending.has(tx))
              grantTrace.push({
                kind: 'grant',
                attempt: pending.get(tx),
                requested: options?.durability,
                reported: tx.durability,
              });
          });
          return tx;
        };
        IDBObjectStore.prototype.add = function (value, ...args) {
          if (value?.nonce && grants.has([...value.nonce].join(',')))
            pending.set(this.transaction, grants.get([...value.nonce].join(',')));
          return add.call(this, value, ...args);
        };
        const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
        crypto.subtle.encrypt = async function (alg, key, bytes) {
          let entry;
          try {
            entry = JSON.parse(new TextDecoder().decode(bytes));
          } catch {}
          if (entry?.[0] === 'done/account-spool/v1' && entry[7] === 'attempt') {
            grants.set([...alg.iv].join(','), entry[9]);
            attemptReady = true;
          }
          const isNet = new TextDecoder()
            .decode(alg.additionalData ?? new Uint8Array())
            .includes('done/env/v2');
          if (isNet) grantTrace.push({ kind: 'invoke' });
          const result = await encrypt(alg, key, bytes);
          if (isNet && window.fault === 'abandon-encryption') {
            window.fault = null;
            throw Error('Injected abandoned network AES');
          }
          return result;
        };
      }, fault);
      await assert.rejects(
        prepare(f.page),
        fault === 'abandon-encryption'
          ? /Injected abandoned network AES/
          : /Strict transaction durability is required/,
      );
      const afterFault = await status(f.page);
      assert.equal(f.invocations.length, fault === 'abandon-encryption' ? 1 : 0);
      assert.equal(afterFault.attempts, fault === 'abandon-encryption' ? 1 : 0);
      assert.equal(afterFault.positions.filter((p) => p.persisted).length, 0);
      const saved = await prepare(f.page);
      assert.equal(saved.position, 1);
      const final = await status(f.page),
        trace = await f.page.evaluate(() => grantTrace);
      let grants = 0,
        invocations = 0;
      for (const e of trace) {
        if (e.kind === 'grant') {
          assert.equal(e.requested, 'strict');
          assert.equal(e.reported, 'strict');
          grants++;
        }
        if (e.kind === 'invoke') {
          invocations++;
          assert(grants >= invocations);
        }
      }
      assert.equal(grants, f.invocations.length);
      assert.equal(final.attempts, f.invocations.length);
      report(fault, { trace, afterFault, final, invocations: f.invocations.length });
      await close(f.page);
    },
  );
