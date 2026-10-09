import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import {
  fixture,
  published,
  message,
  unsigned,
  hash,
  signed,
  leafPaths,
  at,
  changed,
  replace,
} from './oracle.mjs';
import {
  parseSuccessorEpoch,
  parseSuccessor,
  successorMessage,
  successorHead,
  verifySuccessor,
  parseDiscoveryRequest,
  parseDiscoveryResponse,
  discoveryRequestMessage,
  discoveryRequestHash,
  discoveryResponseMessage,
  verifyDiscoveryRequest,
  verifyDiscoveryResponse,
} from '../../account-protocol/successor.ts';

test('published inputs and intermediates match independent encoding and signatures', async () => {
  const saved = JSON.parse(readFileSync('test/vectors/account-successor.json', 'utf8'));
  assert.deepEqual(saved, published());
  const f = fixture(),
    r = f.discover(),
    a = f.respond(r);
  assert.deepEqual(
    Buffer.from(await successorMessage(f.epoch)),
    message('done/admission-successor/v1', f.epoch),
  );
  assert.equal(await successorHead(f.epoch), f.successor.head);
  assert.deepEqual(
    Buffer.from(await discoveryRequestMessage(r)),
    message('done/authority-discovery-request/v1', unsigned(r)),
  );
  assert.deepEqual(
    Buffer.from(await discoveryResponseMessage(a)),
    message('done/authority-discovery-response/v1', unsigned(a)),
  );
  assert.equal(await discoveryRequestHash(r), hash(JSON.stringify(r)));
  assert.deepEqual(await verifySuccessor(f.successor, f.base, f.held), f.successor);
  assert.deepEqual(await verifyDiscoveryRequest(r, f.base, f.successor, 1000), r);
  assert.deepEqual(await verifyDiscoveryResponse(a, r, f.base, 1000), a);
});

test('every successor leaf is bound, including nested preparation/certification signatures', async () => {
  const f = fixture();
  for (const path of leafPaths(f.successor)) {
    const bad = replace(f.successor, path, changed(at(f.successor, path)));
    await assert.rejects(verifySuccessor(bad, f.base, f.held), undefined, path.join('.'));
  }
});

test('even a root-signed successor cannot change recipients, identity, rights or inherited key authority', async () => {
  const f = fixture();
  const changes = [
    (e) => {
      e.certified.value.members[0].wPub = '99'.repeat(32);
    },
    (e) => {
      e.certified.value.members[0].sPub = '99'.repeat(32);
    },
    (e) => {
      e.certified.value.signature = '99'.repeat(64);
    },
    (e) => {
      e.certified.value.recoveryStateDigest = '99'.repeat(32);
    },
    (e) => {
      e.certified.digest = '99'.repeat(32);
    },
    (e) => {
      e.acceptancePublicKey = '99'.repeat(32);
    },
    (e) => {
      e.parent = '99'.repeat(32);
    },
    (e) => {
      e.roster.find((m) => m.state === 'pending').state = 'certified';
    },
    (e) => {
      e.roster.find((m) => m.state === 'certified').capabilities = [];
    },
    (e) => {
      e.roster[0].principalId = '99'.repeat(16);
    },
    (e) => {
      e.heads.find((m) => m.credentialId === f.context.candidate.credentialId).position = 1;
      e.heads.find((m) => m.credentialId === f.context.candidate.credentialId).link = '99'.repeat(
        32,
      );
    },
    (e) => {
      e.preparation.context.passkeyId = Buffer.alloc(32, 90).toString('base64url');
    },
  ];
  for (const edit of changes) {
    const e = structuredClone(f.epoch);
    edit(e);
    await assert.rejects(verifySuccessor(f.seal(e), f.base, f.held));
  }
  // A forged parent certification cannot be laundered through a valid root wrapper either.
  const base = structuredClone(f.base);
  base.request.certification.signature = '00'.repeat(64);
  await assert.rejects(verifySuccessor(f.successor, base, f.held));
});

test('closed parsers enforce finite namespaces, versions, stream coverage/order and canonical zeros', async () => {
  const f = fixture();
  for (const edit of [
    (e) => {
      e.heads = [];
    },
    (e) => {
      e.heads.push(e.heads[0]);
    },
    (e) => {
      e.heads[1] = e.heads[0];
    },
    (e) => {
      e.heads.reverse();
    },
    (e) => {
      e.roster.reverse();
    },
    (e) => {
      e.roster[1] = e.roster[0];
    },
    (e) => {
      e.epoch = 3;
    },
    (e) => {
      e.generation = 2;
    },
    (e) => {
      e.certified.nextEpoch = 2;
    },
    (e) => {
      e.heads[0].position = -1;
    },
    (e) => {
      e.heads[0].position = 1.5;
    },
    (e) => {
      e.heads[0].position = Number.MAX_SAFE_INTEGER + 1;
    },
    (e) => {
      e.heads[0].link = '99'.repeat(32);
    },
    (e) => {
      e.roster[0].id = 'AA'.repeat(16);
    },
    (e) => {
      e.certified.value.extra = 1;
    },
    (e) => {
      e.extra = 1;
    },
  ]) {
    const e = structuredClone(f.epoch);
    edit(e);
    assert.throws(() => parseSuccessorEpoch(e));
  }
  const wrongCoverage = structuredClone(f.epoch);
  wrongCoverage.heads[0].credentialId = '00'.repeat(16);
  await assert.rejects(verifySuccessor(f.seal(wrongCoverage), f.base, f.held));
  for (const [parse, value] of [
    [parseSuccessor, f.successor],
    [parseDiscoveryRequest, f.discover()],
    [parseDiscoveryResponse, f.respond(f.discover())],
  ]) {
    assert.throws(() => parse({ ...value, extra: 'x'.repeat(40000) }));
    assert.throws(() => parse({ ...value, v: 2 }));
    assert.throws(() => parse({ ...value, kind: 'promotion-offer' }));
  }
});

test('discovery is nonce-bound creating-device proof; pending devices and replayed/expired responses refuse', async () => {
  const f = fixture(),
    r = f.discover(),
    a = f.respond(r);
  await verifyDiscoveryRequest(r, f.base, null, 1000);
  await verifyDiscoveryResponse(f.respond(r, null), r, f.base, 1000);
  const bad = { ...r, credentialId: f.context.candidate.credentialId };
  bad.signature = signed(f.nextKey, message('done/authority-discovery-request/v1', unsigned(bad)));
  await assert.rejects(verifyDiscoveryRequest(bad, f.base, f.successor, 1000));
  for (const now of [61000, 0, -1, NaN])
    await assert.rejects(verifyDiscoveryResponse(a, r, f.base, now));
  await assert.rejects(
    verifyDiscoveryResponse(a, f.discover(f.held, '99'.repeat(32)), f.base, 1000),
  );
  for (const path of leafPaths(r)) {
    const bad = replace(r, path, changed(at(r, path)));
    await assert.rejects(
      verifyDiscoveryRequest(bad, f.base, f.successor, 1000),
      undefined,
      path.join('.'),
    );
  }
  for (const field of ['requestHash', 'signature'])
    await assert.rejects(
      verifyDiscoveryResponse({ ...a, [field]: changed(a[field]) }, r, f.base, 1000),
    );
  await assert.rejects(
    verifyDiscoveryResponse(
      {
        ...a,
        signature: signed(
          f.keys.device,
          message('done/authority-discovery-response/v1', unsigned(a)),
        ),
      },
      r,
      f.base,
      1000,
    ),
  );
});

test('retained epoch two rejects a signed fork or signed genesis answer', async () => {
  const f = fixture(),
    held = { epoch: 2, head: f.successor.head },
    r = f.discover(held);
  await verifySuccessor(f.successor, f.base, held);
  await verifyDiscoveryResponse(f.respond(r), r, f.base, 1000);
  await assert.rejects(verifyDiscoveryResponse(f.respond(r, null), r, f.base, 1000));
  const sibling = fixture(1, 'aa'.repeat(32));
  await assert.rejects(verifySuccessor(sibling.successor, f.base, held));
  await assert.rejects(verifyDiscoveryResponse(f.respond(r, sibling.successor), r, f.base, 1000));
  await assert.rejects(verifyDiscoveryRequest(r, f.base, null, 1000));
});

test('inputs are captured before crypto and verified outputs cannot be mutated', async () => {
  const f = fixture(),
    s = structuredClone(f.successor),
    b = structuredClone(f.base),
    held = { ...f.held };
  const promise = verifySuccessor(s, b, held);
  s.epoch.certified.value.members[0].wPub = '00'.repeat(32);
  b.pin.authRoot = '00'.repeat(32);
  held.head = '00'.repeat(32);
  const verified = await promise;
  assert.deepEqual(verified, f.successor);
  assert.throws(() => {
    verified.epoch.roster[0].sPub = '00'.repeat(32);
  });
  const request = f.discover(),
    answer = f.respond(request);
  const p = verifyDiscoveryResponse(answer, request, f.base, 1000);
  request.nonce = '00'.repeat(32);
  answer.successor = null;
  assert.deepEqual(await p, f.respond(f.discover()));
});

test('100 generated stream anchors and recursive key orderings preserve continuity but reject forks', async () => {
  const reorder = (x, salt) =>
    Array.isArray(x)
      ? x.map((v) => reorder(v, salt))
      : x && typeof x === 'object'
        ? Object.fromEntries(
            Object.entries(x)
              .sort(([a], [b]) => hash(salt + a).localeCompare(hash(salt + b)))
              .map(([k, v]) => [k, reorder(v, salt)]),
          )
        : x;
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: 100000 }),
      fc.uint8Array({ minLength: 32, maxLength: 32 }),
      fc.integer(),
      async (position, raw, salt) => {
        const link = position ? Buffer.from(raw).toString('hex') : '00'.repeat(32);
        fc.pre(!position || link !== '00'.repeat(32));
        const f = fixture(position, link);
        assert.deepEqual(
          await verifySuccessor(
            reorder(f.successor, String(salt)),
            reorder(f.base, String(salt)),
            f.held,
          ),
          f.successor,
        );
        const fork = fixture(position + 1, hash(link));
        await assert.rejects(
          verifySuccessor(fork.successor, f.base, { epoch: 2, head: f.successor.head }),
        );
      },
    ),
    { seed: 16091601, numRuns: 100 },
  );
});
