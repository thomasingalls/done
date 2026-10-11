import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mutate } from '../account-successor/service-fixtures.mjs';
import { setup } from './service-fixture.mjs';
import { client as c } from './client.mjs';
import { AuthorizationRefused } from '../../account-service/authorization.ts';
import { AccountCore } from '../../account-service/core.ts';
import { DatabaseSync } from 'node:sqlite';
const zero = '00'.repeat(32);
test('repeatable service checkpoints retain a previous snapshot and an untrimmed accepted suffix', async (t) => {
  const f = await setup(t),
    head = await f.upload(1, 'first');
  const first = await f.create(null, [head]);
  const publish = await f.makeRequest('publish', first);
  await f.check(publish, await f.exchange(publish));
  // Writing can continue after capture; a verified prefix is sufficient, not equality to the latest head.
  const secondHead = await f.upload(2, 'later');
  const admit = await f.makeRequest('admit', await f.admit(first));
  let page = await f.check(admit, await f.exchange(admit));
  assert.equal(page.catalog.sequence, 1);
  assert.deepEqual(page.heads, [secondHead]);
  const second = await f.create(first, [secondHead]);
  const p2 = await f.makeRequest('publish', second);
  await f.check(p2, await f.exchange(p2));
  const a2 = await f.makeRequest('admit', await f.admit(second));
  await f.check(a2, await f.exchange(a2));
  f.f.restart();
  f.authority.restart();
  const previous = await f.makeRequest('read', 'previous');
  page = await f.check(previous, await f.exchange(previous));
  assert.deepEqual(page.checkpoint, first);
  assert.equal(page.catalog.sequence, 2);
  assert.equal(
    f.f.rows('delivery_decisions').length,
    2,
    'no ciphertext or acceptance evidence is pruned',
  );
  assert.equal(f.f.rows('history_checkpoint_records').length, 2);
  // An exact historical admission retry is distinct from advancing the current pointer again.
  const retry = await f.makeRequest('admit', admit.payload);
  page = await f.check(retry, await f.exchange(retry));
  assert.equal(page.catalog.sequence, 2);
  assert.deepEqual(page.checkpoint, first);
});
for (const action of ['publish', 'admit'])
  for (const boundary of ['before-commit', 'after-commit'])
    test(`${action} resumes exact bytes after ${boundary} interruption and restart`, async (t) => {
      let armed = false;
      const f = await setup(t, (point, op) => {
        if (armed && op === 'history-checkpoint' && point === boundary) {
          armed = false;
          throw Error('Interrupted checkpoint');
        }
      });
      const cp = await f.create();
      const pub = await f.makeRequest('publish', cp);
      if (action === 'admit') await f.check(pub, await f.exchange(pub));
      const request = action === 'publish' ? pub : await f.makeRequest('admit', await f.admit(cp));
      armed = true;
      assert.equal((await f.exchange(request)).ok, false);
      f.f.restart();
      f.authority.restart();
      await f.check(request, await f.exchange(request));
      assert.equal(f.f.rows('history_checkpoint_records').length, 1);
      assert.equal(JSON.parse(f.f.rows('history_checkpoint_records')[0].checkpoint).salt, cp.salt);
      assert.equal(
        f.f.rows('history_checkpoint_records')[0].admission !== null,
        action === 'admit',
      );
    });
test('false accepted cuts and catalog/record tampering refuse without becoming a baseline', async (t) => {
  const f = await setup(t),
    head = await f.upload(1, 'accepted');
  const falseCut = { ...head, link: 'ff'.repeat(32) };
  const wrong = await f.create(null, [falseCut]);
  assert.equal((await f.exchange(await f.makeRequest('publish', wrong))).ok, false);
  assert.equal(f.f.rows('history_checkpoint_records').length, 0);
  const cp = await f.create(null, [head]),
    r = await f.makeRequest('publish', cp);
  await f.check(r, await f.exchange(r));
  const stored = f.f.rows('history_checkpoint_catalog')[0].value;
  mutate(f, (db) =>
    db
      .prepare('UPDATE history_checkpoint_catalog SET value=?')
      .run(JSON.stringify({ ...JSON.parse(stored), pending: zero })),
  );
  assert.equal((await f.exchange(await f.makeRequest('read', 'pending'))).ok, false);
  mutate(f, (db) => db.prepare('UPDATE history_checkpoint_catalog SET value=?').run(stored));
  mutate(f, (db) => db.exec('DELETE FROM history_checkpoint_records'));
  assert.equal((await f.exchange(await f.makeRequest('read', 'pending'))).ok, false);
});
test('competing proposals do not overwrite, and stale proposals can be discarded after an epoch change', async (t) => {
  const f = await setup(t),
    cp = await f.create();
  const publish = await f.makeRequest('publish', cp);
  await f.check(publish, await f.exchange(publish));
  const read = await f.makeRequest('read', 'pending');
  await f.check(read, await f.exchange(read));
  const competing = await f.create();
  assert.equal(
    (await f.exchange(await f.makeRequest('publish', competing))).refusal,
    'checkpoint-busy',
  );
  const oldAdmission = await f.admit(cp);
  await f.advance();
  assert.equal((await f.exchange(await f.makeRequest('admit', oldAdmission))).ok, false);
  const discard = await f.makeRequest('discard', await c.historyCheckpointHash(cp));
  await f.check(discard, await f.exchange(discard));
  assert.equal(f.f.rows('history_checkpoint_records').length, 0);
  const replacement = await f.create();
  const pub = await f.makeRequest('publish', replacement);
  await f.check(pub, await f.exchange(pub));
});
test('authority changes during verification and revoked authorization at commit cannot publish', async (t) => {
  let effect = () => {};
  const f = await setup(t, (point, op) => {
    if (op === 'history-checkpoint' && point === 'after-verify') effect();
  });
  const cp = await f.create(),
    r = await f.makeRequest('publish', cp);
  effect = () => {
    effect = () => {};
    mutate(f, (db) => db.prepare("UPDATE accounts SET state='pending'").run());
  };
  assert.equal((await f.exchange(r)).ok, false);
  assert.equal(f.f.rows('history_checkpoint_records').length, 0);
  mutate(f, (db) => db.prepare("UPDATE accounts SET state='active'").run());
  await assert.rejects(
    f.exchange(r, (_db, target) => {
      assert.deepEqual(target, {
        kind: 'workspace',
        workspaceId: f.workspace,
        credentialId: f.credential,
        action: 'checkpoint',
      });
      return () => {
        throw new AuthorizationRefused('sign-in-required');
      };
    }),
    (e) => e instanceof AuthorizationRefused,
  );
  assert.equal(f.f.rows('history_checkpoint_records').length, 0);
  assert.equal(f.f.rows('history_checkpoint_catalog').length, 0);
});
test('schema 24 requires an explicit offline upgrade and preserves account rows', async (t) => {
  const f = await setup(t),
    path = f.authority.dir + '/upgrade.sqlite';
  const source = new DatabaseSync(f.f.path);
  source.prepare('VACUUM INTO ?').run(path);
  source.close();
  const db = new DatabaseSync(path);
  db.exec(
    'DROP TABLE history_checkpoint_records; DROP TABLE history_checkpoint_discards; DROP TABLE history_checkpoint_catalog; PRAGMA user_version=24',
  );
  const before = db.prepare('SELECT * FROM promotions').all();
  db.close();
  const policy = { rpId: 'localhost', origin: 'http://localhost:4999' };
  assert.throws(() => new AccountCore(path, policy, f.options), /explicit offline upgrade/);
  const upgraded = new AccountCore(path, policy, { ...f.options, upgradeFromV24: true });
  try {
    const check = new DatabaseSync(path);
    try {
      assert.equal(check.prepare('PRAGMA user_version').get().user_version, 26);
      assert.deepEqual(check.prepare('SELECT * FROM promotions').all(), before);
      assert.deepEqual(check.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
      check.close();
    }
    const read = await f.makeRequest('read', 'latest');
    const result = await f.check(
      read,
      await f.authority.owner.exchangeHistoryCheckpoint(upgraded, read),
    );
    assert.equal(result.checkpoint, null);
  } finally {
    upgraded.close();
  }
});

test('HTTP history exchange requires a workspace grant; exact retries do not emit extra hints', async (t) => {
  const { createServer, request: httpRequest } = await import('node:http');
  const { createSessionAccountHandler } = await import('../../account-service/session-host.ts');
  const { message: grantMessage } = await import('../account-sessions/grant-fixtures.mjs');
  const f = await setup(t),
    retryKey = randomBytes(32).toString('base64url');
  const begun = f.f.core.sessions.begin({ retryKey, accountId: f.account.result.accountId });
  const login = await f.f.core.sessions.finish({
    retryKey,
    attemptId: begun.attemptId,
    response: f.account.key.assert(begun),
  });
  assert.equal(login.stage, 'issued');
  const access = f.f.core.sessions.renew({
    sessionId: login.sessionId,
    renewalToken: login.renewalToken,
  });
  const scope = { kind: 'workspace', workspaceId: f.workspace, credentialId: f.credential };
  const challenge = await f.authority.owner.beginGrant(f.f.core, access.accessToken, scope);
  assert.equal(challenge.stage, 'challenge');
  const grant = await f.f.core.grants.finish(access.accessToken, {
    challengeId: challenge.challenge.challengeId,
    signature: await f.signer(grantMessage(challenge.challenge)),
  });
  assert.equal(grant.stage, 'granted');
  const hints = [];
  const handle = createSessionAccountHandler(f.f.core, f.authority.owner, f.authority.pin, {
    committed: (...args) => hints.push(args),
    reconcile: () => {},
  });
  const server = createServer(
    (request, response) => void handle(request, response, () => response.writeHead(404).end()),
  );
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const post = (body, token, origin = f.authority.pin.origin) =>
    new Promise((resolve, reject) => {
      const request = httpRequest(
        {
          hostname: '127.0.0.1',
          port: server.address().port,
          path: '/account/history/v1/checkpoint',
          method: 'POST',
          agent: false,
          headers: {
            host: new URL(f.authority.pin.origin).host,
            origin,
            'content-type': 'application/json',
            ...(token ? { authorization: 'Bearer ' + token } : {}),
          },
        },
        (response) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () =>
            resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks)) }),
          );
          response.on('error', reject);
        },
      );
      request.on('error', reject);
      request.end(JSON.stringify(body));
    });
  const cp = await f.create(),
    publish = await f.makeRequest('publish', cp);
  assert.equal((await post(publish)).status, 401);
  assert.equal((await post(publish, access.accessToken)).status, 401);
  assert.equal((await post(publish, grant.grantToken, 'https://other.invalid')).status, 403);
  assert.equal(f.f.rows('history_checkpoint_records').length, 0);
  const result = await post(publish, grant.grantToken);
  assert.equal(result.status, 200);
  await f.check(publish, result.body);
  assert.equal(hints.length, 1);
  assert.equal((await post(publish, grant.grantToken)).status, 200);
  assert.equal(hints.length, 1);
  const read = await f.makeRequest('read', 'pending');
  assert.equal((await post(read, grant.grantToken)).status, 200);
  assert.equal(hints.length, 1);
  f.f.core.sessions.revoke({ sessionId: login.sessionId, revokeToken: login.revokeToken });
  assert.notEqual((await post(read, grant.grantToken)).status, 200);
});

test('catalog reads authenticate the current pointers without downloading checkpoint content', async (t) => {
  const f = await setup(t),
    cp = await f.create(),
    pub = await f.makeRequest('publish', cp);
  await f.check(pub, await f.exchange(pub));
  const admit = await f.makeRequest('admit', await f.admit(cp));
  await f.check(admit, await f.exchange(admit));
  const request = await f.makeRequest('read', 'catalog'),
    response = await f.exchange(request),
    page = await f.check(request, response);
  assert.equal(page.catalog.sequence, 1);
  assert.equal(page.catalog.latest, await c.historyCheckpointHash(cp));
  assert.equal(page.checkpoint, null);
  assert.equal(page.admission, null);
  assert.equal(page.source, null);
  assert.equal(f.f.rows('history_checkpoint_records').length, 1);
  const old = await f.makeRequest('read', 'latest');
  await assert.rejects(f.check(request, await f.exchange(old)), /request changed/);
});

test('schema 25 requires explicit offline upgrade before compact ciphertext evidence can be written', async (t) => {
  const f = await setup(t),
    path = f.authority.dir + '/upgrade25.sqlite';
  const source = new DatabaseSync(f.f.path);
  source.prepare('VACUUM INTO ?').run(path);
  source.close();
  const db = new DatabaseSync(path);
  db.exec('PRAGMA user_version=25');
  const before = db.prepare('SELECT * FROM promotions').all();
  db.close();
  const policy = { rpId: 'localhost', origin: 'http://localhost:4999' };
  assert.throws(() => new AccountCore(path, policy, f.options), /explicit offline upgrade/);
  const upgraded = new AccountCore(path, policy, { ...f.options, upgradeFromV25: true });
  try {
    const check = new DatabaseSync(path);
    try {
      assert.equal(check.prepare('PRAGMA user_version').get().user_version, 26);
      assert.deepEqual(check.prepare('SELECT * FROM promotions').all(), before);
    } finally {
      check.close();
    }
  } finally {
    upgraded.close();
  }
});

test('publisher quarantine also fences checkpoint mutation until operator restart and full verification', async (t) => {
  const f = await setup(t),
    head = await f.upload(1, 'quarantine');
  const cp = await f.create(null, [head]);
  const original = f.f.rows('delivery_decisions')[0].submission;
  mutate(f, (db) => db.exec("UPDATE delivery_decisions SET submission=X'00' WHERE ordinal=1"));
  assert.equal((await f.call(f.make(2))).reason, 'ledger-integrity');
  mutate(f, (db) =>
    db.prepare('UPDATE delivery_decisions SET submission=? WHERE ordinal=1').run(original),
  );
  const publish = await f.makeRequest('publish', cp);
  assert.deepEqual(await f.exchange(publish), { ok: false, refusal: 'ledger-integrity' });
  f.f.restart();
  await f.check(publish, await f.exchange(publish));
});
