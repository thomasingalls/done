// @vitest-environment node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCipheriv, createHash, createPrivateKey, hkdfSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  envelopeKeyInfo,
  envelopeAAD,
  envelopeSignatureMessage,
  encodeEnvelopeBody,
  decodeEnvelopeBody,
  encodeNetworkEnvelope,
  decodeNetworkEnvelope,
  sealNetworkEnvelope,
  verifyNetworkEnvelope,
  openNetworkEnvelope,
  ENVELOPE_BODY_LIMIT,
  ENVELOPE_UPDATE_LIMIT,
  assertAdmittedEnvelope,
  ADMITTED_ENVELOPE_WIRE_LIMIT,
  EnvelopeSizeError,
  type EnvelopeHeader,
  type NetworkEnvelope,
} from '../account-protocol/envelope';
import { hex, unhex } from '../account-protocol/recovery';

const legacy = JSON.parse(readFileSync('test/vectors/envelope.json', 'utf8'));
const vectors = JSON.parse(readFileSync('test/vectors/private-envelope.json', 'utf8'));
const bytes = (s: string) => unhex(s, s.length / 2);
const der = Buffer.from('302e020100300506032b657004220420' + vectors.keys.device.seed, 'hex');
const signer = await crypto.subtle.importKey('pkcs8', der, 'Ed25519', false, ['sign']);
const verifier = await crypto.subtle.importKey(
  'raw',
  bytes(vectors.keys.device.public_key),
  'Ed25519',
  false,
  ['verify'],
);
const key = bytes(vectors.vectors[0].inputs.k_g);
const first = vectors.vectors[0];
const h: EnvelopeHeader = {
  v: 2,
  workspace_id: first.inputs.workspace_id,
  credential_id: first.inputs.credential_id,
  epoch: 7,
  gen: 1,
  seq: 2,
};
const baseline: NetworkEnvelope = {
  ...h,
  nonce: bytes(first.inputs.nonce),
  ct: bytes(first.expected.ciphertext),
  digest: bytes(first.expected.digest),
  sig: bytes(first.expected.signature),
};
const body = {
  actor_id: first.inputs.actor_id as string,
  actor_kind: 'human' as const,
  updates: [bytes(first.inputs.updates[0])],
};

it('current admission uses exact wire bytes across 32 generated headers and preserves large singletons', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 128 }),
      fc.integer({ min: 1, max: 128 }),
      fc.constantFrom(1, 999, Number.MAX_SAFE_INTEGER),
      async (width, actorWidth, seq) => {
        const header = {
          ...h,
          workspace_id: 'w'.repeat(width),
          credential_id: 'c'.repeat(width),
          seq,
        };
        const actor_id = 'a'.repeat(actorWidth);
        // Independent byte framing oracle, deliberately not the production sizing helper.
        const overhead =
          fields('done/envelope-wire/v2', ...aadFields(header)).length +
          12 +
          32 +
          4 +
          16 +
          64 +
          fields('done/env-body/v1', actor_id, 'human').length +
          4 +
          4;
        const length = ADMITTED_ENVELOPE_WIRE_LIMIT - overhead;
        expect(length).toBeGreaterThan(64 * 1024);
        for (const delta of [-1, 0, 1]) {
          const candidate = {
            actor_id,
            actor_kind: 'human' as const,
            updates: [new Uint8Array(length + delta).fill(97)],
          };
          if (delta > 0) {
            expect(() => assertAdmittedEnvelope(header, candidate)).toThrow(EnvelopeSizeError);
            // Must reject before it asks any cryptographic primitive to run.
            await expect(
              sealNetworkEnvelope(
                header,
                candidate,
                key,
                signer,
                baseline.nonce,
                new Proxy(crypto.subtle, {
                  get() {
                    throw Error('Crypto invoked before bounds');
                  },
                }),
              ),
            ).rejects.toBeInstanceOf(EnvelopeSizeError);
          } else {
            assertAdmittedEnvelope(header, candidate);
            const wire = await sealNetworkEnvelope(header, candidate, key, signer, baseline.nonce);
            expect(wire.length).toBe(ADMITTED_ENVELOPE_WIRE_LIMIT + delta);
            const opened = await openNetworkEnvelope(wire, header, verifier, key);
            expect(Buffer.compare(opened.updates[0]!, candidate.updates[0]!)).toBe(0);
          }
        }
      },
    ),
    { seed: 901013, numRuns: 32 },
  );
});
it('new seals admit 255 updates while historical codecs still read 256-update bodies', async () => {
  const current = { ...body, updates: Array.from({ length: 255 }, () => new Uint8Array([0, 0])) };
  const wire = await sealNetworkEnvelope(h, current, key, signer, baseline.nonce);
  expect((await openNetworkEnvelope(wire, h, verifier, key)).updates).toHaveLength(255);
  const historical = { ...current, updates: [...current.updates, new Uint8Array([0, 0])] };
  expect(decodeEnvelopeBody(encodeEnvelopeBody(historical)).updates).toHaveLength(256);
  await expect(
    sealNetworkEnvelope(h, historical, key, signer, baseline.nonce),
  ).rejects.toBeInstanceOf(EnvelopeSizeError);
});

// An independent framing/crypto oracle (Node OpenSSL), not the codec under test.
const fields = (...items: string[]) =>
  Buffer.concat(
    items.map((s) => {
      const p = Buffer.from(s),
        n = Buffer.alloc(2);
      n.writeUInt16BE(p.length);
      return Buffer.concat([n, p]);
    }),
  );
const aadFields = (e: EnvelopeHeader) => [
  String(e.v),
  e.workspace_id,
  e.credential_id,
  String(e.epoch),
  String(e.gen),
  String(e.seq),
];
function signed(e: NetworkEnvelope, label = 'done/env-sig/v2') {
  return {
    ...e,
    sig: new Uint8Array(
      sign(
        null,
        fields(label, ...aadFields(e), hex(e.nonce), hex(e.digest)),
        createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }),
      ),
    ),
  };
}
function encrypted(plaintext: Uint8Array, aad = fields('done/env/v2', ...aadFields(h))) {
  const net = Buffer.from(
    hkdfSync(
      'sha256',
      key,
      Buffer.alloc(0),
      fields('done/envelope/v2', h.workspace_id, h.credential_id, String(h.gen)),
      32,
    ),
  );
  const cipher = createCipheriv('aes-256-gcm', net, baseline.nonce);
  cipher.setAAD(aad);
  const ct = new Uint8Array(
    Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]),
  );
  return signed({
    ...baseline,
    ct,
    digest: new Uint8Array(createHash('sha256').update(ct).digest()),
  });
}

describe('row-4 envelope codec', () => {
  it('rejects all 20 published private v2 binding substitutions with independent WebCrypto', async () => {
    const root = await crypto.subtle.importKey('raw', key, 'HKDF', false, ['deriveKey']);
    const derive = (info: Uint8Array<ArrayBuffer>) =>
      crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info },
        root,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
      );
    const originalInfo = envelopeKeyInfo(h),
      originalAAD = envelopeAAD(h);
    const originalKey = await derive(originalInfo);
    // Prove the fixture authenticates before interpreting any refusal as coverage.
    await expect(
      crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: baseline.nonce, additionalData: originalAAD },
        originalKey,
        baseline.ct,
      ),
    ).resolves.toEqual(bytes(first.derived.body).buffer);
    expect(
      await crypto.subtle.verify(
        'Ed25519',
        verifier,
        baseline.sig,
        envelopeSignatureMessage(baseline, baseline.nonce, baseline.digest),
      ),
    ).toBe(true);
    expect(vectors.must_fail).toHaveLength(20);
    for (const negative of vectors.must_fail) {
      const encoded = bytes(negative.encoded);
      if (negative.construction === 'signature_message') {
        expect(
          await crypto.subtle.verify('Ed25519', verifier, baseline.sig, encoded),
          negative.name,
        ).toBe(false);
      } else {
        const changedKey =
          negative.construction === 'hkdf_info' ? await derive(encoded) : originalKey;
        const changedAAD = negative.construction === 'aad' ? encoded : originalAAD;
        await expect(
          crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: baseline.nonce, additionalData: changedAAD },
            changedKey,
            baseline.ct,
          ),
          negative.name,
        ).rejects.toThrow();
      }
    }
  });
  it('separates v2 keys by credential and generation and refuses v1 mint/downgrade', async () => {
    const base = envelopeKeyInfo(h);
    for (const other of [
      { ...h, credential_id: 'other' },
      { ...h, gen: 2 },
      { ...h, workspace_id: 'other' },
    ]) {
      const different = envelopeKeyInfo(other);
      expect(different).not.toEqual(base);
      expect(Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), different, 32))).not.toEqual(
        Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), base, 32)),
      );
    }
    await expect(
      sealNetworkEnvelope({ ...h, v: 1 }, body, key, signer, baseline.nonce),
    ).rejects.toThrow('require v2');
    const old = legacy.vectors[0];
    const wire = encodeNetworkEnvelope({
      ...baseline,
      v: 1,
      ct: bytes(old.expected.ciphertext),
      digest: bytes(old.expected.digest),
      sig: bytes(old.expected.signature),
    });
    await expect(verifyNetworkEnvelope(wire, h, verifier)).rejects.toThrow('route');
  });
  for (const v of [...legacy.vectors, ...vectors.vectors])
    it(`reproduces version ${v.inputs.v} bytes: ${v.name}`, async () => {
      const header: EnvelopeHeader = {
        v: v.inputs.v,
        workspace_id: v.inputs.workspace_id,
        credential_id: v.inputs.credential_id,
        epoch: v.inputs.epoch,
        gen: v.inputs.gen,
        seq: v.inputs.seq,
      };
      const b = {
        actor_id: v.inputs.actor_id,
        actor_kind: v.inputs.actor_kind,
        updates: v.inputs.updates.map(bytes),
      };
      expect(hex(envelopeKeyInfo(header))).toBe(v.derived.hkdf_info);
      expect(hex(envelopeAAD(header))).toBe(v.derived.aad);
      expect(hex(encodeEnvelopeBody(b))).toBe(v.derived.body);
      const wire =
        header.v === 1
          ? encodeNetworkEnvelope({
              ...header,
              nonce: bytes(v.inputs.nonce),
              ct: bytes(v.expected.ciphertext),
              digest: bytes(v.expected.digest),
              sig: bytes(v.expected.signature),
            })
          : await sealNetworkEnvelope(
              header,
              b,
              bytes(v.inputs.k_g),
              signer,
              bytes(v.inputs.nonce),
            );
      const e = decodeNetworkEnvelope(wire);
      expect(hex(e.ct)).toBe(v.expected.ciphertext);
      expect(hex(e.digest)).toBe(v.expected.digest);
      expect(hex(e.sig)).toBe(v.expected.signature);
      expect(hex(envelopeSignatureMessage(e, e.nonce, e.digest))).toBe(v.derived.signature_message);
      expect(await openNetworkEnvelope(wire, header, verifier, key)).toEqual(b);
      expect(encodeNetworkEnvelope(e)).toEqual(wire);
      if (header.v === 2) expect(hex(wire)).toBe(v.expected.wire);
    });
  for (const field of ['workspace_id', 'credential_id', 'epoch', 'gen', 'seq'] as const)
    it(`separately checks the signature and seal binding for ${field}`, async () => {
      const e = { ...baseline, [field]: typeof h[field] === 'string' ? 'another' : 99 };
      await expect(verifyNetworkEnvelope(encodeNetworkEnvelope(e), e, verifier)).rejects.toThrow(
        'signature',
      );
      const goodSignature = encodeNetworkEnvelope(signed(e));
      expect(await verifyNetworkEnvelope(goodSignature, e, verifier)).toMatchObject({
        [field]: e[field],
      });
      await expect(openNetworkEnvelope(goodSignature, e, verifier, key)).rejects.toThrow();
    });
  it('checks version, domains, nonce, digest, ciphertext, signer and workspace subkey', async () => {
    expect(() =>
      encodeNetworkEnvelope({ ...baseline, v: 3 } as unknown as NetworkEnvelope),
    ).toThrow();
    await expect(
      verifyNetworkEnvelope(
        encodeNetworkEnvelope(signed(baseline, 'done/env-sig/v1')),
        h,
        verifier,
      ),
    ).rejects.toThrow('signature');
    const wrongDomain = encrypted(
      bytes(first.derived.body),
      fields('done/env/v1', ...aadFields(h)),
    );
    await expect(
      openNetworkEnvelope(encodeNetworkEnvelope(wrongDomain), h, verifier, key),
    ).rejects.toThrow();
    await expect(
      verifyNetworkEnvelope(
        encodeNetworkEnvelope({ ...baseline, nonce: new Uint8Array(12) }),
        h,
        verifier,
      ),
    ).rejects.toThrow('signature');
    await expect(
      verifyNetworkEnvelope(
        encodeNetworkEnvelope({ ...baseline, digest: new Uint8Array(32) }),
        h,
        verifier,
      ),
    ).rejects.toThrow('digest');
    const ct = baseline.ct.slice();
    ct[ct.length - 1]! ^= 1;
    await expect(
      verifyNetworkEnvelope(encodeNetworkEnvelope({ ...baseline, ct }), h, verifier),
    ).rejects.toThrow('digest');
    const correctlySignedCorruption = signed({
      ...baseline,
      ct,
      digest: new Uint8Array(createHash('sha256').update(ct).digest()),
    });
    await expect(
      openNetworkEnvelope(encodeNetworkEnvelope(correctlySignedCorruption), h, verifier, key),
    ).rejects.toThrow();
    const other = await crypto.subtle.importKey(
      'raw',
      bytes(vectors.keys.other_credential.public_key),
      'Ed25519',
      false,
      ['verify'],
    );
    await expect(verifyNetworkEnvelope(encodeNetworkEnvelope(baseline), h, other)).rejects.toThrow(
      'signature',
    );
    await expect(
      openNetworkEnvelope(encodeNetworkEnvelope(baseline), h, verifier, new Uint8Array(32)),
    ).rejects.toThrow();
    await expect(
      verifyNetworkEnvelope(
        encodeNetworkEnvelope(baseline),
        { ...h, workspace_id: 'other' },
        verifier,
      ),
    ).rejects.toThrow('route');
  });
  it('refuses malformed framing and authenticated malformed bodies without returning updates', async () => {
    const wire = encodeNetworkEnvelope(baseline);
    for (let n = 0; n < wire.length; n++)
      expect(() => decodeNetworkEnvelope(wire.slice(0, n))).toThrow();
    expect(() => decodeNetworkEnvelope(new Uint8Array([...wire, 0]))).toThrow();
    const noncanonical = new Uint8Array(wire.length + 1);
    // Rebuild a wire with seq 02: decoding must reject even though Number("02") is 2.
    const prefix = fields(
      'done/envelope-wire/v2',
      '2',
      h.workspace_id,
      h.credential_id,
      '7',
      '1',
      '02',
    );
    const tail = wire.slice(fields('done/envelope-wire/v2', ...aadFields(h)).length);
    noncanonical.set(prefix);
    noncanonical.set(tail, prefix.length);
    expect(() => decodeNetworkEnvelope(noncanonical)).toThrow();
    const normalBody = bytes(first.derived.body);
    for (const b of [
      normalBody.slice(0, -1),
      new Uint8Array([...normalBody, 0]),
      new Uint8Array(0),
      new Uint8Array([...fields('done/env-body/v1', body.actor_id, 'human'), 255, 255, 255, 255]),
    ]) {
      await expect(
        openNetworkEnvelope(encodeNetworkEnvelope(encrypted(b)), h, verifier, key),
      ).rejects.toThrow();
    }
    expect(() => encodeEnvelopeBody({ ...body, updates: [] })).toThrow();
    expect(() => encodeEnvelopeBody({ ...body, updates: [new Uint8Array()] })).toThrow();
    expect(() =>
      encodeEnvelopeBody({
        ...body,
        updates: Array(ENVELOPE_UPDATE_LIMIT + 1).fill(body.updates[0]),
      }),
    ).toThrow();
    expect(() =>
      encodeEnvelopeBody({ ...body, updates: [new Uint8Array(ENVELOPE_BODY_LIMIT)] }),
    ).toThrow();
  });
  it('captures mutable input before asynchronous crypto and returns detached output', async () => {
    const header = { ...h },
      input = { ...body, updates: body.updates.map((u) => u.slice()) },
      kg = key.slice(),
      nonce = baseline.nonce.slice();
    const operation = sealNetworkEnvelope(header, input, kg, signer, nonce);
    header.seq = 99;
    input.updates[0]!.fill(0);
    kg.fill(0);
    nonce.fill(0);
    const wire = await operation;
    expect(wire).toEqual(encodeNetworkEnvelope(baseline));
    const openingKey = key.slice(),
      route = { ...h };
    const opening = openNetworkEnvelope(wire, route, verifier, openingKey);
    wire.fill(0);
    route.epoch = 99;
    openingKey.fill(0);
    expect(await opening).toEqual(body);
  });
  it('generated bodies roundtrip exactly; arbitrary changed wire bytes cannot authenticate', async () => {
    const seed = 9302026,
      inputs: unknown[] = [];
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.uint8Array({ minLength: 1, maxLength: 128 }), { minLength: 1, maxLength: 8 }),
        fc.nat(),
        async (updates, mutation) => {
          inputs.push({ updates: updates.map(hex), mutation });
          const b = { ...body, updates: updates.map((u) => new Uint8Array(u)) };
          expect(decodeEnvelopeBody(encodeEnvelopeBody(b))).toEqual(b);
          const wire = await sealNetworkEnvelope(
            h,
            b,
            key,
            signer,
            crypto.getRandomValues(new Uint8Array(12)),
          );
          expect(await openNetworkEnvelope(wire, h, verifier, key)).toEqual(b);
          wire[mutation % wire.length]! ^= 1;
          await expect(openNetworkEnvelope(wire, h, verifier, key)).rejects.toThrow();
        },
      ),
      { seed, numRuns: 100 },
    );
    if (process.env['OUTBOUND_REPORT_DIR'])
      writeFileSync(
        join(process.env['OUTBOUND_REPORT_DIR'], 'codec-generated.json'),
        JSON.stringify({ seed, runs: inputs.length, inputs }, null, 2) + '\n',
      );
  });
});
