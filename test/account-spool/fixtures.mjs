import { build } from 'vite';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { native as base, selected as baseSelected, args } from '../account-capture/fixtures.mjs';
export * from '../account-capture/fixtures.mjs';
export async function spoolBundle(control) {
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: control
      ? [
          {
            name: 'spool-control',
            enforce: 'pre',
            transform(code, id) {
              if (control === 'old-reader' && id.endsWith('/src/crdt/promotionRecord.ts'))
                return execFileSync('git', ['show', '7210b7d:src/crdt/promotionRecord.ts'], {
                  encoding: 'utf8',
                  timeout: 5000,
                  maxBuffer: 2 * 1024 * 1024,
                });
              if (control === 'no-witness' && id.endsWith('/src/crdt/spoolRecord.ts')) {
                const pattern =
                  /(export async function verifySpoolWitness\([\s\S]*?\): Promise<void> \{)/g;
                if ([...code.matchAll(pattern)].length !== 1)
                  throw Error('Missing witness control');
                return code.replace(pattern, '$1 return;');
              }
              if (control === 'budget' && id.endsWith('/src/crdt/spoolRecord.ts'))
                return code.replace('NET_SEAL_LIMIT = 2 ** 32', 'NET_SEAL_LIMIT = 3');
              if (id.endsWith('/src/crdt/accountEnvelopePreparation.ts')) {
                const replace = (input, pattern, replacement) => {
                  const matches = [...input.matchAll(pattern)];
                  if (matches.length !== 1) throw Error('Missing/ambiguous spool control');
                  return input.replace(pattern, replacement);
                };
                if (control === 'return-before-persist')
                  return replace(
                    code,
                    /await append\(task, owner, route, \{\s+type: 'envelope',[\s\S]*?\n\s*\}\);/g,
                    'return {position:position.position,bytes:wire.slice()};',
                  );
                if (control === 'reuse-attempt') {
                  code = replace(
                    code,
                    /const attempt = state\.attempts \+ 1;/g,
                    'const attempt = position.attempts.at(-1) ?? state.attempts + 1;',
                  );
                  return replace(
                    code,
                    /await append\(task, owner, route, \{\s+type: 'attempt',[\s\S]*?\n\s*\}\);/g,
                    (text) => 'if (!position.attempts.length) ' + text,
                  );
                }
              }
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: { entry: resolve('test/account-spool/browser.ts'), name: 'Harness', formats: ['iife'] },
    },
  });
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
const script = await spoolBundle();
export async function native(t) {
  const f = await base(t),
    setup = f.setup;
  f.invocations = [];
  await f.context.exposeBinding('observeNetInvocation', (_source, value) => {
    f.invocations.push(value);
  });
  f.setup = async (page) => {
    await setup(page);
    await page.evaluate(script);
    await configure(page);
    await instrument(page);
  };
  await f.setup(f.page);
  return f;
}
export async function configure(page) {
  await page.evaluate(() => {
    window.openEditor = async (item) => {
      window.opened = await Harness.openOwnedAccountSpoolWorkspace(optionsFor(item));
      window.editor = opened.workspace;
      window.surface = editor.text({ kind: 'master' });
      return editor.read();
    };
  });
}
export async function selected(f, id) {
  const item = await baseSelected(f, id);
  await f.page.evaluate(async (item) => {
    const c = await Harness.openOwnedCapturedAccountWorkspace(optionsFor(item));
    await c.workspace.close();
  }, args(item));
  return item;
}
export const instrument = (page) =>
  page.evaluate(() => {
    if (window.__spoolInstrumented) return;
    window.__spoolInstrumented = true;
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    crypto.subtle.encrypt = async function (alg, key, data) {
      if (
        alg.additionalData &&
        new TextDecoder().decode(alg.additionalData).includes('done/env/v2')
      ) {
        await observeNetInvocation({ nonce: [...alg.iv] });
        if (window.pauseNet) {
          window.hit = true;
          await new Promise((r) => (window.release = r));
        }
      }
      return encrypt(alg, key, data);
    };
  });
export const prepare = (page) =>
  page.evaluate(async () => {
    const e = await opened.prepareNextEnvelope();
    return e ? { position: e.position, bytes: [...e.bytes] } : null;
  });
export const envelopes = (page) =>
  page.evaluate(async () =>
    (await opened.listEnvelopes()).map((e) => ({ position: e.position, bytes: [...e.bytes] })),
  );
export const status = (page) => page.evaluate(() => opened.spoolStatus());
// Faults at actual outer record commits. Domain plaintext is observed only in this controlled test hook.
export async function spoolBoundary(page, type, side) {
  await page.evaluate(
    ({ type, side }) => {
      const encrypt = crypto.subtle.encrypt.bind(crypto.subtle),
        targets = new Set();
      crypto.subtle.encrypt = async function (alg, key, bytes) {
        let v;
        try {
          v = JSON.parse(new TextDecoder().decode(bytes));
        } catch {}
        if (v?.[0] === 'done/account-spool/v1' && v[7] === type) targets.add([...alg.iv].join(','));
        return encrypt(alg, key, bytes);
      };
      const add = IDBObjectStore.prototype.add,
        marked = new WeakSet();
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
