import { build } from 'vite';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  native as base,
  selected as baseSelected,
  args,
  waitHit,
} from '../account-decisions/fixtures.mjs';
export * from '../account-decisions/fixtures.mjs';
export async function deliveryBundle(control) {
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: control
      ? [
          {
            name: 'delivery-control',
            enforce: 'pre',
            transform(code, id) {
              if (control === 'old-reader' && id.endsWith('/src/crdt/promotionRecord.ts'))
                return execFileSync('git', ['show', '81a4655:src/crdt/promotionRecord.ts'], {
                  encoding: 'utf8',
                  timeout: 5000,
                  maxBuffer: 2 * 1024 * 1024,
                });
              if (control === 'no-witness' && id.endsWith('/src/crdt/spoolRecord.ts')) {
                const p =
                  /(export async function verifySpoolWitness\([\s\S]*?\): Promise<void> \{)/g;
                if ([...code.matchAll(p)].length !== 1) throw Error('Missing witness control');
                return code.replace(p, '$1 return;');
              }
              if (control === 'early-return' && id.endsWith('/src/crdt/accountDelivery.ts')) {
                const p =
                  /await persist\(task, owner, route, \{ type: 'submission', position, wire \}\);/g;
                if ([...code.matchAll(p)].length !== 1) throw Error('Missing early return control');
                return code.replace(
                  p,
                  "return {kind:'ready' as const,position,bytes:wire.slice()};",
                );
              }
              if (control === 'no-authority' && id.endsWith('/src/crdt/accountSpool.ts')) {
                const p = /const assertCurrent = async \(task: SessionTask\) => \{[\s\S]*?\n  \};/g;
                if ([...code.matchAll(p)].length !== 1) throw Error('Missing authority control');
                return code.replace(p, 'const assertCurrent = async (_task: SessionTask) => {};');
              }
              if (control === 'leaf-only' && id.endsWith('/src/crdt/deliveryRecord.ts')) {
                for (const anchor of [
                  'if (n <= s.acceptedThrough ||',
                  'if (position <= s.acceptedThrough) s.conflict = true;',
                ])
                  if (code.split(anchor).length !== 2) throw Error('Missing prefix control');
                return code
                  .replace('if (n <= s.acceptedThrough ||', 'if (false ||')
                  .replace(
                    'if (position <= s.acceptedThrough) s.conflict = true;',
                    'void position;',
                  );
              }
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-delivery/browser.ts'),
        name: 'Harness',
        formats: ['iife'],
      },
    },
  });
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
const script = await deliveryBundle();
export async function configure(page) {
  await page.evaluate(() => {
    window.openEditor = async (item) => {
      window.opened = await Harness.openOwnedAccountDeliveryWorkspace(optionsFor(item));
      window.editor = opened.workspace;
      window.surface = editor.text({ kind: 'master' });
      return editor.read();
    };
  });
}
export async function native(t) {
  const f = await base(t),
    setup = f.setup;
  f.setup = async (page) => {
    await setup(page);
    await page.evaluate(script);
    await configure(page);
  };
  await f.setup(f.page);
  return f;
}
export async function selected(f, id) {
  const item = await baseSelected(f, id);
  await f.page.evaluate(async (item) => {
    const s = await Harness.openOwnedAccountSpoolWorkspace(optionsFor(item));
    await s.workspace.close();
  }, args(item));
  return item;
}
export const deliveryStatus = (page) => page.evaluate(() => opened.deliveryStatus());
export const submission = (page, position = 1) =>
  page.evaluate(async (position) => {
    const r = await opened.prepareSubmission(position);
    return r.kind === 'ready' ? { ...r, bytes: [...r.bytes] } : r;
  }, position);
export const pending = (page) =>
  page.evaluate(async () =>
    (await opened.pendingSubmissions()).map((e) => ({ position: e.position, bytes: [...e.bytes] })),
  );
export const record = (page, position, bytes) =>
  page.evaluate(({ position, bytes }) => opened.recordResponse(position, new Uint8Array(bytes)), {
    position,
    bytes: [...bytes],
  });
export async function deliveryBoundary(page, type, side) {
  await page.evaluate(
    ({ type, side }) => {
      const encrypt = crypto.subtle.encrypt.bind(crypto.subtle),
        targets = new Set(),
        marked = new WeakSet();
      crypto.subtle.encrypt = async function (alg, key, bytes) {
        let v;
        try {
          v = JSON.parse(new TextDecoder().decode(bytes));
        } catch {}
        if (v?.[0] === 'done/account-delivery/v1' && v[9] === type)
          targets.add([...alg.iv].join(','));
        return encrypt(alg, key, bytes);
      };
      const add = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (value, ...args) {
        const r = add.call(this, value, ...args);
        if (value?.nonce && targets.has([...value.nonce].join(','))) {
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
          d.set.call(this, function (e) {
            if (marked.has(this) && side === 'after') {
              window.hit = true;
              window.release = () => fn.call(this, e);
            } else fn.call(this, e);
          });
        },
      });
    },
    { type, side },
  );
}
export async function pauseSigning(page) {
  await page.evaluate(() => {
    const sign = crypto.subtle.sign.bind(crypto.subtle);
    crypto.subtle.sign = async function (alg, key, message) {
      if (new TextDecoder().decode(message).includes('done/envelope-submission/v1')) {
        window.hit = true;
        await new Promise((r) => (window.release = r));
      }
      return sign(alg, key, message);
    };
    window.work = opened.prepareSubmission(1).then(
      () => 'ready',
      (e) => String(e),
    );
  });
  await waitHit(page);
}
