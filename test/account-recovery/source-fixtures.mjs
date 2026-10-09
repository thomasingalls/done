import assert from 'node:assert/strict';
import { build } from 'vite';
import { createCipheriv, hkdfSync } from 'node:crypto';
import { resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { ready as admitted } from '../account-successor/service-fixtures.mjs';
import { authorityFixture } from '../account-authority/fixtures.mjs';
import { lp } from '../account-enrollment/fixtures.mjs';
import { recoveryReader } from './read-fixtures.mjs';
const built = await build({
  configFile: false,
  logLevel: 'error',
  build: {
    write: false,
    minify: false,
    rollupOptions: { output: { codeSplitting: false } },
    lib: { entry: resolve('test/account-recovery/source-entry.ts'), formats: ['es'] },
  },
});
const dir = mkdtempSync(join(tmpdir(), 'done-recovery-source-')),
  path = join(dir, 'client.mjs');
writeFileSync(
  path,
  (Array.isArray(built) ? built[0] : built).output.find((o) => o.type === 'chunk').code,
);
process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
export const client = await import(pathToFileURL(path).href);
const { Y } = client;
const hex = (value) => Buffer.from(value).toString('hex');
export async function sourceFixture(t, options = {}, make = admitted) {
  const key = new Uint8Array(32).fill(73),
    root = new Y.Doc({ gc: false });
  root.clientID = 901;
  root.getMap('meta').set('schemaVersion', 4);
  root
    .getMap('meta')
    .set('actor:' + '11'.repeat(16), { kind: 'human', name: 'Writer', color: 'blue' });
  root.getText('master').insert(0, 'before loss\n');
  const parts = client.genesisCoverageParts(root),
    salt = '66'.repeat(16),
    nonce = '67'.repeat(12),
    workspace = '22'.repeat(16);
  const cipher = createCipheriv(
    'aes-256-gcm',
    hkdfSync('sha256', key, Buffer.from(salt, 'hex'), lp('done/checkpoint/v1', workspace), 32),
    Buffer.from(nonce, 'hex'),
  );
  cipher.setAAD(lp('done/cp/v1', '1', workspace, '1', '1'));
  const ct = Buffer.concat([
    cipher.update(Y.encodeStateAsUpdate(root)),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const authority = authorityFixture(t);
  const x = await make(t, {
    authority,
    sessions: { pin: authority.pin, operatorKey: authority.key },
    membershipContinuation: true,
    now: () => 1000,
    generationKey: key,
    genesis: {
      checkpoint: { v: 1, salt, nonce, ct: hex(ct) },
      coverage: {
        derivation: 'yjs-13.6.31-snapshot-v1',
        snapshot: hex(client.genesisCoverage(root)),
        heads: [],
      },
      parts: { sv: hex(parts.sv), ds: hex(parts.ds) },
    },
    recoveryWrap: (draft) =>
      client.sealGeneration(
        new Uint8Array(Buffer.from(draft.rPub, 'hex')),
        new Uint8Array(
          lp('done/gen-wrap/v1', draft.workspaceId, draft.lineageId, draft.authRoot, '1'),
        ),
        key,
      ),
    ...options,
  });
  const reader = await recoveryReader(x);
  const append = async (position, updates) => {
    const wire = x.make(position, 'unused', { updates });
    const result = await x.authority.owner.decideSubmission(x.f.core, {
      workspaceId: x.workspace,
      bytes: wire.bytes,
    });
    assert.equal(result.kind, 'decision');
    return wire;
  };
  t.after(() => {
    key.fill(0);
    root.destroy();
  });
  return {
    ...x,
    reader,
    root,
    append,
    input: {
      prepared: reader.verified.prepared,
      begin: reader.input,
      pin: authority.pin,
      code: x.recovery.code,
      bootstrap: reader.bootstrap,
      sign: async (bytes) =>
        hex(new Uint8Array(await crypto.subtle.sign('Ed25519', reader.signer, bytes))),
      read: reader.read,
      assertCurrent() {},
    },
  };
}
