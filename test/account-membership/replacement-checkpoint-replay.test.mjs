import test from 'node:test';
import assert from 'node:assert/strict';
import { client } from './replacement-checkpoint-client.mjs';
import { checkpointFixture } from './replacement-checkpoint-fixture.mjs';
import { signed } from './fixtures.mjs';
async function fixture() {
  const f = await checkpointFixture();
  const { history } = await client.verifyMembershipChain(
    { ...f.x.proofs, continuations: [f.rotation, f.admission] },
    f.x.f.f.base,
  );
  const parent = client.historyMembership(history),
    accepted = new client.Y.Doc({ gc: false });
  accepted.getMap('meta').set('schemaVersion', 4);
  accepted
    .getMap('meta')
    .set('actor:' + f.x.p.principalId, { kind: 'human', name: 'Writer', color: 'blue' });
  accepted.getText('master').insert(0, 'accepted writing from removed publisher');
  const local = new client.Y.Doc({ gc: false });
  client.Y.applyUpdate(local, client.Y.encodeStateAsUpdate(accepted));
  const key = new Uint8Array(32).fill(42),
    producer = f.checkpoint.manifest.producer,
    candidate = f.checkpoint.manifest.candidate;
  const create = () =>
    client.createReplacementCheckpoint(
      accepted,
      local,
      key,
      parent,
      producer,
      candidate,
      async (bytes) => signed(f.x.f.keys.existing, bytes),
    );
  return {
    ...f,
    parent,
    accepted,
    local,
    key,
    create,
    cleanup() {
      accepted.destroy();
      local.destroy();
      key.fill(0);
    },
  };
}

test('current-key replacement cold replay preserves accepted writing, local journal edits and deletions', async () => {
  const f = await fixture();
  try {
    f.local.getText('master').delete(0, 9);
    f.local.getText('master').insert(f.local.getText('master').length, '\nlocal journal edit');
    f.accepted
      .getText('master')
      .insert(f.accepted.getText('master').length, '\nnewly fetched accepted writing');
    const expected = new client.Y.Doc({ gc: false });
    client.Y.applyUpdate(expected, client.Y.encodeStateAsUpdate(f.accepted));
    client.Y.applyUpdate(expected, client.Y.encodeStateAsUpdate(f.local));
    try {
      const first = await f.create(),
        second = await f.create();
      assert.notEqual(first.salt, second.salt);
      assert.notEqual(first.nonce, second.nonce);
      assert.deepEqual(
        first.heads,
        f.checkpoint.heads,
        'local additions do not advance accepted cuts',
      );
      const opened = await client.openReplacementCheckpoint(
        JSON.parse(JSON.stringify(first)),
        f.key,
        f.parent,
      );
      try {
        assert(client.sameDocState(opened, expected));
      } finally {
        opened.destroy();
      }
      await assert.rejects(
        client.openReplacementCheckpoint(first, new Uint8Array(32).fill(41), f.parent),
        /operation|decrypt/i,
      );
      assert(
        f.key.every((b) => b === 42),
        'borrowed key is not erased',
      );
    } finally {
      expected.destroy();
    }
  } finally {
    f.cleanup();
  }
});

test('snapshot captures source documents and key before asynchronous signing', async () => {
  const f = await fixture();
  try {
    const pending = f.create();
    f.local.getText('master').insert(0, 'later local edit ');
    f.accepted.getText('master').insert(0, 'later received edit ');
    f.key.fill(43);
    const c = await pending,
      opened = await client.openReplacementCheckpoint(c, new Uint8Array(32).fill(42), f.parent);
    try {
      assert.equal(opened.getText('master').toString(), 'accepted writing from removed publisher');
    } finally {
      opened.destroy();
    }
  } finally {
    f.cleanup();
  }
});

test('signed wrong coverage and altered ciphertext context cannot pass semantic replay', async () => {
  const f = await fixture();
  try {
    const c = await f.create();
    for (const mutate of [
      (copy) => {
        copy.manifest.sv = '00';
      },
      (copy) => {
        copy.manifest.ds = '0101010101';
      },
      (copy) => {
        copy.salt = 'ff'.repeat(16);
      },
      (copy) => {
        copy.nonce = 'ff'.repeat(12);
      },
    ]) {
      const copy = structuredClone(c);
      mutate(copy);
      await assert.rejects(client.openReplacementCheckpoint(f.sign(copy), f.key, f.parent));
    }
  } finally {
    f.cleanup();
  }
});

test('construction refuses incomplete accepted replay and unresolved local dependencies before signing', async () => {
  const f = await fixture(),
    remote = new client.Y.Doc({ gc: false }),
    pending = new client.Y.Doc({ gc: false });
  try {
    remote.getText('master').insert(0, 'missing remote dependency');
    const before = client.Y.encodeStateVector(remote);
    remote.getText('master').insert(remote.getText('master').length, ' dependent edit');
    client.Y.applyUpdate(pending, client.Y.encodeStateAsUpdate(remote, before));
    assert(client.hasPendingUpdates(pending));
    let signs = 0;
    const create = (accepted, local) =>
      client.createReplacementCheckpoint(
        accepted,
        local,
        f.key,
        f.parent,
        f.checkpoint.manifest.producer,
        f.checkpoint.manifest.candidate,
        async () => {
          signs++;
          throw Error('Must not sign');
        },
      );
    await assert.rejects(create(pending, f.local), /dependencies/);
    await assert.rejects(create(f.accepted, pending), /dependencies/);
    assert.equal(signs, 0);
    f.local.getMap('meta').set('actor:unrelated', { kind: 'human', name: 'Wrong', color: 'blue' });
    await assert.rejects(f.create(), /actor/);
  } finally {
    remote.destroy();
    pending.destroy();
    f.cleanup();
  }
});
