// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import vectors from './vectors/device-lock.json';
import recovery from './vectors/recovery-code.json';
import {
  CODE_ALPHABET,
  aes,
  createCredential,
  envelopeAAD,
  factorKey,
  fields,
  generateDeviceCode,
  hex,
  normalizeDeviceCode,
  openCredential,
  openEnvelope,
  openFactor,
  random,
  sealAAD,
  sealFactor,
  utf8,
  type LockSeal,
} from '../src/crdt/custodyCrypto';

const unhex = (value: string) => new Uint8Array(Buffer.from(value, 'hex'));
const scope = {
  principalId: vectors.seal_vectors[0]!.inputs.principal_id,
  workspaceId: vectors.seal_vectors[0]!.inputs.workspace_id,
};
describe('custody cryptographic compatibility', () => {
  for (const v of vectors.seal_vectors)
    it(`opens and reproduces ${v.name}`, async () => {
      const s: LockSeal = {
        v: 1,
        factor: v.inputs.factor as LockSeal['factor'],
        id: v.inputs.id,
        salt: unhex(v.inputs.salt),
        nonce: unhex(v.inputs.nonce),
        ct: unhex(v.expected.ct),
      };
      const context = { principalId: v.inputs.principal_id, workspaceId: v.inputs.workspace_id };
      expect(hex(await openFactor(context, unhex(v.inputs.ikm), s))).toBe(v.inputs.l_lock);
      expect(hex(sealAAD(context, s))).toBe(v.derived.aad);
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: s.nonce, additionalData: sealAAD(context, s) },
        await factorKey(context, unhex(v.inputs.ikm), s),
        unhex(v.inputs.l_lock),
      );
      expect(hex(new Uint8Array(encrypted))).toBe(v.expected.ct);
    });
  it('preserves the selected generation envelope bytes', async () => {
    const v = vectors.custody_vectors.find((v) => v.name === 'envelope-under-l-lock')!;
    const nonce = unhex('303132333435363738393a3b');
    const raw = await openEnvelope(scope, unhex(v.key), { v: 1, gen: 1, nonce, ct: unhex(v.ct) });
    expect(hex(raw)).toBe('4a1f8c05e2b7d3690fae512c86d4073bb9e0c1f24d8a63759e0b2f4c7a1d8e36');
    expect(hex(envelopeAAD(scope, 1))).toBe(v.aad);
  });
  it('isolates every seal AAD field while retaining the original key', async () => {
    const v = vectors.seal_vectors[0]!;
    const s: LockSeal = {
      v: 1,
      factor: 'code',
      id: 'code',
      salt: unhex(v.inputs.salt),
      nonce: unhex(v.inputs.nonce),
      ct: unhex(v.expected.ct),
    };
    const key = await factorKey(scope, unhex(v.inputs.ikm), s);
    for (const aad of [
      sealAAD({ ...scope, principalId: 'other' }, s),
      sealAAD({ ...scope, workspaceId: 'other' }, s),
      sealAAD(scope, { ...s, v: 2 as 1 }),
      sealAAD(scope, { ...s, factor: 'prf' }),
      sealAAD(scope, { ...s, id: 'other' }),
    ])
      await expect(
        crypto.subtle.decrypt({ name: 'AES-GCM', iv: s.nonce, additionalData: aad }, key, s.ct),
      ).rejects.toThrow();
    const flipped = s.ct.slice();
    flipped[0] = flipped[0]! ^ 1;
    await expect(openFactor(scope, unhex(v.inputs.ikm), { ...s, ct: flipped })).rejects.toThrow();
    await expect(openFactor(scope, utf8('0000000000000000000000000'), s)).rejects.toThrow();
  });
  for (const role of ['wrapping', 'signing'] as const)
    it(`seals and imports ${role} credentials non-extractably`, async () => {
      const root = random(32),
        c = await createCredential(scope, root, role, 'id');
      const key = await openCredential(scope, root, c);
      expect(key.extractable).toBe(false);
      await expect(crypto.subtle.exportKey('pkcs8', key)).rejects.toThrow();
      const other = await createCredential(scope, root, role, 'other');
      await expect(
        openCredential(scope, root, { ...c, publicKey: other.publicKey }),
      ).rejects.toThrow();
      await expect(openCredential(scope, random(32), c)).rejects.toThrow();
    });
  it('uses a fresh factor salt and nonce for each seal', async () => {
    const root = random(32),
      code = utf8('0000000000000000000000000');
    const a = await sealFactor(scope, code, root, 'code', 'code'),
      b = await sealFactor(scope, code, root, 'code', 'code');
    expect(hex(a.salt)).not.toBe(hex(b.salt));
    expect(hex(a.nonce)).not.toBe(hex(b.nonce));
    expect(await openFactor(scope, code, a)).toEqual(root);
  });
  it('rejects identity aliases from malformed UTF-16 and oversized fields', () => {
    expect(() => fields('\ud800')).toThrow();
    expect(() => fields('x'.repeat(65536))).toThrow();
    expect(fields('a', 'bc')).not.toEqual(fields('ab', 'c'));
  });
  it('imports custody roots as non-extractable AES handles', async () => {
    expect((await aes(random(32))).extractable).toBe(false);
  });
});
describe('generated device code', () => {
  it('matches the independent recovery normalizer vectors', () => {
    for (const v of recovery.normalization_vectors)
      expect(normalizeDeviceCode(v.inputs.typed)).toBe(v.expected.canonical);
    for (const value of ['chosen password', 'U'.repeat(25), '0'.repeat(24), '0'.repeat(26)])
      expect(() => normalizeDeviceCode(value)).toThrow();
  });
  it('maps all 256 entropy-byte values uniformly into 25 independent symbols', () => {
    const counts = new Map([...CODE_ALPHABET].map((c) => [c, 0]));
    for (let b = 0; b < 256; b++) {
      const stub = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
        expect((array as Uint8Array).length).toBe(25);
        (array as Uint8Array).fill(b);
        return array;
      });
      try {
        const code = generateDeviceCode();
        expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(?:-[0-9A-HJKMNP-TV-Z]{5}){4}$/u);
        const canonical = normalizeDeviceCode(code);
        expect(new Set(canonical).size).toBe(1);
        counts.set(canonical[0]!, counts.get(canonical[0]!)! + 1);
      } finally {
        stub.mockRestore();
      }
    }
    expect([...counts.values()]).toEqual(Array(32).fill(8));
  });
});
