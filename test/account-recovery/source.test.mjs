import test from 'node:test';
import assert from 'node:assert/strict';
import { client, sourceFixture as ready } from './source-fixtures.mjs';
const { Y } = client;
test('the saved code cold-opens the original admitted snapshot plus accepted edits and returns an exact replay cut', async (t) => {
  const x = await ready(t),
    expected = new Y.Doc({ gc: false });
  Y.applyUpdate(expected, Y.encodeStateAsUpdate(x.root));
  const before = Y.encodeStateVector(expected);
  expected.getText('master').insert(expected.getText('master').length, 'saved remotely\n');
  await x.append(1, [Y.encodeStateAsUpdate(expected, before)]);
  x.f.restart();
  x.authority.restart();
  const result = await client.readRecoverySource(x.input),
    reopened = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(reopened, result.snapshot);
    assert(client.sameDocState(reopened, expected));
    assert.equal(result.head, x.offer.head);
    assert.equal(result.generation, 1);
    assert.equal(result.heads[0].position, 1);
    assert.equal(x.f.rows('promotions')[0].successor_head, null);
  } finally {
    result.snapshot.fill(0);
    reopened.destroy();
    expected.destroy();
  }
});

test('cold replay rejects a wrong saved code and unresolved Yjs dependencies before returning writing', async (t) => {
  const x = await ready(t);
  await assert.rejects(client.readRecoverySource({ ...x.input, code: '0'.repeat(25) }));
  const remote = new Y.Doc({ gc: false });
  remote.clientID = 903;
  remote.getText('master').insert(0, 'missing base');
  const before = Y.encodeStateVector(remote);
  remote.getText('master').insert(remote.getText('master').length, 'dependent edit');
  await x.append(1, [Y.encodeStateAsUpdate(remote, before)]);
  remote.destroy();
  await assert.rejects(client.readRecoverySource(x.input), /unresolved dependencies/);
});

test('cancellation during a read cannot return decrypted writing; corrupted pages are never applied', async (t) => {
  const x = await ready(t);
  let cancelled = false;
  await assert.rejects(
    client.readRecoverySource({
      ...x.input,
      assertCurrent: () => {
        if (cancelled) throw Error('locked');
      },
      read: async (request) => {
        const page = await x.reader.read(request);
        cancelled = true;
        return page;
      },
    }),
    /locked/,
  );
  await assert.rejects(
    client.readRecoverySource({
      ...x.input,
      read: async (request) => {
        const page = await x.reader.read(request);
        page.link = 'ff'.repeat(32);
        return page;
      },
    }),
  );
});

test('empty first-device history works without a certification checkpoint or another device', async (t) => {
  const x = await ready(t),
    result = await client.readRecoverySource(x.input),
    doc = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(doc, result.snapshot);
    assert(client.sameDocState(doc, x.root));
    assert.deepEqual(result.heads, [
      { credentialId: x.credential, position: 0, link: '00'.repeat(32) },
    ]);
  } finally {
    result.snapshot.fill(0);
    doc.destroy();
  }
});
