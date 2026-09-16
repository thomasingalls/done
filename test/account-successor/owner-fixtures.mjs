import { message, hash, lp } from './oracle.mjs';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join, resolve } from 'node:path';
import {
  generateKeyPairSync,
  randomBytes,
  sign,
  createDecipheriv,
  createPrivateKey,
  hkdfSync,
} from 'node:crypto';
import { build } from 'vite';
import { PrivateAuthority } from '../../account-service/authority.ts';
import { native as base, args } from '../account-sync/fixtures.mjs';
import { fresh, nonce, possessionMessage } from '../account-enrollment/fixtures.mjs';
export * from '../account-sync/fixtures.mjs';
export async function ownerBundle(control) {
  let hits = 0;
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: control
      ? [
          {
            name: 'successor-owner-control',
            enforce: 'pre',
            transform(code, id) {
              const targets = {
                prefix: ['/src/crdt/accountSuccessor.ts', 'prefix.finish();', 'void prefix;'],
                cut: [
                  '/src/crdt/accountSuccessor.ts',
                  'if (epoch !== (index < cut.events ? 1 : 2))',
                  'if (false)',
                ],
              };
              const [file, anchor, replacement] = targets[control];
              if (!id.endsWith(file)) return;
              if (code.split(anchor).length !== 2)
                throw Error('Missing successor owner control ' + control);
              hits++;
              return code.replace(anchor, replacement);
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-successor/owner-browser.ts'),
        name: 'Harness',
        formats: ['iife'],
      },
    },
  });
  if (control && hits !== 1) throw Error('Control not applied');
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
const script = await ownerBundle();
export async function nativeOwner(t, control) {
  const f = await base(t),
    setup = f.setup,
    source = control ? await ownerBundle(control) : script;
  f.setup = async (page) => {
    await setup(page);
    await page.evaluate(source);
  };
  await f.setup(f.page);
  const authority = PrivateAuthority.open(
    join(dirname(f.dbPath), 'root.sqlite'),
    f.pin,
    f.testOperatorKey,
  );
  t.after(() => authority.close());
  const admission = (item) => {
    const db = new DatabaseSync(f.dbPath, { readOnly: true });
    try {
      const row = db
        .prepare('SELECT request,result FROM promotions WHERE workspace_id=?')
        .get(item.scope.workspaceId);
      return { request: JSON.parse(row.request), receipt: JSON.parse(row.result) };
    } finally {
      db.close();
    }
  };
  f.successor = async (item) => {
    const { receipt } = admission(item),
      s = generateKeyPairSync('ed25519'),
      w = generateKeyPairSync('x25519');
    const pub = (k) => k.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
    const retryKey = fresh(),
      candidate = {
        v: 1,
        workspaceId: item.scope.workspaceId,
        lineageId: receipt.offer.epoch.lineageId,
        head: receipt.offer.head,
        credentialId: randomBytes(16).toString('hex'),
        sPub: pub(s.publicKey),
        wPub: pub(w.publicKey),
      };
    const challenge = await authority.enrollment(f.server.core, 'begin', { retryKey, candidate });
    assert.equal(challenge.stage, 'challenge', JSON.stringify(challenge));
    const context = challenge.challenge.context;
    const prepared = await authority.enrollment(f.server.core, 'finish', {
      retryKey,
      attemptId: context.attemptId,
      response: item.key.assert(
        { options: { challenge: nonce(context) } },
        { client: { origin: f.server.origin } },
      ),
      possession: sign(null, possessionMessage(context), s.privateKey).toString('hex'),
    });
    assert.equal(prepared.stage, 'prepared', JSON.stringify(prepared));
    const artifact = await authority.admitPrepared(f.server.core, {
      retryKey,
      attemptId: context.attemptId,
      receiptId: prepared.receipt.receiptId,
    });
    assert.equal(artifact.kind, 'device-admission-successor', JSON.stringify(artifact));
    return artifact;
  };
  // Independent adversarial root issuance, using only this disposable fixture's factor.
  // Never export or print the seed, factor or signing key.
  f.resign = (artifact) => {
    const db = new DatabaseSync(join(dirname(f.dbPath), 'root.sqlite'), { readOnly: true });
    let row;
    try {
      row = db.prepare('SELECT * FROM authority').get();
    } finally {
      db.close();
    }
    const pin = f.pin,
      key = Buffer.from(
        hkdfSync(
          'sha256',
          f.testOperatorKey,
          Buffer.from(row.salt, 'hex'),
          lp('done/service-authority-seal/v1', pin.serviceId, pin.origin, pin.rpId, pin.authRoot),
          32,
        ),
      ),
      ct = Buffer.from(row.ct, 'hex'),
      cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(row.nonce, 'hex'));
    cipher.setAAD(
      lp('done/service-authority-pin/v1', '1', pin.serviceId, pin.origin, pin.rpId, pin.authRoot),
    );
    cipher.setAuthTag(ct.subarray(-16));
    const raw = Buffer.concat([cipher.update(ct.subarray(0, -16)), cipher.final()]),
      der = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), raw]);
    try {
      const signing = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }),
        bytes = message('done/admission-successor/v1', artifact.epoch);
      return {
        ...artifact,
        head: hash(bytes),
        signature: sign(null, bytes, signing).toString('hex'),
      };
    } finally {
      key.fill(0);
      raw.fill(0);
      der.fill(0);
    }
  };
  return f;
}
export const adopt = (page, artifact) =>
  page.evaluate((artifact) => opened.adoptSuccessor(artifact), artifact);
export const marker = (page, item) =>
  page.evaluate((item) => Harness.successorMarker(item.slotId, item.code), args(item));
export const installBoundary = (page, side) =>
  page.evaluate((side) => {
    const put = IDBObjectStore.prototype.put,
      marked = new WeakSet();
    IDBObjectStore.prototype.put = function (value, key) {
      const req = put.call(this, value, key);
      if (Array.isArray(key) && key[1] === 'application-upgrade' && value.successor) {
        marked.add(this.transaction);
        if (side === 'before')
          req.addEventListener('success', () => {
            window.installHit = true;
            this.transaction.abort();
          });
      }
      return req;
    };
    const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
    Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
      ...descriptor,
      set(fn) {
        descriptor.set.call(this, function (event) {
          if (marked.has(this) && side === 'after') {
            window.installHit = true;
            window.installRelease = () => fn.call(this, event);
          } else fn.call(this, event);
        });
      },
    });
  }, side);
