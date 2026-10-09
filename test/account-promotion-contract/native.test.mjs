import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { native, prepare, args } from '../account-promotion/fixtures.mjs';
import { bundle } from './runtime.mjs';
import { fixture, stages } from './oracle.mjs';
const script = await bundle(),
  sourceControl = await bundle('source');
function report(name, value) {
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(value, null, 2) + '\n',
    );
  }
}
async function setup(t, name) {
  const f = await native(t),
    item = await f.ready(name);
  await prepare(f.page, item);
  await f.page.evaluate(script);
  await f.page.evaluate(async (item) => {
    window.d2item = item;
    window.d2saved = (await PromotionContract.rows()).find(
      (r) => r.key[0] === item.slotId && r.key[1] === 'application-upgrade',
    );
  }, args(item));
  return f;
}
const restore = (page) => page.evaluate(() => PromotionContract.put(d2saved.key, d2saved.value));
const read = (page) =>
  page.evaluate(() =>
    PromotionContract.withPromotionSlot(d2item.slotId, d2item.code, (task) =>
      PromotionContract.readPromotion(task, d2item.slotId, d2item.code),
    ).then((s) => ({ v: s.marker.v, stage: s.marker.stage, id: s.marker.id })),
  );
async function install(page, change) {
  await restore(page);
  return page.evaluate(
    (change) =>
      PromotionContract.withPromotionSlot(d2item.slotId, d2item.code, async (task) => {
        const s = await PromotionContract.readPromotion(task, d2item.slotId, d2item.code);
        await PromotionContract.withPromotionRoot(
          task,
          s.claim,
          s.record,
          d2item.code,
          async (root, subtle) => {
            const r = structuredClone(s.marker);
            if (change.v) {
              r.v = change.v;
              r.stage = change.stage;
              if (change.stage === 'reserved') r.credentials = null;
              if (change.v >= 2) r.genesis = change.fixture.genesis;
              if (change.v >= 3) {
                r.admission = change.fixture.admission;
                if (change.stage === 'admission-requested')
                  r.admission.offer = r.admission.completion = r.admission.receipt = null;
                if (change.stage === 'admission-offered') r.admission.receipt = null;
              }
              if (change.v >= 4) r.handoff = change.fixture.handoff;
            }
            if (change.field) {
              if (change.field === 'credentialIds') {
                r.credentialIds[0] = s.record.credentials[0].id;
                r.credentials[0].id = r.credentialIds[0];
              } else {
                const p = change.field.split('.');
                let parent = r;
                for (const k of p.slice(0, -1)) parent = parent[k];
                const k = p.at(-1),
                  old = parent[k];
                parent[k] =
                  typeof old === 'number' ? old + 1 : (old[0] === 'a' ? 'b' : 'a') + old.slice(1);
              }
            }
            if (change.field === 'source.principalId')
              r.account.draft.principalId = r.source.principalId;
            if (change.field === 'source.workspaceId')
              r.account.draft.workspaceId = r.source.workspaceId;
            // Exercise the old no-op substitution edge deterministically before signing.
            if (change.omit?.[0] === 'pending')
              r.account.confirmation.receiptId = 'a' + r.account.confirmation.receiptId.slice(1);
            const signed = await PromotionContract.signPromotion(root, r, subtle);
            if (change.omit) {
              const a = JSON.parse(
                new TextDecoder().decode(PromotionContract.promotionPayload(signed)),
              );
              const p = change.omit;
              if (p[0] === 'pending') {
                const pending = JSON.parse(a[7]);
                delete pending.confirmation.receiptId;
                a[7] = JSON.stringify(pending);
              } else {
                let parent = a;
                for (const k of p.slice(0, -1)) parent = parent[k];
                if (Array.isArray(parent)) parent.splice(p.at(-1), 1);
                else delete parent[p.at(-1)];
              }
              signed.mac = new Uint8Array(
                await subtle.sign(
                  'HMAC',
                  await PromotionContract.macKey(root, r, subtle),
                  new TextEncoder().encode(JSON.stringify(a)),
                ),
              );
              // Change the omitted value after signing: the native control must accept a real substitution.
              const target =
                  p[0] === 'pending'
                    ? signed.account.confirmation
                    : p.length === 1
                      ? signed
                      : signed.handoff.destination.account,
                field = p[0] === 'pending' ? 'receiptId' : p.length === 1 ? 'id' : 'promotionId',
                original = target[field];
              target[field] = (original[0] === 'a' ? 'b' : 'a') + original.slice(1);
              if (target[field] === original) throw Error('Omitted binding must actually change');
            }
            await PromotionContract.put(d2saved.key, signed);
          },
        );
      }),
    change,
  );
}
test(
  'native reader authenticates every stage version against real Local custody; all tampered IDs refuse',
  { timeout: 60000 },
  async (t) => {
    const f = await setup(t, 'd2-all-versions'),
      results = [];
    for (const [v, stage] of stages) {
      await install(f.page, { v, stage, fixture: fixture() });
      assert.equal((await read(f.page)).stage, stage);
      await f.page.evaluate(async () => {
        const r = (await PromotionContract.rows()).find(
          (r) => r.key[0] === d2item.slotId && r.key[1] === 'application-upgrade',
        );
        r.value.id = 'ff'.repeat(16);
        await PromotionContract.put(r.key, r.value);
      });
      await assert.rejects(read(f.page), /Promotion authentication failed/);
      results.push({ v, stage, correctMac: 'read', changedId: 'authentication refusal' });
    }
    await restore(f.page);
    report('native-versions', results);
  },
);
test(
  'correct MACs do not replace source, budget and credential collision checks; actual guard removal rescues each lie',
  { timeout: 60000 },
  async (t) => {
    const f = await setup(t, 'd2-semantic'),
      results = [];
    for (const field of [
      'source.slotId',
      'source.principalId',
      'source.workspaceId',
      'source.storeId',
      'source.rootId',
      'source.genesisIntentId',
      'claimMac',
      'custodyMac',
      'sealReserved',
      'credentialIds',
    ]) {
      await f.page.evaluate(script);
      await install(f.page, { field });
      await assert.rejects(read(f.page), /Promotion source or budget changed/);
      await f.page.evaluate(sourceControl);
      assert.equal((await read(f.page)).stage, 'prepared');
      results.push({
        field,
        baseline: 'authentic source mismatch refused',
        control: 'accepted after source guard omission',
      });
    }
    await f.page.evaluate(script);
    await restore(f.page);
    report('native-source-controls', results);
  },
);
test(
  'native verifier message omissions rescue forged carrier bindings while WebCrypto verification still runs',
  { timeout: 60000 },
  async (t) => {
    const f = await setup(t, 'd2-message-omissions'),
      results = [];
    for (const c of [
      { v: 1, stage: 'prepared', omit: [3] },
      { v: 3, stage: 'admission-requested', omit: ['pending'] },
      { v: 9, stage: 'account-receiving', omit: [16, 'destination', 'account', 'promotionId'] },
    ]) {
      await install(f.page, { ...c, fixture: fixture() });
      await assert.rejects(read(f.page), /Promotion authentication failed/);
      await f.page.evaluate((p) => {
        window.d2verify = crypto.subtle.verify.bind(crypto.subtle);
        window.d2omissions = 0;
        crypto.subtle.verify = async function (alg, key, sig, data) {
          const text = new TextDecoder().decode(data);
          if (alg === 'HMAC' && text.startsWith('["done/local-promotion/v1"')) {
            const a = JSON.parse(text);
            if (p[0] === 'pending') {
              const pending = JSON.parse(a[7]);
              delete pending.confirmation.receiptId;
              a[7] = JSON.stringify(pending);
            } else {
              let parent = a;
              for (const k of p.slice(0, -1)) parent = parent[k];
              if (Array.isArray(parent)) parent.splice(p.at(-1), 1);
              else delete parent[p.at(-1)];
            }
            window.d2omissions++;
            return d2verify(alg, key, sig, new TextEncoder().encode(JSON.stringify(a)));
          }
          return d2verify(alg, key, sig, data);
        };
      }, c.omit);
      try {
        assert.equal((await read(f.page)).stage, c.stage);
        assert.ok(await f.page.evaluate(() => d2omissions > 0));
      } finally {
        await f.page.evaluate(() => {
          crypto.subtle.verify = d2verify;
        });
      }
      results.push({ ...c, baseline: 'refused', control: 'native HMAC accepted omitted encoding' });
    }
    await restore(f.page);
    report('native-message-controls', results);
  },
);
