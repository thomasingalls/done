import { execFileSync } from 'node:child_process';
import { build } from 'vite';
import { resolve } from 'node:path';
import { native as base, args } from '../account-admission/fixtures.mjs';
export * from '../account-admission/fixtures.mjs';
export async function handoffBundle(control) {
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: control
      ? [
          {
            name: 'handoff-control',
            enforce: 'pre',
            transform(code, id) {
              if (control === 'old-slot-verifier' && id.endsWith('/src/account/slotUnlock.ts'))
                return execFileSync('git', ['show', 'beed8cf:src/account/slotUnlock.ts'], {
                  encoding: 'utf8',
                });
              if (control === 'old-reader' && id.endsWith('/src/crdt/promotionRecord.ts'))
                return execFileSync('git', ['show', 'beed8cf:src/crdt/promotionRecord.ts'], {
                  encoding: 'utf8',
                  timeout: 5000,
                  maxBuffer: 2 * 1024 * 1024,
                });
              if (control === 'passkey' && id.endsWith('/src/crdt/accountAccess.ts')) {
                const needle = "throw Error('Account passkey refused: ' + result.refusal);";
                if (!code.includes(needle)) throw Error('Missing control anchor');
                return code.replace(needle, 'void 0;');
              }
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-handoff/browser.ts'),
        name: 'Harness',
        formats: ['iife'],
      },
    },
  });
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
const script = await handoffBundle(
  process.env.HANDOFF_SLOT_BASELINE === '1' ? 'old-slot-verifier' : undefined,
);
export async function native(t, harness) {
  const f = await base(t, harness),
    setup = f.setup;
  const keys = new Map();
  await f.context.exposeBinding('testAssertion', async (_source, request) => {
    const key = keys.get(request.credentialId);
    if (!key) throw Error('Unknown fixture credential');
    const value = key.assert(
      { options: { challenge: Buffer.from(request.challenge).toString('base64url') } },
      { client: { origin: f.server.origin } },
    );
    return {
      credentialId: value.id,
      ...Object.fromEntries(
        ['authenticatorData', 'clientDataJSON', 'signature'].map((k) => [
          k,
          [...Buffer.from(value.response[k], 'base64url')],
        ]),
      ),
    };
  });
  const ready = f.ready;
  f.ready = async (id, alg) => {
    const item = await ready(id, alg);
    keys.set(item.key.id, item.key);
    return item;
  };
  f.setup = async (page) => {
    await setup(page);
    if (!harness) await page.evaluate(script);
    await page.evaluate(() => {
      window.bindingTransport = (input) => request('/account/promotion/binding', input);
      window.assertPasskey = async (req) => {
        const result = await testAssertion({ ...req, challenge: [...req.challenge] });
        return {
          ...result,
          ...Object.fromEntries(
            ['authenticatorData', 'clientDataJSON', 'signature'].map((k) => [
              k,
              new Uint8Array(result[k]),
            ]),
          ),
        };
      };
    });
  };
  await f.setup(f.page);
  return f;
}
export const handoff = (page, item) =>
  page.evaluate(
    (item) =>
      Harness.finishPromotionHandoff({
        ...item,
        pin,
        proveAuthority: prove,
        transport,
        bindingTransport,
        assertPasskey,
      }),
    args(item),
  );
export const classify = (page, item) =>
  page.evaluate(
    (item) =>
      Harness.classifyAccountStartup({ slotId: item.slotId, code: item.code, pin, assertPasskey }),
    args(item),
  );
export async function indexBoundary(page, side) {
  await page.evaluate((side) => {
    const put = IDBObjectStore.prototype.put,
      marked = new WeakSet();
    IDBObjectStore.prototype.put = function (value, ...args) {
      const r = put.call(this, value, ...args);
      if (this.name === 'slots' && value.account) {
        marked.add(this.transaction);
        if (side === 'before')
          r.addEventListener('success', () => {
            window.hit = true;
            this.transaction.abort();
          });
      }
      return r;
    };
    const d = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
    Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
      ...d,
      set(fn) {
        d.set.call(this, function (event) {
          if (side === 'after' && marked.has(this)) {
            window.hit = true;
            window.release = () => fn.call(this, event);
          } else fn.call(this, event);
        });
      },
    });
  }, side);
}
export const stable = (raw, slotId) => {
  const rows = JSON.parse(raw);
  for (const row of rows[0]) {
    const keep = row[2]
      .map((key, i) => [key, row[3][i]])
      .filter(
        ([key]) =>
          !(
            row[0] === 'done.custody' &&
            Array.isArray(key) &&
            key[0] === slotId &&
            key[1] === 'application-upgrade'
          ) && !(row[0] === 'done.slots' && key === slotId),
      );
    row[2] = keep.map((x) => x[0]);
    row[3] = keep.map((x) => x[1]);
  }
  return JSON.stringify(rows);
};
export async function waitHit(page) {
  await page.evaluate(() => {
    work.then(
      (v) => {
        window.early = String(v);
      },
      (e) => {
        window.early = String(e);
      },
    );
  });
  await page.waitForFunction(() => window.hit || window.early !== undefined);
  if (!(await page.evaluate(() => window.hit)))
    throw Error(await page.evaluate(() => window.early));
}
