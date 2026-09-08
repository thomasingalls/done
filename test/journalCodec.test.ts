// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import vectors from './vectors/journal-aead.json';
import {
  createJournalCodec,
  decodeJournal,
  deriveJournalKey,
  encodeJournal,
  journalAAD,
  MAX_JOURNAL_UPDATE,
} from '../src/crdt/journalCodec';
import { createJournalSeal } from '../wasm/journal-seal/seal.generated';
import { hex } from '../src/crdt/custodyCrypto';
const unhex = (s: string) => new Uint8Array(Buffer.from(s, 'hex'));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('selected synchronous journal construction', () => {
  for (const v of vectors.vectors)
    it(v.name, async () => {
      const key = await deriveJournalKey(unhex(v.inputs.k_g), v.inputs.workspace_id);
      expect(hex(key)).toBe(v.derived.k_journal);
      expect(
        hex(journalAAD(v.inputs.workspace_id, v.inputs.gen, v.inputs.journal_storage_key)),
      ).toBe(v.derived.aad);
      const codec = createJournalCodec(v.inputs.workspace_id, v.inputs.gen, key);
      try {
        const actual = codec.seal(
          v.inputs.journal_storage_key,
          unhex(v.inputs.nonce),
          unhex(v.inputs.plaintext),
        );
        expect(actual).toBe(v.expected.record);
        expect(hex(codec.open(v.inputs.journal_storage_key, actual).bytes)).toBe(
          v.inputs.plaintext,
        );
        expect(() => codec.open(v.inputs.journal_storage_key + 'x', actual)).toThrow(
          expect.objectContaining({ code: 'repair-required' }),
        );
        const parsed = decodeJournal(actual);
        parsed.ct[parsed.ct.length - 1] = parsed.ct[parsed.ct.length - 1]! ^ 1;
        expect(() =>
          codec.open(
            v.inputs.journal_storage_key,
            encodeJournal(parsed.generation, parsed.nonce, parsed.ct),
          ),
        ).toThrow();
      } finally {
        codec.dispose();
        key.fill(0);
      }
    });
  it('rejects unknown/legacy, truncated and noncanonical frames before decryption', () => {
    const value = vectors.vectors[0]!.expected.record;
    for (const bad of [
      '',
      '1:plaintext',
      '3:' + value.slice(2),
      value + '\n',
      value.slice(0, -1),
      value.slice(0, -2) + '@=',
      '2:' + Buffer.alloc(43).toString('base64'),
      '2:' + Buffer.alloc(44).toString('base64'),
    ])
      expect(() => decodeJournal(bad)).toThrow(
        expect.objectContaining({ code: 'repair-required' }),
      );
    expect(() =>
      decodeJournal('2:' + Buffer.alloc(45 + MAX_JOURNAL_UPDATE).toString('base64')),
    ).toThrow();
  });
  it('isolates generation, workspace and key using the original ciphertext', () => {
    const v = vectors.vectors[1]!,
      original = createJournalCodec(v.inputs.workspace_id, 1, unhex(v.derived.k_journal));
    const parsed = decodeJournal(v.expected.record);
    const altered = encodeJournal(2, parsed.nonce, parsed.ct),
      second = createJournalCodec(v.inputs.workspace_id, 2, unhex(v.derived.k_journal));
    const workspace = createJournalCodec(
        v.inputs.workspace_id + 'x',
        1,
        unhex(v.derived.k_journal),
      ),
      key = createJournalCodec(v.inputs.workspace_id, 1, new Uint8Array(32));
    try {
      expect(() => original.open(v.inputs.journal_storage_key, altered)).toThrow();
      expect(() => second.open(v.inputs.journal_storage_key, altered)).toThrow();
      expect(() => workspace.open(v.inputs.journal_storage_key, v.expected.record)).toThrow();
      expect(() => key.open(v.inputs.journal_storage_key, v.expected.record)).toThrow();
    } finally {
      for (const c of [original, second, workspace, key]) c.dispose();
    }
  });
  it('keeps admission below the WASM buffer, including exact 16 KiB roundtrip', () => {
    const c = createJournalCodec('workspace', 1, new Uint8Array(32));
    const bytes = new Uint8Array(MAX_JOURNAL_UPDATE).fill(123);
    try {
      expect(c.open('key', c.seal('key', new Uint8Array(24), bytes)).bytes).toEqual(bytes);
      expect(() =>
        c.seal('key', new Uint8Array(24), new Uint8Array(MAX_JOURNAL_UPDATE + 1)),
      ).toThrow();
    } finally {
      c.dispose();
    }
  });
  it('clears the entire WASM instance on disposal and cannot reuse it', () => {
    const Native = WebAssembly.Instance;
    let memory: WebAssembly.Memory | undefined;
    vi.stubGlobal(
      'WebAssembly',
      Object.create(WebAssembly, {
        Instance: {
          value: new Proxy(Native, {
            construct(target, args) {
              const instance = Reflect.construct(target, args);
              memory = instance.exports.memory;
              return instance;
            },
          }),
        },
      }),
    );
    const c = createJournalSeal(),
      key = new Uint8Array(32).fill(37),
      nonce = new Uint8Array(24).fill(41),
      text = new Uint8Array(65).fill(73);
    const encrypted = c.seal(key, nonce, new Uint8Array(), text);
    expect(c.open(key, nonce, new Uint8Array(), encrypted)).toEqual(text);
    expect(new Uint8Array(memory!.buffer).some((b) => b !== 0)).toBe(true);
    c.dispose();
    expect(new Uint8Array(memory!.buffer).every((b) => b === 0)).toBe(true);
    expect(() => c.seal(key, nonce, new Uint8Array(), text)).toThrow('disposed');
    expect(() => c.open(key, nonce, new Uint8Array(), encrypted)).toThrow('disposed');
  });
  it('refuses malformed open inputs and remains usable after authentication failures', () => {
    const c = createJournalSeal(),
      key = new Uint8Array(32),
      nonce = new Uint8Array(24),
      ct = c.seal(key, nonce, new Uint8Array(), new Uint8Array(3));
    try {
      for (const [k, n, a, v] of [
        [new Uint8Array(31), nonce, new Uint8Array(), ct],
        [key, new Uint8Array(23), new Uint8Array(), ct],
        [key, nonce, new Uint8Array(c.maxAad + 1), ct],
        [key, nonce, new Uint8Array(), new Uint8Array(15)],
        [key, nonce, new Uint8Array(), new Uint8Array(c.maxPlaintext + 17)],
      ])
        expect(() => c.open(k!, n!, a!, v!)).toThrow();
      const bad = ct.slice();
      bad[0] = bad[0]! ^ 1;
      expect(() => c.open(key, nonce, new Uint8Array(), bad)).toThrow();
      expect(c.open(key, nonce, new Uint8Array(), ct)).toEqual(new Uint8Array(3));
    } finally {
      c.dispose();
    }
  });
});
