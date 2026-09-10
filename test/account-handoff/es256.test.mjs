import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import fc from 'fast-check';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { es256Signature } from '../../src/account/es256Signature.ts';
test('200 generated OpenSSL DER signatures convert to valid WebCrypto/P1363 scalars; malformed DER refuses', () => {
  const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const cases = [];
  try {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 1024 }), (message) => {
        const der = sign('sha256', message, key.privateKey),
          raw = es256Signature(der);
        cases.push({ message: Buffer.from(message).toString('hex'), der: der.toString('hex') });
        assert.ok(raw);
        assert.equal(raw.length, 64);
        assert.ok(
          verify('sha256', message, { key: key.publicKey, dsaEncoding: 'ieee-p1363' }, raw),
        );
        for (const bad of [
          der.subarray(0, -1),
          Buffer.concat([der, Buffer.from([0])]),
          Buffer.from([0x31, ...der.subarray(1)]),
          Buffer.from([0x30, 0x81, der.length - 2, ...der.subarray(2)]),
        ])
          assert.equal(es256Signature(bad), null);
      }),
      { seed: 9262026, numRuns: 200, endOnFailure: true },
    );
  } finally {
    if (process.env.ACCOUNT_REPORT_DIR)
      writeFileSync(
        join(process.env.ACCOUNT_REPORT_DIR, 'generated-der.json'),
        JSON.stringify(
          {
            seed: 9262026,
            publicKey: key.publicKey.export({ format: 'der', type: 'spki' }).toString('hex'),
            cases,
          },
          null,
          2,
        ),
      );
  }
  for (const der of [
    '300702020001020101',
    '3006020180020101',
    '30050200020101',
    '3006020101020180',
  ])
    assert.equal(es256Signature(Buffer.from(der, 'hex')), null);
});
