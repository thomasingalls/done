import test from 'node:test';
import assert from 'node:assert/strict';
import { generateRecovery } from '../../src/account/recovery.ts';
const scope = {
  principalId: 'principal',
  workspaceId: 'workspace',
  lineageId: 'lineage',
  authRoot: 'ab'.repeat(32),
};

test('PKCS#8 extraction refuses wrong algorithm, prefix, truncation and extra bytes for each private key; clears exports before returning', async (t) => {
  const original = crypto.subtle.exportKey.bind(crypto.subtle);
  for (const kind of ['X25519', 'Ed25519']) {
    for (const fault of ['oid', 'prefix', 'short', 'extra']) {
      const owned = [];
      const exported = t.mock.method(crypto.subtle, 'exportKey', async (format, key) => {
        let bytes = new Uint8Array(await original(format, key));
        if (format === 'pkcs8') {
          if (key.algorithm.name === kind) {
            if (fault === 'oid') bytes[11] ^= 1;
            if (fault === 'prefix') bytes[0] ^= 1;
            if (fault === 'short') bytes = bytes.slice(1);
            if (fault === 'extra') bytes = new Uint8Array([0, ...bytes]);
          }
          owned.push(bytes);
        }
        return bytes.buffer;
      });
      let seals = 0;
      const originalSeal = crypto.subtle.encrypt.bind(crypto.subtle);
      const sealed = t.mock.method(crypto.subtle, 'encrypt', (...args) => {
        seals++;
        return originalSeal(...args);
      });
      try {
        await assert.rejects(
          generateRecovery(scope),
          /Unexpected .* PKCS#8 export/,
          kind + ':' + fault,
        );
        assert.equal(seals, 0);
        assert(owned.length > 0 && owned.every((bytes) => bytes.every((b) => b === 0)));
      } finally {
        exported.mock.restore();
        sealed.mock.restore();
      }
    }
  }
});
