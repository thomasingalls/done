import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { sealGeneration, openGeneration } from '../../src/account/generationWrap.ts';
import { unwrap } from './oracle.mjs';
const vectors = JSON.parse(readFileSync('test/vectors/package.json'));
const v = vectors.vectors[0];
const bytes = (v) => new Uint8Array(Buffer.from(v, 'hex'));
const rPriv = '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a';
const rPub = v.inputs.generation.wrapped_to;
const privateKey = await crypto.subtle.importKey(
  'pkcs8',
  bytes('302e020100300506032b656e04220420' + rPriv),
  'X25519',
  false,
  ['deriveBits'],
);
test('runtime and independent oracle open the published AES-256 HPKE generation vector', async () => {
  assert.equal(
    Buffer.from(
      await openGeneration(
        v.expected.generation_wrap,
        privateKey,
        bytes(rPub),
        bytes(v.derived.wrap_info),
      ),
    ).toString('hex'),
    v.inputs.generation.k_g,
  );
  assert.equal(
    unwrap(
      v.expected.generation_wrap,
      Buffer.from(rPriv, 'hex'),
      Buffer.from(rPub, 'hex'),
      Buffer.from(v.derived.wrap_info, 'hex'),
    ).toString('hex'),
    v.inputs.generation.k_g,
  );
});
test('100 generated runtime seals interoperate with OpenSSL; info and ciphertext substitutions refuse', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uint8Array({ minLength: 32, maxLength: 32 }),
      fc.uint8Array({ maxLength: 128 }),
      async (key, info) => {
        const sealed = await sealGeneration(bytes(rPub), info, key);
        assert.deepEqual(
          unwrap(sealed, Buffer.from(rPriv, 'hex'), Buffer.from(rPub, 'hex'), Buffer.from(info)),
          Buffer.from(key),
        );
        assert.deepEqual(await openGeneration(sealed, privateKey, bytes(rPub), info), key);
        const wrong = new Uint8Array([...info, 1]);
        await assert.rejects(openGeneration(sealed, privateKey, bytes(rPub), wrong));
        const ct = bytes(sealed.ct);
        ct[0] ^= 1;
        await assert.rejects(
          openGeneration(
            { ...sealed, ct: Buffer.from(ct).toString('hex') },
            privateKey,
            bytes(rPub),
            info,
          ),
        );
      },
    ),
    { seed: 9212026, numRuns: 100, endOnFailure: true },
  );
});
test('low-order recipients and malformed generation size refuse', async () => {
  await assert.rejects(sealGeneration(new Uint8Array(32), new Uint8Array(), new Uint8Array(32)));
  await assert.rejects(sealGeneration(bytes(rPub), new Uint8Array(), new Uint8Array(31)));
});
