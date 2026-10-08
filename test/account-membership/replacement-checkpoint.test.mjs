import test from 'node:test';
import assert from 'node:assert/strict';
import { checkpointFixture } from './replacement-checkpoint-fixture.mjs';
import { hash, message, signed } from './fixtures.mjs';
import { key } from '../account-first-authority/oracle.mjs';
import { lp } from '../account-ceremony/oracle.mjs';
import {
  parseReplacementCheckpoint,
  replacementCheckpointHeads,
  replacementCheckpointMessage,
  replacementCheckpointHash,
  verifyReplacementCheckpoint,
  replacementCheckpointAdmissionBody,
  replacementCheckpointAdmissionMessage,
  verifyReplacementCheckpointAdmission,
  REPLACEMENT_HEAD_LIMIT,
} from '../../account-protocol/replacementCheckpoint.ts';

test('replacement checkpoint binds current admission and the full accepted cuts, including a removed publisher', async () => {
  for (const removeOriginal of [false, true]) {
    const f = await checkpointFixture(removeOriginal),
      c = f.checkpoint;
    assert.deepEqual(replacementCheckpointHeads(f.parent), c.heads);
    assert(c.heads.some((h) => h.credentialId === f.x.target && h.position === 2));
    assert.deepEqual(await verifyReplacementCheckpoint(c, f.parent), c);
    const { ct: _, signature: _signature, ...body } = c;
    assert.deepEqual(
      Buffer.from(await replacementCheckpointMessage(c)),
      message('done/replacement-checkpoint/v1', body),
    );
    assert.equal(await replacementCheckpointHash(c), hash(JSON.stringify(c)));
    await assert.rejects(verifyReplacementCheckpoint(c, { ...f.parent }), /Unverified/);
    await assert.rejects(verifyReplacementCheckpoint(c, f.rotated));
    const input = structuredClone(c),
      checking = verifyReplacementCheckpoint(input, f.parent);
    input.manifest.candidate = 'ff'.repeat(16);
    input.heads.pop();
    assert.deepEqual(await checking, c, 'async verification captures mutable input');
  }
});

test('producer signature cannot skip accepted removed writing or change admission coverage', async () => {
  const f = await checkpointFixture(),
    original = f.checkpoint;
  const mutations = [
    (c) => {
      c.heads = c.heads.filter((h) => h.credentialId !== f.x.target);
    },
    (c) => {
      c.heads[0].position++;
    },
    (c) => {
      c.heads[0].link = 'ff'.repeat(32);
    },
    (c) => {
      c.manifest.candidate = c.manifest.producer;
    },
    (c) => {
      c.manifest.producer = f.x.target;
    },
    (c) => {
      c.manifest.preparationId = Buffer.alloc(32, 33).toString('base64url');
    },
    (c) => {
      c.manifest.workspaceId = 'ff'.repeat(16);
    },
    (c) => {
      c.manifest.lineageId = 'ff'.repeat(32);
    },
    (c) => {
      c.manifest.epoch++;
    },
    (c) => {
      c.manifest.epochHead = 'ff'.repeat(32);
    },
    (c) => {
      c.manifest.generation++;
    },
    (c) => {
      c.ct = '54'.repeat(18);
    },
  ];
  for (const mutate of mutations) {
    const c = structuredClone(original);
    mutate(c);
    c.manifest.headVectorDigest = hash(
      lp(
        'done/headvec/v1',
        ...c.heads.flatMap((h) => [h.credentialId, String(h.position), h.link]),
      ),
    );
    await assert.rejects(verifyReplacementCheckpoint(f.sign(c), f.parent));
  }
  await assert.rejects(verifyReplacementCheckpoint(f.sign(original, f.x.f.keys.new), f.parent));
  for (const mutate of [
    (c) => {
      c.salt = 'ff'.repeat(16);
    },
    (c) => {
      c.nonce = 'ff'.repeat(12);
    },
    (c) => {
      c.manifest.sv = '0101';
    },
    (c) => {
      c.manifest.ds = '0101';
    },
  ]) {
    const c = structuredClone(original);
    mutate(c);
    await assert.rejects(verifyReplacementCheckpoint(c, f.parent));
  }
});

test('replacement parser rejects ambiguous prefixes and bounds before cryptographic verification', async () => {
  const { checkpoint } = await checkpointFixture();
  for (const mutate of [
    (c) => {
      c.extra = true;
    },
    (c) => {
      c.manifest.extra = true;
    },
    (c) => {
      c.heads[0].extra = true;
    },
    (c) => {
      c.heads.reverse();
    },
    (c) => {
      c.heads[1] = c.heads[0];
    },
    (c) => {
      c.heads = Array(REPLACEMENT_HEAD_LIMIT + 1).fill(c.heads[0]);
    },
    (c) => {
      c.heads[0].position = -1;
    },
    (c) => {
      c.heads[0].position = 0;
    },
    (c) => {
      c.heads[0].position = Number.MAX_SAFE_INTEGER;
    },
    (c) => {
      c.manifest.generation = 1;
    },
    (c) => {
      c.manifest.generation = 2 ** 32;
    },
    (c) => {
      c.ct += 'a';
    },
    (c) => {
      c.ct = 'zz'.repeat(18);
    },
  ]) {
    const c = structuredClone(checkpoint);
    mutate(c);
    assert.throws(() => parseReplacementCheckpoint(c));
  }
});

test('recipient acknowledgement authenticates the exact checkpoint and cannot be borrowed or signed by its producer', async () => {
  const f = await checkpointFixture(),
    c = f.checkpoint;
  const body = await replacementCheckpointAdmissionBody(c);
  const sign = (a, signer = key('27'.repeat(32))) => {
    const { signature: _, ...value } = a;
    return {
      ...a,
      signature: signed(signer, message('done/replacement-checkpoint-admission/v1', value)),
    };
  };
  const a = sign(body);
  assert.deepEqual(await verifyReplacementCheckpointAdmission(a, c, f.parent), a);
  const { signature: _, ...value } = a;
  assert.deepEqual(
    Buffer.from(await replacementCheckpointAdmissionMessage(a)),
    message('done/replacement-checkpoint-admission/v1', value),
  );
  for (const change of [
    { checkpointHash: 'ff'.repeat(32) },
    { candidate: c.manifest.producer },
    { parent: f.rotated.head },
  ])
    await assert.rejects(
      verifyReplacementCheckpointAdmission(sign({ ...a, ...change }), c, f.parent),
    );
  await assert.rejects(
    verifyReplacementCheckpointAdmission(sign(a, f.x.f.keys.existing), c, f.parent),
  );
  const different = f.sign({ ...c, nonce: '54'.repeat(12) });
  await assert.rejects(verifyReplacementCheckpointAdmission(a, different, f.parent));
});
