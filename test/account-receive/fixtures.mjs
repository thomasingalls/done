import { build } from 'vite';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { native as base, selected as baseSelected, args } from '../account-delivery/fixtures.mjs';
import {
  fixtureAcceptance,
  hash,
  signBytes,
  head,
  response,
  link,
} from '../account-decisions/oracle.mjs';
export * from '../account-delivery/fixtures.mjs';
export { inventory, snapshot, boundary } from '../account-capture/fixtures.mjs';
export async function receiveBundle(control) {
  let hits = 0;
  const targets = {
    'stored-page': [
      '/src/crdt/accountInbound.ts',
      "if (!pageVerified) fail('unverified');",
      'void pageVerified;',
    ],
    coverage: [
      '/src/crdt/inboundLedger.ts',
      'if (reuse) reuse.coverage.check(records, result.updates);\n          else localCoverage!.check(result.updates);',
      'void records;',
    ],
    'coverage-without-reuse': [
      '/src/crdt/inboundLedger.ts',
      'reuse.coverage.check(records, result.updates);',
      'void records;',
    ],
    'coverage-without-fallback': [
      '/src/crdt/inboundLedger.ts',
      'localCoverage!.check(result.updates);',
      'void records;',
    ],
    split: [
      '/src/crdt/accountReceive.ts',
      "...updates.map((bytes) => ({ kind: 'update' as const, bytes }))",
      '...[]',
    ],
  };
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: control
      ? [
          {
            name: 'receive-control',
            enforce: 'pre',
            transform(code, id) {
              if (control === 'old-reader' && id.endsWith('/src/crdt/promotionRecord.ts')) {
                hits++;
                return execFileSync('git', ['show', '8378596:src/crdt/promotionRecord.ts'], {
                  encoding: 'utf8',
                  timeout: 5000,
                  maxBuffer: 2 * 1024 * 1024,
                });
              }
              if (control === 'witness' && id.endsWith('/src/crdt/spoolRecord.ts')) {
                const re =
                  /(export async function verifySpoolWitness\([\s\S]*?\): Promise<void> \{)/g;
                if ([...code.matchAll(re)].length !== 1) throw Error('Missing witness control');
                hits++;
                return code.replace(re, '$1 return;');
              }
              const t = targets[control];
              if (t && id.endsWith(t[0])) {
                const matches = code.split(t[1]).length - 1;
                if (matches !== 1)
                  throw Error(
                    `Control ${control}: expected one anchor in ${t[0]}, found ${matches}: ${JSON.stringify(t[1])}`,
                  );
                hits++;
                return code.replace(t[1], t[2]);
              }
            },
          },
        ]
      : [],
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
  if (control && hits !== 1) throw Error('Control did not apply');
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
const script = await receiveBundle();
export async function native(t) {
  // This bundle re-exports every inherited browser harness. Load it once per setup while
  // retaining all ancestor bindings/configuration, the genesis page and cold-page replacement.
  return base(t, script);
}
export async function selected(f, id) {
  const item = await baseSelected(f, id);
  await f.page.evaluate(async (item) => {
    const o = await Harness.openOwnedAccountDeliveryWorkspace(optionsFor(item));
    await o.workspace.whenDurable();
    await o.workspace.close();
  }, args(item));
  return item;
}
export const openReceive = (page, item) =>
  page.evaluate(async (item) => {
    window.receiver = await Harness.openOwnedAccountReceiveStore(optionsFor(item));
    return receiver.status();
  }, args(item));
export const closeReceive = (page) => page.evaluate(() => receiver.close());
export const request = (page, after) =>
  page.evaluate(async (after) => [...(await receiver.prepareRead(after))], after);
export const receive = (page, bytes) =>
  page.evaluate((b) => receiver.receivePage(new Uint8Array(b)), [...bytes]);
export const status = (page) => page.evaluate(() => receiver.status());
export const census = (page, item, fault) =>
  page.evaluate(({ item, fault }) => Harness.inboundCensus(item.slotId, item.code, fault), {
    item: args(item),
    fault,
  });
export const envelope = (page, item, position, updates) =>
  page.evaluate(
    ({ item, position, updates }) =>
      Harness.fixtureInboundEnvelope(item.slotId, item.code, position, updates),
    { item: args(item), position, updates },
  );
// Page and acceptance framing is independent Node/OpenSSL; original request comes from the owned signer.
export function answer(f, item, query, wire, previous = '00'.repeat(32), through) {
  const r = JSON.parse(Buffer.from(query).toString()),
    signer = fixtureAcceptance(f, item.scope.workspaceId);
  const position = r[10] + 1;
  let entries = [],
    next = r[10],
    resulting = previous;
  if (wire) {
    const b = Buffer.from(wire);
    let at = 0;
    for (let i = 0; i < 7; i++) {
      const n = b.readUInt16BE(at);
      at += 2 + n;
    }
    at += 12;
    const digest = b.subarray(at, at + 32).toString('hex');
    at += 32;
    const n = b.readUInt32BE(at);
    at += 4;
    if (hash(b.subarray(at, at + n)) !== digest || at + n + 64 !== b.length)
      throw Error('Independent ciphertext digest differs');
    const subject = { workspace: r[4], credential: r[6], position, epoch: 1, digest };
    const proof = response({
      kind: 'accepted',
      head: head(subject, previous, 1, signer),
      leaf: subject,
    });
    entries = [[b.toString('hex'), Buffer.from(proof).toString('hex')]];
    next = position;
    resulting = link(subject, previous);
  }
  const unsigned = [
    'done/private-read-page/v2',
    2,
    hash(Buffer.from(query)),
    through ?? next,
    next,
    entries,
  ];
  return {
    bytes: Buffer.from(
      JSON.stringify([...unsigned, signBytes(Buffer.from(JSON.stringify(unsigned)), signer)]),
    ),
    link: resulting,
  };
}
export async function waitPredicate(page, fn, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await page.evaluate(fn)) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error('Receive predicate timed out');
}
export async function receiveBoundary(page, side) {
  await page.evaluate((side) => {
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle),
      targets = new Set(),
      marked = new WeakSet();
    crypto.subtle.encrypt = async (alg, key, bytes) => {
      if (new TextDecoder().decode(bytes).startsWith('["done/account-inbound/v1"'))
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
  }, side);
}
