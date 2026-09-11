// Independent byte encoder and Node/OpenSSL oracle. No production imports.
import { hkdfSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
export { bytes, hex, lp, aes, openAES } from '../account-store-contract/oracle.mjs';
import { bytes, hex, lp, aes } from '../account-store-contract/oracle.mjs';
export const infoFields = (v) => ['done/checkpoint/v1', v.workspaceId];
export const aadFields = (v) => [
  'done/cp/v1',
  '1',
  v.workspaceId,
  String(v.generation),
  String(v.proposedEpoch),
];
export const key = (v, info = lp(...infoFields(v))) =>
  new Uint8Array(hkdfSync('sha256', bytes(v.key), bytes(v.salt), info, 32));
export const seal = (v, aad = lp(...aadFields(v))) =>
  aes(key(v), bytes(v.nonce), aad, bytes(v.plaintext));
export const inherited = () => JSON.parse(readFileSync('test/vectors/checkpoint.json')).vectors[0];
export const flip = (s) => (s[0] === '0' ? '1' : '0') + s.slice(1);
export function fixtures() {
  const old = inherited().inputs;
  return [
    {
      name: 'genesis',
      key: 'a1'.repeat(32),
      salt: 'b2'.repeat(16),
      nonce: 'c3'.repeat(12),
      workspaceId: 'd4'.repeat(16),
      generation: 1,
      proposedEpoch: 1,
      plaintext: '0000',
    },
    {
      name: 'inherited',
      key: old.k_g,
      salt: old.cp_salt,
      nonce: old.nonce,
      workspaceId: old.workspace_id,
      generation: old.gen,
      proposedEpoch: old.epoch,
      plaintext: hex(Buffer.from(old.snapshot_utf8)),
    },
    {
      name: 'decimal-helper',
      key: '01'.repeat(32),
      salt: '02'.repeat(16),
      nonce: '03'.repeat(12),
      workspaceId: 'workspace-helper',
      generation: 12,
      proposedEpoch: 345,
      plaintext: '000102ff',
    },
  ];
}
export function corpus() {
  return {
    v: 1,
    vectors: fixtures().flatMap((input) => {
      const info = infoFields(input),
        aad = aadFields(input);
      const kdf = {
        id: 'checkpoint-key-' + input.name,
        kind: 'kdf',
        signer: null,
        input,
        expected: { messageHex: hex(lp(...info)), resultHex: hex(key(input)) },
        negatives: ['key', 'salt', 'workspaceId', 'label'].map((field) => {
          const v = structuredClone(input);
          if (field !== 'label')
            v[field] = field === 'workspaceId' ? v[field] + 'x' : flip(v[field]);
          const fields = infoFields(v);
          if (field === 'label') fields[0] += 'x';
          return {
            field,
            input: v,
            messageHex: hex(lp(...fields)),
            resultHex: hex(key(v, lp(...fields))),
          };
        }),
      };
      const cipher = {
        id: 'checkpoint-seal-' + input.name,
        kind: 'aead',
        signer: null,
        input,
        expected: { messageHex: hex(lp(...aad)), resultHex: hex(seal(input)) },
        negatives: aad.map((_, i) => {
          const fields = [...aad];
          fields[i] += 'x';
          return {
            field: ['label', 'version', 'workspace', 'generation', 'epoch'][i],
            messageHex: hex(lp(...fields)),
            resultHex: hex(seal(input, lp(...fields))),
          };
        }),
        encodedBindingControls: aad.map((_, i) => {
          const fields = aad.filter((_, j) => i !== j);
          return {
            omitted: ['label', 'version', 'workspace', 'generation', 'epoch'][i],
            messageHex: hex(lp(...fields)),
            resultHex: hex(seal(input, lp(...fields))),
          };
        }),
      };
      return [kdf, cipher];
    }),
  };
}
