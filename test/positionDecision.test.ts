// @vitest-environment node
import { it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';
import {
  acceptanceLink,
  refusalMessage,
  refusalId,
  headMessage,
  encodePositionResponse,
  decodePositionResponse,
  verifyPositionResponse,
  ZERO_REFUSAL,
  RESPONSE_LIMIT,
  type PositionSubject,
  type DecisionAuthority,
  type Refusal,
  type PositionResponse,
} from '../account-protocol/positionDecision';
import {
  encodeSubmission,
  decodeSubmission,
  signSubmission,
  verifySubmission,
  SUBMISSION_LIMIT,
} from '../account-protocol/submission';
import { decodeNetworkEnvelope } from '../account-protocol/envelope';
import { hex, unhex } from '../account-protocol/recovery';
// @ts-expect-error Independent JavaScript/OpenSSL oracle deliberately does not import the implementation.
import * as oracle from './account-decisions/oracle.mjs';
const old = JSON.parse(readFileSync('test/vectors/antireplay.json', 'utf8')),
  finals = JSON.parse(readFileSync('test/vectors/finalization.json', 'utf8')),
  vectors = JSON.parse(readFileSync('test/vectors/private-envelope.json', 'utf8'));
const current = oracle.key(old.keys.k_accept.seed),
  retired = oracle.key(old.keys.k_accept_retired.seed);
const authority: DecisionAuthority = {
  workspace: 'workspace',
  lineage: '11'.repeat(32),
  tip: 9,
  head: '22'.repeat(32),
  acceptanceKey: old.keys.k_accept.public_key,
};
const own: PositionSubject = {
  workspace: 'workspace',
  credential: 'credential',
  position: 1,
  epoch: 8,
  digest: '33'.repeat(32),
};
const expected = { ...own, previous: ZERO_REFUSAL, parent: ZERO_REFUSAL };
const answer = (subject = own, signer = current, parent = ZERO_REFUSAL): PositionResponse => ({
  kind: 'refused',
  refusal: oracle.refusal(subject, signer, parent),
});
const verify = (r: PositionResponse) =>
  verifyPositionResponse(encodePositionResponse(r), expected, authority);
it('reads the selected refusal and link/head messages without changing their signed bytes', async () => {
  const f = old.refusal.refusal,
    r: Refusal = {
      workspace: f.workspace,
      credential: f.credential,
      position: f.position,
      digest: f.digest,
      epoch: f.epoch,
      reason: f.reason,
      parent: f.parent,
      signature: old.refusal.signature,
    };
  expect(hex(refusalMessage(r))).toBe(oracle.refusalMessage(r).toString('hex'));
  expect(oracle.signBytes(refusalMessage(r), current)).toBe(r.signature);
  expect(await refusalId(r)).toBe(oracle.hash(oracle.refusalMessage(r)));
  expect(
    (
      await verifyPositionResponse(
        encodePositionResponse({ kind: 'refused', refusal: r }),
        { ...r, previous: ZERO_REFUSAL },
        { ...authority, workspace: r.workspace },
      )
    ).kind,
  ).toBe('refused');
  for (const v of finals.vectors) {
    const i = v.inputs;
    if (!i?.digest || !i?.prev) continue;
    expect(
      await acceptanceLink(
        {
          workspace: i.workspace_id,
          credential: i.credential_id,
          position: i.seq,
          epoch: i.epoch,
          digest: i.digest,
        },
        i.prev,
      ),
    ).toBe(v.expected.link);
  }
  const h = oracle.head(own, ZERO_REFUSAL, 9, current, true);
  expect(hex(headMessage(h))).toBe(oracle.headMessage(h).toString('hex'));
});
it('binds all five refusal subject fields, parent and the current externally held acceptance key', async () => {
  expect((await verify(answer())).kind).toBe('refused');
  for (const field of ['workspace', 'credential', 'position', 'digest', 'epoch'] as const) {
    const altered = {
      ...own,
      [field]:
        field === 'position'
          ? 2
          : field === 'epoch'
            ? 7
            : field === 'digest'
              ? '44'.repeat(32)
              : 'other',
    };
    expect((await verify(answer(altered))).kind).toBe('unknown');
  }
  expect((await verify(answer(own, retired))).kind).toBe('unknown');
  expect((await verify(answer({ ...own, epoch: 7 }, retired))).kind).toBe('unknown');
  expect((await verify(answer(own, current, '44'.repeat(32)))).kind).toBe('unknown');
  expect(
    (
      await verifyPositionResponse(encodePositionResponse(answer()), expected, {
        ...authority,
        acceptanceKey: old.keys.k_accept_retired.public_key,
      })
    ).kind,
  ).toBe('unknown');
});
it('authenticates a reconstructed link, distinguishes a proved conflicting leaf, and holds unanchored heads', async () => {
  const h = oracle.head(own, ZERO_REFUSAL, 9, current);
  expect(
    await verify({ kind: 'accepted', head: h, leaf: { epoch: own.epoch, digest: own.digest } }),
  ).toMatchObject({ kind: 'accepted' });
  const other = { ...own, digest: '44'.repeat(32) };
  expect(
    await verify({
      kind: 'accepted',
      head: oracle.head(other, ZERO_REFUSAL, 9, current),
      leaf: { epoch: other.epoch, digest: other.digest },
    }),
  ).toMatchObject({ kind: 'conflict' });
  for (const r of [
    {
      kind: 'accepted' as const,
      head: oracle.head(own, '55'.repeat(32), 9, current),
      leaf: { epoch: own.epoch, digest: own.digest },
    },
    {
      kind: 'accepted' as const,
      head: oracle.head({ ...own, position: 2 }, ZERO_REFUSAL, 9, current),
      leaf: { epoch: own.epoch, digest: own.digest },
    },
    {
      kind: 'accepted' as const,
      head: oracle.head(own, ZERO_REFUSAL, 8, current),
      leaf: { epoch: own.epoch, digest: own.digest },
    },
    {
      kind: 'accepted' as const,
      head: { ...h, final: true },
      leaf: { epoch: own.epoch, digest: own.digest },
    },
    { kind: 'accepted' as const, head: h, leaf: { epoch: 7, digest: own.digest } },
  ])
    expect((await verify(r)).kind).toBe('unknown');
});
it('keeps refusal IDs stable across acceptance-key rotation while requiring the current signature', async () => {
  const a = oracle.refusal(own, retired),
    b = oracle.refusal(own, current);
  expect(a.signature).not.toBe(b.signature);
  expect(await refusalId(a)).toBe(await refusalId(b));
  expect((await verify({ kind: 'refused', refusal: a })).kind).toBe('unknown');
  expect((await verify({ kind: 'refused', refusal: b })).kind).toBe('refused');
});
it('rejects unknown, noncanonical, oversized, unsigned and malformed response bytes', async () => {
  const bytes = encodePositionResponse(answer()),
    v = JSON.parse(new TextDecoder().decode(bytes)),
    enc = (x: unknown) => new TextEncoder().encode(JSON.stringify(x));
  const cases = [
    new Uint8Array(),
    new Uint8Array(RESPONSE_LIMIT + 1),
    new Uint8Array([255]),
    enc([...v, 'key']),
    enc({ ...v }),
    new TextEncoder().encode(' ' + new TextDecoder().decode(bytes)),
    enc(v.map((x: unknown, i: number) => (i === 1 ? 2 : x))),
    enc(v.map((x: unknown, i: number) => (i === 5 ? '01' : x))),
    enc(v.map((x: unknown, i: number) => (i === 5 ? Number.MAX_SAFE_INTEGER + 1 : x))),
    enc(v.map((x: unknown, i: number) => (i === 10 ? '00' : x))),
    enc(v.map((x: unknown, i: number) => (i === 8 ? '' : x))),
  ];
  for (const b of cases) {
    expect(() => decodePositionResponse(b)).toThrow();
    expect((await verifyPositionResponse(b, expected, authority)).kind).toBe('unknown');
  }
});
it('200 generated signed chain histories distinguish exact evidence, conflicting leaves and foreign prefixes', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.record({
          epoch: fc.integer({ min: 1, max: 9 }),
          digest: fc.uint8Array({ minLength: 32, maxLength: 32 }),
        }),
        { minLength: 1, maxLength: 8 },
      ),
      async (history) => {
        let previous = ZERO_REFUSAL;
        for (const [i, leaf] of history.entries()) {
          const s = { ...own, position: i + 1, epoch: leaf.epoch, digest: hex(leaf.digest) },
            e = { ...s, parent: ZERO_REFUSAL, previous };
          const good = {
            kind: 'accepted' as const,
            head: oracle.head(s, previous, 9, current),
            leaf: { epoch: s.epoch, digest: s.digest },
          };
          expect((await verifyPositionResponse(oracle.response(good), e, authority)).kind).toBe(
            'accepted',
          );
          expect(await acceptanceLink(s, previous)).toBe(good.head.link);
          const bad = { ...good, head: oracle.head(s, 'fe'.repeat(32), 9, current) };
          expect((await verifyPositionResponse(oracle.response(bad), e, authority)).kind).toBe(
            'unknown',
          );
          const changed = {
            ...s,
            digest: s.digest === 'ff'.repeat(32) ? '00'.repeat(32) : 'ff'.repeat(32),
          };
          expect(
            (
              await verifyPositionResponse(
                oracle.response({
                  kind: 'accepted',
                  head: oracle.head(changed, previous, 9, current),
                  leaf: changed,
                }),
                e,
                authority,
              )
            ).kind,
          ).toBe('conflict');
          expect(
            (
              await verifyPositionResponse(
                oracle.response({
                  kind: 'refused',
                  refusal: oracle.refusal({ ...s, epoch: s.epoch === 1 ? 2 : 1 }, current),
                }),
                e,
                authority,
              )
            ).kind,
          ).toBe('unknown');
          previous = good.head.link;
        }
      },
    ),
    { seed: 9612026, numRuns: 200 },
  );
});
const vector = vectors.vectors[0],
  rawWire = unhex(vector.expected.wire, vector.expected.wire.length / 2),
  env = decodeNetworkEnvelope(rawWire);
const route = {
  v: 2 as const,
  workspace_id: env.workspace_id,
  credential_id: env.credential_id,
  epoch: env.epoch,
  gen: env.gen,
};
const subject = {
  workspace: env.workspace_id,
  credential: env.credential_id,
  position: env.seq,
  digest: hex(env.digest),
  epoch: env.epoch,
};
const domain = { ...authority, workspace: env.workspace_id, tip: env.epoch };
const device = await crypto.subtle.importKey(
  'pkcs8',
  Buffer.from('302e020100300506032b657004220420' + vectors.keys.device.seed, 'hex'),
  'Ed25519',
  false,
  ['sign'],
);
const pub = await crypto.subtle.importKey(
  'raw',
  unhex(vectors.keys.device.public_key, 32),
  'Ed25519',
  false,
  ['verify'],
);
const make = async (parent: Refusal | null) =>
  signSubmission({ lineage: domain.lineage, envelope: rawWire, parent }, device);
it('signs a separate submission wrapper over exact v2 bytes and parent refusal ID', async () => {
  const parent = oracle.refusal(
    { ...subject, epoch: Math.max(1, env.epoch - 1), digest: 'ab'.repeat(32) },
    current,
  );
  for (const p of [null, parent]) {
    const bytes = await make(p),
      s = decodeSubmission(bytes),
      opened = await verifySubmission(bytes, route, pub, domain);
    expect(hex(s.envelope)).toBe(hex(rawWire));
    expect(opened.parentId).toBe(p ? await refusalId(p) : ZERO_REFUSAL);
    expect(hex(s.signature)).toBe(
      sign(
        null,
        oracle.submissionMessage(domain.lineage, rawWire, p),
        createPrivateKey({
          key: Buffer.from('302e020100300506032b657004220420' + vectors.keys.device.seed, 'hex'),
          format: 'der',
          type: 'pkcs8',
        }),
      ).toString('hex'),
    );
  }
});
it('rejects swapping a valid parent proof, changing exact wire, skipping positions and stale proof keys', async () => {
  const parent = oracle.refusal({ ...subject, digest: 'ab'.repeat(32) }, current),
    s = decodeSubmission(await make(parent));
  const different = oracle.refusal(
    { ...subject, digest: 'ab'.repeat(32) },
    current,
    ZERO_REFUSAL,
    'retired-generation',
  );
  await expect(
    verifySubmission(encodeSubmission({ ...s, parent: different }), route, pub, domain),
  ).rejects.toThrow(/signature/);
  const changed = s.envelope.slice();
  changed[changed.length - 1]! ^= 1;
  await expect(
    verifySubmission(encodeSubmission({ ...s, envelope: changed }), route, pub, domain),
  ).rejects.toThrow(/signature/);
  for (const p of [
    oracle.refusal(
      { ...subject, position: subject.position + 1, digest: 'ab'.repeat(32) },
      current,
    ),
    oracle.refusal({ ...subject, digest: 'ab'.repeat(32) }, retired),
    oracle.refusal(subject, current),
  ])
    await expect(verifySubmission(await make(p), route, pub, domain)).rejects.toThrow();
  await expect(
    verifySubmission(await make(parent), route, pub, { ...domain, tip: domain.tip + 1 }),
  ).rejects.toThrow(/Successor/);
  await expect(
    verifySubmission(await make(null), route, pub, { ...domain, lineage: 'ab'.repeat(32) }),
  ).rejects.toThrow(/lineage/);
});
it('100 generated successor proofs bind parent bytes, original position and independent signing inputs', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uint8Array({ minLength: 32, maxLength: 32 }),
      fc.integer({ min: 1, max: 100 }),
      async (digest, offset) => {
        const p = oracle.refusal(
          { ...subject, digest: hex(digest) === subject.digest ? 'ab'.repeat(32) : hex(digest) },
          current,
        );
        const wire = await make(p);
        expect((await verifySubmission(wire, route, pub, domain)).parentId).toBe(
          oracle.hash(oracle.refusalMessage(p)),
        );
        const wrong = oracle.refusal({ ...p, position: p.position + offset }, current);
        await expect(verifySubmission(await make(wrong), route, pub, domain)).rejects.toThrow(
          /subject/,
        );
        const altered = decodeSubmission(wire);
        altered.lineage = 'ff'.repeat(32);
        await expect(
          verifySubmission(encodeSubmission(altered), route, pub, {
            ...domain,
            lineage: altered.lineage,
          }),
        ).rejects.toThrow(/signature/);
      },
    ),
    { seed: 9612027, numRuns: 100 },
  );
});
it('captures response, expected subject and authority before asynchronous verification', async () => {
  const bytes = encodePositionResponse(answer()),
    e = { ...expected },
    a = { ...authority };
  const result = verifyPositionResponse(bytes, e, a);
  bytes.fill(0);
  e.epoch = 1;
  a.acceptanceKey = old.keys.k_accept_retired.public_key;
  expect((await result).kind).toBe('refused');
});
it('captures submission inputs and rejects malformed/trailing/oversized framing', async () => {
  const input = { lineage: domain.lineage, envelope: rawWire.slice(), parent: null };
  const promise = signSubmission(input, device);
  input.envelope.fill(0);
  input.lineage = 'ff'.repeat(32);
  const wire = await promise;
  expect((await verifySubmission(wire, route, pub, domain)).lineage).toBe(domain.lineage);
  for (const bad of [
    wire.slice(0, -1),
    new Uint8Array([...wire, 0]),
    new Uint8Array(SUBMISSION_LIMIT + 1),
    wire.slice(1),
  ])
    expect(() => decodeSubmission(bad)).toThrow();
});

it('re-signing the same permanent parent under the current key preserves wrapper verification', async () => {
  const closed = { ...subject, digest: 'ab'.repeat(32) };
  const stale = oracle.refusal(closed, retired),
    live = oracle.refusal(closed, current);
  const s = decodeSubmission(await make(stale));
  await expect(verifySubmission(encodeSubmission(s), route, pub, domain)).rejects.toThrow(
    /signature/,
  );
  s.parent = live;
  const opened = await verifySubmission(encodeSubmission(s), route, pub, domain);
  expect(opened.parentId).toBe(await refusalId(stale));
});
