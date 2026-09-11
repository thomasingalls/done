import test from 'node:test';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, bytes, lp, seal } from './oracle.mjs';
import { withRecoveryKeys } from '../../src/account/recovery.ts';
const source = readFileSync('src/account/recovery.ts', 'utf8');
async function mutant(from, to) {
  assert.equal(
    source.split(from).length,
    2,
    'Control must match exactly one reviewed production site',
  );
  const changed = source
    .replace(from, to)
    .replace(
      "'../../account-protocol/recovery.ts'",
      JSON.stringify(new URL('../../account-protocol/recovery.ts', import.meta.url).href),
    );
  return import(
    'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(changed)).toString('base64')
  );
}
const f = fixture();
const open = (runtime, draft) => runtime(draft, f.code, crypto.subtle, async () => 'released');
const damaged = (offset) => {
  const payload = bytes(f.payload);
  payload[offset] ^= 1;
  return {
    ...f.draft,
    envelope: {
      ...f.draft.envelope,
      ct: seal(bytes(f.key), bytes(f.nonce), lp(...f.aadFields), payload).toString('hex'),
    },
  };
};

test('removing each production context/root/key-pair check rescues its separately authentic counterexample', async () => {
  const controls = [
    [
      'public context',
      'if ((await rootCommitment(draft)) !== draft.rootCommitment)',
      'if (false)',
      { ...f.draft, workspaceId: 'other-workspace' },
    ],
    [
      'sealed root',
      'payload.length !== 96 || hex(payload.subarray(32, 64)) !== draft.rootCommitment',
      'payload.length !== 96',
      damaged(32),
    ],
    [
      'wrapping key pair',
      'if (!a.some((v) => v !== 0) || hex(a) !== hex(b))',
      'if (false)',
      damaged(1),
    ],
    [
      'bootstrap key pair',
      "if (!(await subtle.verify('Ed25519', verify, proof, message)))",
      'if (false)',
      damaged(64),
    ],
  ];
  const evidence = [];
  for (const [name, from, to, draft] of controls) {
    await assert.rejects(open(withRecoveryKeys, draft));
    const broken = await mutant(from, to);
    assert.equal(await open(broken.withRecoveryKeys, draft), 'released');
    evidence.push({ name, actualRefused: true, omittedCheckReleased: true });
  }
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, 'production-guard-controls.json'),
      JSON.stringify(evidence, null, 2) + '\n',
    );
  }
});

test('omitting exact PKCS#8 format checks recreates acceptance of each malformed export', async (t) => {
  const from =
    'if (bytes.length !== 48 || !header.every((value, i) => bytes[i] === value))\n    throw Error(`Unexpected ${kind} PKCS#8 export`);\n  return bytes.subarray(16);';
  const broken = await mutant(from, 'return bytes.subarray(-32);');
  const original = crypto.subtle.exportKey.bind(crypto.subtle);
  for (const kind of ['X25519', 'Ed25519'])
    for (const fault of ['oid', 'prefix', 'short', 'extra']) {
      const mock = t.mock.method(crypto.subtle, 'exportKey', async (format, key) => {
        let value = new Uint8Array(await original(format, key));
        if (format === 'pkcs8' && key.algorithm.name === kind) {
          if (fault === 'oid') value[11] ^= 1;
          if (fault === 'prefix') value[0] ^= 1;
          if (fault === 'short') value = value.slice(1);
          if (fault === 'extra') value = new Uint8Array([0, ...value]);
        }
        return value.buffer;
      });
      try {
        const result = await broken.generateRecovery({
          principalId: f.principalId,
          workspaceId: f.workspaceId,
          lineageId: f.lineageId,
          authRoot: f.authRoot,
        });
        assert.equal(result.draft.envelope.ct.length, 224);
      } finally {
        mock.mock.restore();
      }
    }
});
