// Phase 552: why a send or receive request got no result, from the in-process service through
// the application's own scoped transport and delivery transport, over the real scoped HTTP route.
// The explanation chooses a sentence only: the transport returns the same value and records the
// same diagnostics as without it. A service that gave no usable answer still says to check the
// connection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { setup } from './service-fixture.mjs';
import { historyHttp } from './http-fixture.mjs';
import { client as c } from './client.mjs';
import { encodeSubmit, SUBMIT_BODY_LIMIT } from '../../account-protocol/deliveryTransport.ts';
import { mutate } from '../account-successor/service-fixtures.mjs';
import { query } from '../account-service-inbound/oracle.mjs';
import { devices } from './devices-fixture.mjs';
import { signed } from '../account-ceremony/exchange-oracle.mjs';

const CONNECTION = 'Check your connection';
const NOT_CONNECTION = 'This is not a problem with your connection.';
async function lane(t) {
  t.mock.method(Date, 'now', () => 1000);
  const f = await setup(t);
  const net = await historyHttp(t, f);
  const access = net.access(f.credential, f.signer);
  /** One request twice, with and without an explanation: same result, same diagnostics. */
  const post = async (path, body) => {
    const run = async (explain) => {
      c.clearPrivateTransportDiagnostics();
      const seen = [];
      const result = await c.privateDeliveryPost(
        f.authority.pin,
        access,
        path,
        body,
        1 << 20,
        new AbortController().signal,
        undefined,
        false,
        undefined,
        undefined,
        explain ? (r) => seen.push(r) : undefined,
      );
      return { result, seen, diagnostics: c.readPrivateTransportDiagnostics() };
    };
    const plain = await run(false),
      explained = await run(true);
    assert.deepEqual(explained.result, plain.result, 'the same result');
    assert.deepEqual(explained.diagnostics, plain.diagnostics, 'the same diagnostics');
    assert(explained.seen.length <= 1, 'one explanation per request');
    return { result: explained.result, refusal: explained.seen[0] };
  };
  const submit = (w) => post('submit', encodeSubmit(f.workspace, w.bytes));
  return { f, net, post, submit };
}
/** A named service refusal: null, its code, and a sentence that does not blame the connection. */
function refused(r, code) {
  assert.equal(r.result, null);
  assert.equal(r.refusal, code);
  const sentence = c.syncRefusalMessage(code);
  assert(sentence && !sentence.includes(CONNECTION), sentence);
}

test('the service’s own refusals of a submission are named: out of order, future epoch, too large, invalid, unissued parent, parent required', async (t) => {
  const { f, submit } = await lane(t);
  // Position 2 before position 1.
  refused(await submit(f.make(2, 'second')), 'out-of-order');
  refused(await submit(f.make(1, 'future', { epoch: 9 })), 'unsupported-epoch');
  // An envelope past the service's admitted size.
  refused(await submit(f.make(1, 'large', { ct: Buffer.alloc(600 * 1024, 7) })), 'envelope-size');
  // Signed by a key the account does not know.
  refused(
    await submit(f.make(1, 'foreign', { signer: generateKeyPairSync('ed25519').privateKey })),
    'invalid-request',
  );
  // A parent refusal the service never issued.
  const { fixtureAcceptance, refusal } = await import('../account-decisions/oracle.mjs');
  const issuer = fixtureAcceptance(
    { dbPath: f.f.path, pin: f.authority.pin, testOperatorKey: f.authority.key },
    f.workspace,
  );
  const parent = refusal(f.make(1, 'never submitted', { gen: 2 }).subject, issuer);
  refused(await submit(f.make(1, 'unissued parent', { parent })), 'unissued-parent');
  // A permanent refusal at position 1, then another attempt there without naming it.
  const bad = await submit(f.make(1, 'bad', { gen: 2 }));
  assert(bad.result instanceof Uint8Array && bad.refusal === undefined, 'a decision is an answer');
  refused(await submit(f.make(1, 'no parent')), 'parent-required');
  assert.equal(f.f.rows('delivery_decisions').length, 1, 'only the decision was recorded');
});

test('a read the service cannot decode is named as a request from another version; one past the ledger as out of order, one past the route limit as malformed', async (t) => {
  const { f, post } = await lane(t);
  refused(await post('read-v2', new Uint8Array([1, 2, 3])), 'invalid-request');
  refused(await post('read-v2', query(f, 5)), 'out-of-order');
  // A body past the route's limit: the service answers 413 `{ ok: false, refusal: 'malformed' }`.
  refused(await post('submit', new Uint8Array(SUBMIT_BODY_LIMIT + 1)), 'invalid-request');
});

test('a ledger the service cannot trust and a store it cannot read are named, for submissions and reads', async (t) => {
  const { f, post, submit } = await lane(t);
  assert((await submit(f.make(1, 'first'))).result instanceof Uint8Array);
  const ordinal = f.f.rows('delivery_decisions').at(-1).ordinal;
  mutate(f, (db) =>
    db.prepare('UPDATE delivery_decisions SET ordinal=? WHERE ordinal=?').run(ordinal + 1, ordinal),
  );
  refused(await submit(f.make(2, 'second')), 'ledger-integrity');
  refused(await post('read-v2', query(f)), 'ledger-integrity');
  const g = await lane(t);
  mutate(g.f, (db) => db.exec('ALTER TABLE delivery_decisions RENAME TO delivery_decisions_gone'));
  refused(await g.submit(g.f.make(1, 'first')), 'storage-unavailable');
});

test('a submission from a device being removed is named, and so is the grant from before the fence', async (t) => {
  t.mock.method(Date, 'now', () => 1000);
  const d = await devices(t, 2, { http: true }),
    x = d.x;
  const target = d.network.access(x.context.candidate.id, async (b) => signed(x.keys.new, b));
  const send = async (w) => {
    const seen = [];
    const result = await c.privateDeliveryPost(
      x.authority.pin,
      target,
      'submit',
      encodeSubmit(x.workspace, w.bytes),
      1 << 20,
      new AbortController().signal,
      undefined,
      false,
      undefined,
      undefined,
      (r) => seen.push(r),
    );
    return { result, refusal: seen[0] };
  };
  const as = { epoch: 3, credential: x.context.candidate.id, signer: x.keys.new };
  assert((await send(x.make(1, 'before the fence', as))).result instanceof Uint8Array);
  const { removalPreparationRequestMessage } = await import('../../account-protocol/rotation.ts');
  const r = {
    v: 1,
    kind: 'removal-preparation-request',
    workspaceId: x.workspace,
    lineageId: x.base.request.candidate.lineageId,
    parent: x.certification.head,
    epoch: x.certification.epoch.epoch,
    actorId: x.context.existing.id,
    targetId: x.context.candidate.id,
    nonce: 'd1'.repeat(32),
    signature: '00'.repeat(64),
  };
  r.signature = signed(x.keys.existing, await removalPreparationRequestMessage(r));
  const prepared = await x.authority.owner.prepareRemoval(x.f.core, r);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  // The grant this device held named the account before the fence, so the service says the
  // account's devices changed; with a new grant, the submission itself is refused.
  refused(await send(x.make(2, 'after the fence', as)), 'authority-changed');
  refused(await send(x.make(2, 'after the fence', as)), 'removal-pending');
});

test('sign-in and grant refusals are named; a passkey request is left to the sign-in line', async (t) => {
  const { f, net, submit } = await lane(t);
  // A grant for a credential that is not a member of this workspace.
  const stranger = net.access('ee'.repeat(16), f.signer);
  const denied = [];
  assert.equal(
    await c.privateDeliveryPost(
      f.authority.pin,
      stranger,
      'submit',
      encodeSubmit(f.workspace, f.make(1, 'stranger').bytes),
      1 << 20,
      new AbortController().signal,
      undefined,
      false,
      undefined,
      undefined,
      (r) => denied.push(r),
    ),
    null,
  );
  assert.deepEqual(denied, ['access-refused']);
  net.throttle(true);
  refused(await submit(f.make(1, 'busy')), 'capacity');
  net.throttle(false);
  for (const [problem, code] of [
    [undefined, 'login-disconnected'],
    ['busy', 'capacity'],
    ['unavailable', 'storage-unavailable'],
    ['outdated', 'invalid-request'],
    ['refused', 'refused'],
    ['unreachable', 'unreachable'],
  ]) {
    net.disconnect(problem);
    const r = await submit(f.make(1, 'disconnected'));
    assert.equal(r.result, null);
    assert.equal(r.refusal, code, String(problem));
  }
  const g = await lane(t);
  g.net.revoke();
  const r = await g.submit(g.f.make(1, 'revoked'));
  assert.equal(r.result, null);
  assert.equal(r.refusal, undefined, 'the sign-in gate already says so');
  assert.equal(g.net.status, 'reconnect');
});

test('controls: no reply, a timeout and a gateway page say check your connection', async (t) => {
  const { f, net, submit } = await lane(t);
  const html = (status) =>
    new Response('<html>gateway</html>', { status, headers: { 'Content-Type': 'text/html' } });
  for (const [name, reply, code] of [
    ['no reply', () => Promise.reject(new TypeError('fetch failed')), 'unreachable'],
    [
      'timeout',
      () => Promise.reject(new DOMException('The operation timed out.', 'TimeoutError')),
      'timeout',
    ],
    ['gateway page', () => html(502), 'unreachable'],
    ['gateway page on an authorization status', () => html(503), 'unreachable'],
    [
      'JSON outside the closed list',
      () => Response.json({ error: 'busy' }, { status: 409 }),
      'unreachable',
    ],
  ]) {
    net.intercept((path) => (path === '/account/delivery/submit' ? reply() : undefined));
    const r = await submit(f.make(1, name));
    assert.equal(r.result, null, name);
    assert.equal(r.refusal, code, name);
    assert(c.syncRefusalMessage(code).includes(CONNECTION), name);
  }
  net.intercept(null);
  assert((await submit(f.make(1, 'after'))).result instanceof Uint8Array);
});

test('controls: a forged or unknown hint chooses only a sentence; nothing is recorded or returned', async (t) => {
  const { f, net, submit } = await lane(t);
  const hint = (body) => () =>
    new Response(JSON.stringify(body), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  for (const [name, body, code] of [
    ['forged removal', { v: 1, kind: 'unknown', reason: 'removal-pending' }, 'removal-pending'],
    ['forged integrity', { v: 1, kind: 'unknown', reason: 'ledger-integrity' }, 'ledger-integrity'],
    [
      'forged storage',
      { v: 1, kind: 'unknown', reason: 'storage-unavailable' },
      'storage-unavailable',
    ],
    ['forged unavailable', { v: 1, kind: 'unknown', reason: 'unavailable' }, 'unavailable'],
    ['forged state change', { v: 1, kind: 'unknown', reason: 'state-changed' }, 'state-changed'],
    ['unknown reason', { v: 1, kind: 'unknown', reason: 'ledger-vanished' }, 'refused'],
    ['malformed reason', { v: 1, kind: 'unknown', reason: 7 }, 'refused'],
    ['extra field', { v: 1, kind: 'unknown', reason: 'unavailable', retry: 1 }, 'unreachable'],
  ]) {
    net.intercept((path) => (path === '/account/delivery/submit' ? hint(body)() : undefined));
    const r = await submit(f.make(1, name));
    assert.equal(r.result, null, name);
    assert.equal(r.refusal, code, name);
    if (code === 'refused') assert(c.syncRefusalMessage(code).includes(NOT_CONNECTION));
  }
  // An answer too large to use is not a connection problem either.
  net.intercept((path) =>
    path === '/account/delivery/submit'
      ? new Response(new Uint8Array((1 << 20) + 1), {
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      : undefined,
  );
  const large = await submit(f.make(1, 'large answer'));
  assert.equal(large.result, null);
  assert.equal(large.refusal, 'unusable');
  assert(c.syncRefusalMessage('unusable').includes(NOT_CONNECTION));
  net.intercept(null);
  assert.equal(f.f.rows('delivery_decisions').length, 0, 'no forged hint recorded anything');
  assert((await submit(f.make(1, 'after'))).result instanceof Uint8Array);
});
