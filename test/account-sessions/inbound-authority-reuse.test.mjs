import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ready } from '../account-service-delivery/fixtures.mjs';
import { query, pageProof } from '../account-service-inbound/oracle.mjs';
import {
  snapshotWorkspaceAuthority,
  verifyCurrentWorkspaceAuthority,
} from '../../account-service/delivery.ts';
import { readInboundBatch } from '../../account-service/inboundBatch.ts';
import { encodeInboundBatch } from '../../account-protocol/inboundBatch.ts';
import {
  createInboundAuthorityReuse,
  reuseInboundAuthority,
  INBOUND_AUTHORITY_CONTEXT_BYTES,
} from '../../account-service/inboundAuthorityReuse.ts';

async function harness(t) {
  const x = await ready(t),
    db = new DatabaseSync(x.f.path);
  t.after(() => db.close());
  const native = x.authority.owner.readInbound(
    { readInbound: (_input, issuer) => issuer },
    new Uint8Array(),
  );
  const owner = createInboundAuthorityReuse();
  t.after(() => owner.close());
  let verified = 0,
    checked = 0;
  const issuer = {
    pin: native.pin,
    check: (...args) => {
      checked++;
      native.check(...args);
    },
  };
  const verify = async (...args) => {
    verified++;
    return verifyCurrentWorkspaceAuthority(...args);
  };
  return {
    x,
    db,
    native,
    owner,
    issuer,
    verify,
    capture: () => snapshotWorkspaceAuthority(db, x.workspace),
    run: (snapshot) => reuseInboundAuthority(owner, snapshot, issuer, verify),
    counts: () => ({ verified, checked }),
  };
}

test('unchanged native authority reuses cryptographic evidence but repeats custody checks and detaches results', async (t) => {
  const h = await harness(t),
    s = h.capture(),
    a = await h.run(s),
    head = a.a.head;
  a.a.head = 'ff'.repeat(32);
  a.request.candidate.workspaceId = 'ff'.repeat(16);
  const b = await h.run(h.capture());
  assert.equal(b.a.head, head);
  assert.equal(b.request.candidate.workspaceId, h.x.workspace);
  b.receipt.offer.head = 'ee'.repeat(32);
  assert.equal((await h.run(h.capture())).receipt.offer.head, s.promotion.successor_head ?? head);
  assert.deepEqual(h.counts(), { verified: 1, checked: 3 });
});

test('every changed native header, witness, artifact, pin or future field invalidates reuse', async (t) => {
  const h = await harness(t),
    s = h.capture(),
    authority = await h.run(s);
  const fields = [
    ['promotion', 'request'],
    ['promotion', 'offer'],
    ['promotion', 'result'],
    ['promotion', 'acceptance_seal'],
    ['promotion', 'activation'],
    ['promotion', 'successor_head'],
    ['promotion', 'delivery_witness'],
    ['account', 'id'],
    ['account', 'state'],
    ['credential', 'id'],
    ['credential', 'state'],
    ['recovery', 'draft'],
    ['recovery', 'result'],
    ['recovery', 'state'],
    ['attempt', 'mode'],
    ['attempt', 'result'],
    ['successor'],
    ['transfer'],
    ['continuations'],
    ['membershipTransfers'],
    ['membershipCancellations'],
    ['removalPreparation'],
    ['rotations'],
    ['recoveries'],
    ['publisherWitness'],
    ['futureAuthorityField'],
  ];
  let calls = 0;
  const verify = async (_s, issuer) => {
    calls++;
    issuer.check(authority.seal, s.promotion.request_digest, authority.a.acceptanceKey);
    return authority;
  };
  for (const path of fields) {
    const owner = createInboundAuthorityReuse();
    try {
      await reuseInboundAuthority(owner, s, h.issuer, verify);
      const changed = structuredClone(s);
      let at = changed;
      for (const key of path.slice(0, -1)) at = at[key];
      at[path.at(-1)] = { changed: true };
      const before = calls;
      await reuseInboundAuthority(owner, changed, h.issuer, verify);
      assert.equal(calls, before + 1, path.join('.'));
    } finally {
      owner.close();
    }
  }
  for (const field of ['v', 'serviceId', 'origin', 'rpId', 'authRoot', 'futurePinField']) {
    const owner = createInboundAuthorityReuse();
    try {
      await reuseInboundAuthority(owner, s, h.issuer, verify);
      const before = calls;
      await reuseInboundAuthority(
        owner,
        s,
        { ...h.issuer, pin: { ...h.issuer.pin, [field]: 'changed' } },
        verify,
      );
      assert.equal(calls, before + 1, field);
    } finally {
      owner.close();
    }
  }
});

test('decision rows are not authority inputs and do not replace independent ledger verification', async (t) => {
  const h = await harness(t),
    s = h.capture();
  await h.run({ ...s, rows: [{ position: 1, response: new Uint8Array([1]) }] });
  await h.run({ ...s, rows: [{ position: 2, response: new Uint8Array([2]) }] });
  assert.deepEqual(h.counts(), { verified: 1, checked: 2 });
});

test('unavailable, forged, closed and overlapping owners cannot lend verified authority', async (t) => {
  const h = await harness(t),
    s = h.capture();
  await assert.rejects(reuseInboundAuthority({ close() {} }, s, h.issuer, h.verify), /Inactive/);
  let release;
  const held = new Promise((r) => (release = r));
  const first = reuseInboundAuthority(h.owner, s, h.issuer, async (...args) => {
    await held;
    return h.verify(...args);
  });
  await assert.rejects(h.run(s), /overlapping/);
  release();
  await first;
  h.owner.close();
  await assert.rejects(h.run(s), /Inactive/);
  const next = createInboundAuthorityReuse();
  try {
    await reuseInboundAuthority(next, s, h.issuer, h.verify);
    assert.equal(h.counts().verified, 2);
  } finally {
    next.close();
  }
});

test('close during verification or a replayed custody check fences the returned authority', async (t) => {
  const h = await harness(t),
    s = h.capture();
  await assert.rejects(
    reuseInboundAuthority(h.owner, s, h.issuer, async (...args) => {
      const a = await h.verify(...args);
      h.owner.close();
      return a;
    }),
    /owner or input changed/,
  );
  const owner = createInboundAuthorityReuse();
  await reuseInboundAuthority(owner, s, h.issuer, h.verify);
  await assert.rejects(
    reuseInboundAuthority(
      owner,
      s,
      {
        ...h.issuer,
        check: (...args) => {
          h.issuer.check(...args);
          owner.close();
        },
      },
      h.verify,
    ),
    /owner or input changed/,
  );
});

test('failed custody checks and failed verification never leave a reusable result', async (t) => {
  const h = await harness(t),
    s = h.capture();
  await h.run(s);
  await assert.rejects(
    reuseInboundAuthority(
      h.owner,
      s,
      {
        ...h.issuer,
        check() {
          throw Error('closed custody');
        },
      },
      h.verify,
    ),
    /closed custody/,
  );
  await h.run(s);
  assert.equal(h.counts().verified, 2);
  const changed = { ...s, futureField: 1 };
  await assert.rejects(
    reuseInboundAuthority(h.owner, changed, h.issuer, async () => {
      throw Error('invalid proof');
    }),
    /invalid proof/,
  );
  await h.run(s);
  assert.equal(h.counts().verified, 3);
});

test('changed inputs during verification refuse and oversized contexts retain the reference path', async (t) => {
  const h = await harness(t),
    s = h.capture();
  await assert.rejects(
    reuseInboundAuthority(h.owner, s, h.issuer, async (...args) => {
      const a = await h.verify(...args);
      s.futureField = 'changed';
      return a;
    }),
    /input changed/,
  );
  delete s.futureField;
  const large = { ...s, futureField: 'x'.repeat(INBOUND_AUTHORITY_CONTEXT_BYTES) };
  await h.run(large);
  await h.run(large);
  assert.equal(h.counts().verified, 3);
});

test('real grouped reads reject a native authority change after their first successful page', async (t) => {
  const h = await harness(t);
  let reads = 0;
  const result = await readInboundBatch(
    encodeInboundBatch([query(h.x), query(h.x)]),
    async (q, reuse) => {
      const answer = await h.x.authority.owner.readInbound(h.x.f.core, q, undefined, reuse);
      if (++reads === 1) {
        pageProof(answer, q, h.x, []);
        h.db.prepare("UPDATE promotions SET offer='{}' WHERE workspace_id=?").run(h.x.workspace);
      }
      return answer;
    },
  );
  assert.equal(reads, 2);
  assert.equal(result.kind, 'unknown');
  assert.equal(result.bytes, undefined);
});

test('real grouped reads still reject corrupt served ledger bytes behind unchanged authority', async (t) => {
  const h = await harness(t),
    w = h.x.make(1);
  const accepted = await h.x.call(w);
  let reads = 0;
  const result = await readInboundBatch(
    encodeInboundBatch([query(h.x), query(h.x)]),
    async (q, reuse) => {
      const answer = await h.x.authority.owner.readInbound(h.x.f.core, q, undefined, reuse);
      if (++reads === 1) {
        pageProof(answer, q, h.x, [{ w, r: accepted }]);
        h.db.prepare('UPDATE delivery_decisions SET response=?').run(new Uint8Array([1]));
      }
      return answer;
    },
  );
  assert.equal(reads, 2);
  assert.equal(result.kind, 'unknown');
  assert.equal(result.bytes, undefined);
});

test('a batch lease is retired on success and refusal before it can be used again', async (t) => {
  const h = await harness(t),
    s = h.capture();
  for (const refused of [false, true]) {
    let retained;
    await readInboundBatch(encodeInboundBatch([new Uint8Array([1])]), async (_q, reuse) => {
      retained = reuse;
      await reuseInboundAuthority(reuse, s, h.issuer, h.verify);
      return refused
        ? { kind: 'unknown', reason: 'unavailable' }
        : { kind: 'decision', bytes: new Uint8Array([2]) };
    });
    await assert.rejects(reuseInboundAuthority(retained, s, h.issuer, h.verify), /Inactive/);
  }
});

test('a different verifier cannot consume a prior verifier result, and a changed hit input refuses', async (t) => {
  const h = await harness(t),
    s = h.capture();
  await h.run(s);
  let invoked = false;
  await assert.rejects(
    reuseInboundAuthority(h.owner, s, h.issuer, async () => {
      invoked = true;
      throw Error('different verification policy');
    }),
    /different verification policy/,
  );
  assert.equal(invoked, true);
  await h.run(s);
  await assert.rejects(
    reuseInboundAuthority(
      h.owner,
      s,
      {
        ...h.issuer,
        check: (...args) => {
          h.issuer.check(...args);
          s.futureInput = 'changed';
        },
      },
      h.verify,
    ),
    /input changed/,
  );
});

test('a future non-JSON header value cannot collide with a different verified context', async (t) => {
  const h = await harness(t),
    s = h.capture();
  await h.run({ ...s, futureField: new Map([['proof', 'first']]) });
  await h.run({ ...s, futureField: new Map([['proof', 'second']]) });
  assert.equal(h.counts().verified, 2);
});

test('unserializable future inputs use full verification without retaining evidence', async (t) => {
  const h = await harness(t),
    s = { ...h.capture(), futureField: () => {} };
  await h.run(s);
  await h.run(s);
  assert.equal(h.counts().verified, 2);
});
