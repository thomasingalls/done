// Implementation KATs supplement the generic row-7 vectors and their per-field elision audit.
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { manifestMessage, semanticMessage, DERIVATION } from '../../account-protocol/admission.ts';
const out = new URL('../../test/vectors/admission-coverage.json', import.meta.url);
const hash = (b) => createHash('sha256').update(b).digest('hex');
const lp = (...fields) =>
  Buffer.concat(
    fields.map((field) => {
      const raw = Buffer.from(String(field)),
        n = Buffer.alloc(2);
      n.writeUInt16BE(raw.length);
      return Buffer.concat([n, raw]);
    }),
  );
const seed = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const key = createPrivateKey({
  key: Buffer.from('302e020100300506032b657004220420' + seed, 'hex'),
  type: 'pkcs8',
  format: 'der',
});
const pub = createPublicKey(key),
  vectors = [];
for (const sizes of [
  [1, 2],
  [32767, 2],
  [32768, 2],
  [1, 32768],
]) {
  const m = {
    v: 2,
    workspaceId: '11'.repeat(16),
    epoch: 1,
    epochHead: '22'.repeat(32),
    generation: 1,
    checkpointDigest: '33'.repeat(32),
    sv: '01'.repeat(sizes[0]),
    ds: '00'.repeat(sizes[1]),
    headVectorDigest: '44'.repeat(32),
    producer: '55'.repeat(16),
    signature: '00'.repeat(64),
  };
  const manifestFields = [
    'done/cp-manifest/v2',
    '2',
    m.workspaceId,
    '1',
    m.epochHead,
    '1',
    m.checkpointDigest,
    hash(Buffer.from(m.sv, 'hex')),
    hash(Buffer.from(m.ds, 'hex')),
    m.headVectorDigest,
    m.producer,
  ];
  const mb = lp(...manifestFields);
  assert.deepEqual(Buffer.from(await manifestMessage(m)), mb);
  const a = {
    v: 2,
    workspaceId: m.workspaceId,
    checkpointDigest: m.checkpointDigest,
    manifestDigest: hash(mb),
    derivedSv: m.sv,
    derivedDs: m.ds,
    headBaselineDigest: m.headVectorDigest,
    derivation: DERIVATION,
    admittingCredential: m.producer,
    selfAdmitted: 1,
    decisionParent: '00'.repeat(32),
    signature: m.signature,
  };
  const admissionFields = [
    'done/cp-admit/v2',
    '2',
    a.workspaceId,
    a.checkpointDigest,
    a.manifestDigest,
    manifestFields[7],
    manifestFields[8],
    a.headBaselineDigest,
    a.derivation,
    a.admittingCredential,
    '1',
    a.decisionParent,
  ];
  const ab = lp(...admissionFields);
  assert.deepEqual(Buffer.from(await semanticMessage(a)), ab);
  const ms = sign(null, mb, key),
    as = sign(null, ab, key);
  const negatives = [];
  for (const [kind, fields, sig] of [
    ['manifest', manifestFields, ms],
    ['admission', admissionFields, as],
  ]) {
    for (let i = 0; i < fields.length; i++) {
      const changed = [...fields];
      changed[i] = fields[i] + '!';
      assert.equal(verify(null, lp(...changed), pub, sig), false);
      negatives.push({ kind, fieldIndex: i, replacement: changed[i], signatureRefuses: true });
    }
  }
  const { sv: _sv, ds: _ds, signature: _ms, ...manifest } = m;
  const { derivedSv: _asv, derivedDs: _ads, signature: _as, ...admission } = a;
  vectors.push({
    name: `sv-${sizes[0]}-ds-${sizes[1]}`,
    inputs: {
      manifest,
      admission,
      sv: { hexByte: '01', repeat: sizes[0] },
      ds: { hexByte: '00', repeat: sizes[1] },
    },
    expected: {
      manifestFields,
      admissionFields,
      manifestMessage: mb.toString('hex'),
      admissionMessage: ab.toString('hex'),
      manifestSignature: ms.toString('hex'),
      admissionSignature: as.toString('hex'),
    },
    negatives,
  });
}
const data =
  JSON.stringify(
    {
      version: 2,
      contract: 'docs/account-admission-bounds.md',
      generator: 'scripts/account-admission-bounds/vectors.mjs',
      reconstruction:
        'Decode hexByte to one byte and repeat exactly repeat times; hash the resulting bytes with SHA-256. LP uses u16BE UTF-8 byte lengths.',
      signer: {
        seed,
        publicKey: pub.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex'),
        source: 'RFC 8032 test 1; synthetic only',
      },
      vectors,
    },
    null,
    2,
  ) + '\n';
if (process.argv.includes('--check'))
  assert.equal(readFileSync(out, 'utf8'), data, 'Admission coverage vectors stale');
else writeFileSync(out, data);
console.log(
  'Four v2 implementation vectors agree with independent OpenSSL bytes; 92 field mutations refuse.',
);
