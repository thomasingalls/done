import assert from 'node:assert/strict';
import { checkpoint, factor, marker, args } from './fixtures.mjs';
export const read = (f) => f.page.evaluate(() => editor.read());
export async function createLocal(f, slotId = 'residue-local') {
  return f.page.evaluate(async (slotId) => {
    const ceremony = Product.beginLocalGenesis(slotId),
      code = ceremony.displayCode,
      receipt = await ceremony.confirm(code);
    return { slotId, code, scope: receipt.scope };
  }, slotId);
}
export async function openLocal(f, item, hold = true) {
  const kind = await f.page.evaluate(
    async (item) => {
      globalThis.trialHoldFlush = item.hold;
      const result = await Product.openLocalWorkspace(item.slotId, item.code, {
        ...ownerOptions(item),
        validateReceive: () => {
          throw Error('No Local network input');
        },
      });
      if (result.kind === 'ready') globalThis.editor = result.workspace;
      return result.kind;
    },
    { ...args(item), hold },
  );
  assert.equal(kind, 'ready');
}
export const insert = async (f, text) =>
  f.page.evaluate(async (text) => {
    const before = editor.read().master.length;
    await editor
      .text({ kind: 'master' })
      .input({ name: 'insert', text }, { ranges: [{ anchor: before, head: before }], main: 0 })
      .accepted;
    return editor.read().master;
  }, text);
export const close = (f) => f.page.evaluate(() => editor.close());
export const flush = (f) =>
  f.page.evaluate(async () => {
    globalThis.trialHoldFlush = false;
    await editor.whenDurable();
  });
export const contentCount = (f) =>
  f.page.evaluate(async () => {
    let count = 0;
    for (const { name } of await indexedDB.databases()) {
      const db = await new Promise((resolve) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => resolve(r.result);
      });
      try {
        if (db.objectStoreNames.contains('content'))
          count += await new Promise((resolve, reject) => {
            const tx = db.transaction('content'),
              r = tx.objectStore('content').count();
            tx.oncomplete = () => resolve(r.result);
            tx.onabort = () => reject(tx.error);
          });
      } finally {
        db.close();
      }
    }
    return count;
  });
export const journalCount = (f) =>
  f.page.evaluate(
    () => Object.keys(localStorage).filter((k) => k.startsWith('done.pending-update.')).length,
  );
export const projection = (v) => ({
  master: v.master,
  cards: v.cards,
  actors: v.actors,
  settings: v.settings,
  deviceName: v.deviceName,
  days: v.days,
});
export async function compactLocal(f, item) {
  await f.page.evaluate(async (item) => {
    const s = await Product.openJournalSession(
      { ...item.scope, resolvePrincipal: () => item.scope.principalId },
      item.code,
    );
    try {
      await s.compactContent();
    } finally {
      await s.close();
    }
  }, args(item));
}
export async function prepareRecovery(f, item, observe = async () => {}) {
  Object.assign(item, await f.register());
  const result = await f.page.evaluate(
    (item) => Product.inspectLocalPromotion({ ...item, pin, proveAuthority: prove }),
    args(item),
  );
  item.context = result.context;
  const generated = await f.page.evaluate(
    (item) =>
      Product.withRecoveryOwner(
        {
          ...item,
          pin,
          local: { slotId: item.slotId, code: item.code },
          transport: {
            begin: (input) => request('/account/recovery/begin', input),
            finish: (input) => request('/account/recovery/finish', input),
          },
        },
        async (owner) => ({ ...(await owner.generate()), draft: await owner.draft() }),
      ),
    args(item),
  );
  item.recoveryCode = generated.code;
  item.draft = generated.draft;
  await observe('generated');
  // The owner has committed the exact finalization row before it calls this held transport.
  await f.page.evaluate((item) => {
    globalThis.recoveryHit = false;
    globalThis.recoveryWork = Product.withRecoveryOwner(
      {
        ...item,
        pin,
        local: { slotId: item.slotId, code: item.code },
        transport: {
          begin: (input) => request('/account/recovery/begin', input),
          finish: async (input) => {
            globalThis.recoveryHit = true;
            await new Promise((resolve) => (globalThis.releaseRecovery = resolve));
            return request('/account/recovery/finish', input);
          },
        },
      },
      (owner) => owner.confirm(item.recoveryCode, assertActivation),
    );
    recoveryWork.catch((e) => {
      globalThis.recoveryFailure = e.message;
    });
  }, args(item));
  await f.page.waitForFunction(
    () => recoveryHit || globalThis.recoveryFailure,
    {},
    { timeout: 15000 },
  );
  assert.equal(await f.page.evaluate(() => globalThis.recoveryFailure ?? null), null);
  await observe('finalization-pending');
  await f.page.evaluate(() => releaseRecovery());
  item.receipt = await f.page.evaluate(() => recoveryWork);
  assert.equal(item.receipt.stage, 'recovery-confirmed');
  await observe('confirmed');
  return item;
}
export const allowRetry = (_item) => (row) =>
  row.needle === 'retry' &&
  row.surface === 'indexedDB' &&
  JSON.stringify(row.location.slice(0, 4)) ===
    JSON.stringify(['done.account-recovery-preparation.v1', 'progress', 'value', 'pending']) &&
  [['retryKey'], ['finalization', 'retryKey']].some(
    (p) => JSON.stringify(row.location.slice(4)) === JSON.stringify(p),
  );
export async function select(f, item, { lostReply = false, observe = async () => {} } = {}) {
  await f.page.evaluate(
    (item) => Product.prepareLocalPromotion({ ...item, pin, proveAuthority: prove, transport }),
    args(item),
  );
  await observe('prepared');
  await f.page.evaluate(
    (item) => Product.preparePromotionGenesis({ ...item, pin, proveAuthority: prove, transport }),
    args(item),
  );
  await observe('genesis');
  const admit = () =>
    f.page.evaluate(
      (item) =>
        Product.admitLocalPromotion({
          ...item,
          pin,
          proveAuthority: prove,
          transport,
          admissionTransport,
          assertActivation,
        }),
      args(item),
    );
  if (lostReply) {
    let hit = false;
    const path = f.origin + '/account/promotion/finish';
    await f.context.route(path, async (route) => {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      hit = true;
      await route.abort();
    });
    try {
      await admit();
    } catch {
      /* lost actual final answer */
    }
    assert(hit, 'Actual final HTTP response must be lost');
    await observe('lost-reply');
    await f.context.unroute(path);
    await f.cold();
  }
  const receipt = await admit();
  assert.equal(receipt.kind, 'promotion-receipt');
  await observe('receipted');
  const handoff = await f.page.evaluate(
    (item) =>
      Product.finishPromotionHandoff({
        ...item,
        pin,
        proveAuthority: prove,
        transport,
        bindingTransport: (input) => request('/account/promotion/binding', input),
        assertPasskey,
      }),
    args(item),
  );
  assert.equal(handoff.kind, 'account-selected');
  await observe('selected');
  for (const factory of [
    'openOwnedCapturedAccountWorkspace',
    'openOwnedAccountSpoolWorkspace',
    'openOwnedAccountDeliveryWorkspace',
  ]) {
    await f.page.evaluate(
      async ({ item, factory }) => {
        const owner = await Product[factory](ownerOptions(item));
        await owner.workspace.whenDurable();
        await owner.workspace.close();
      },
      { item: args(item), factory },
    );
    await observe(factory);
  }
}
export async function sync(f, item) {
  await f.page.evaluate(async (item) => {
    globalThis.trialHoldFlush = false;
    globalThis.opened = await Product.openOwnedSyncingAccountWorkspace(
      ownerOptions(item),
      syncToken,
    );
    globalThis.editor = opened.workspace;
  }, args(item));
}
export async function settled(f, greaterThan = 0) {
  await f.page.waitForFunction(
    (previous) =>
      opened.sync.status.send.phase === 'idle' &&
      opened.sync.status.send.acceptedThrough > previous,
    greaterThan,
    { timeout: 30000 },
  );
  // Explicit user retry wakes the real receiver after publication. This trial does not measure polling cadence.
  const target = await f.page.evaluate(() => {
    const target = opened.sync.status.send.acceptedThrough;
    opened.sync.retry('receive');
    return target;
  });
  await f.page.waitForFunction(
    (target) =>
      opened.sync.status.receive.phase === 'idle' &&
      opened.sync.status.receive.receivedThrough >= target,
    target,
    { timeout: 30000 },
  );
  return target;
}
export function writingNeedles() {
  return ['master', 'card', 'actor', 'device'].map((id) => ({ id, values: [marker(id)] }));
}
export async function writeAll(f, ns) {
  const values = Object.fromEntries(ns.map((n) => [n.id, n.values[0]]));
  await insert(f, values.master);
  await f.page.evaluate(async (v) => {
    const c = await editor.command({
      kind: 'compose',
      to: { date: '2026-09-12', section: 'next' },
      text: 'initial card',
    }).accepted;
    await editor
      .text({ kind: 'card', id: c.value.id })
      .input({ name: 'insert', text: v.card }, { ranges: [{ anchor: 0, head: 0 }], main: 0 })
      .accepted;
    await editor.command({ kind: 'actor', patch: { name: v.actor } }).accepted;
    await editor.command({ kind: 'device-label', name: v.device }).accepted;
  }, values);
  const value = await read(f);
  assert(value.master.includes(values.master));
  assert(value.cards.some((c) => c.text.includes(values.card)));
  assert(value.actors.some((a) => a.name === values.actor));
  assert.equal(value.deviceName, values.device);
  return projection(value);
}
export function recordNeedles(item, ns) {
  return [
    ...ns,
    factor('deviceFactor', item.code),
    ...(item.recoveryCode
      ? [
          factor('recoveryFactor', item.recoveryCode),
          {
            id: 'retry',
            values: [item.retryKey],
            raw: [Buffer.from(item.retryKey, 'base64url').toString('base64')],
          },
        ]
      : []),
  ];
}
export const scan = (f, item, ns, id, options = {}) =>
  checkpoint(f, recordNeedles(item, ns), id, { allow: allowRetry(item), ...options });
