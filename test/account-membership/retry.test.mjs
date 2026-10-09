import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { membershipRotationFixture } from './rotation-fixtures.mjs';
import { membershipState, verifyMembershipRotation } from '../../account-protocol/membership.ts';
import { refusal, response, head, hash } from '../account-decisions/oracle.mjs';
const built = await build({
  configFile: false,
  logLevel: 'error',
  build: {
    write: false,
    minify: false,
    lib: { entry: resolve('test/account-membership/retry-entry.ts'), formats: ['es'] },
  },
});
const dir = mkdtempSync(join(tmpdir(), 'done-generation-retry-'));
const path = join(dir, 'client.mjs');
writeFileSync(
  path,
  (Array.isArray(built) ? built[0] : built).output.find((o) => o.type === 'chunk').code,
);
process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
const client = await import(pathToFileURL(path).href);
const zero = '00'.repeat(32),
  bytes = (s) => new Uint8Array(Buffer.from(s, 'hex'));
async function fixture() {
  const x = await membershipRotationFixture();
  const rotation = x.rotate();
  const admission = x.f.admit(membershipState(await verifyMembershipRotation(rotation, x.parent)));
  const { history } = await client.verifyMembershipChain(
    { ...x.proofs, continuations: [rotation, admission] },
    x.f.f.base,
  );
  const current = {
    workspace: x.p.workspaceId,
    credential: x.f.context.existing.id,
    principal: x.p.principalId,
    epoch: 5,
    generation: 2,
    history,
  };
  let route = client.captureRouteAt(current, 3);
  const keys = new Map([
    [1, new Uint8Array(32).fill(41)],
    [2, new Uint8Array(32).fill(42)],
  ]);
  const signer = await crypto.subtle.importKey(
    'pkcs8',
    x.f.keys.existing.export({ format: 'der', type: 'pkcs8' }),
    'Ed25519',
    false,
    ['sign'],
  );
  const pub = await crypto.subtle.importKey('raw', bytes(history.signingKey), 'Ed25519', false, [
    'verify',
  ]);
  const doc = new client.Y.Doc();
  doc.getText('master').insert(0, 'offline original writing');
  const update = client.Y.encodeStateAsUpdate(doc);
  doc.destroy();
  const source = client.makeSourceCapsule(route, [
    { actor: route.principal, kind: 'human', bytes: update },
  ]);
  const rows = [{ kind: 'outbound', seq: 1, gen: 1, bytes: source }];
  let witness = { events: 0, hash: zero },
    fault;
  const authority = () => history.authorities.find((a) => a.tip === route.epoch);
  const census = () => client.inspectDelivery(rows, route, authority());
  const validate = async (records = rows, memo) => {
    const c = client.inspectDelivery(records, route, authority());
    const reuse = memo ? { memo, current() {} } : undefined;
    await client.verifySpool(c.spool, route, keys, pub, crypto.subtle, reuse);
    return client.verifyDelivery(c, route, authority(), pub, crypto.subtle, reuse);
  };
  const task = { signal: new AbortController().signal, step: (fn) => fn(), wait: (fn) => fn() };
  const owner = {
    carrier: {
      load: async () => structuredClone(rows),
      spoolWitness: async () => ({ ...witness }),
      appendSpool: async (_task, input, options) => {
        const event = JSON.parse(new TextDecoder().decode(input.bytes));
        const type = event[0] === 'done/account-spool/v1' ? event[7] : event[9];
        const row = {
          ...input,
          bytes: input.bytes.slice(),
          seq: rows.length + 1,
          gen: route.generation,
        };
        await options.beforeCommit([row]);
        if (fault === 'before-' + type) {
          fault = undefined;
          throw Error('Interrupted before ' + type);
        }
        rows.push(row);
        witness = { ...options.after };
        if (fault === 'after-' + type) {
          fault = undefined;
          throw Error('Lost reply after ' + type);
        }
      },
    },
  };
  const run = async (fn) => {
    await validate();
    return fn(task, owner, route);
  };
  const open = () => {
    const delivery = client.createDeliveryOperations({
      authority,
      pin: () => x.p.pin,
      signer: () => signer,
      publicKey: () => pub,
      assertCurrent: async () => {},
      run,
    });
    const preparation = client.createEnvelopePreparation({
      key: () => keys.get(route.generation),
      signer: () => signer,
      whenDurable: async () => {},
      run,
      inspect: (records) => client.inspectDelivery(records, route, authority()).spool,
      checkPublication: async () => {
        assert.equal(client.publicationState(await validate()), 'ready');
      },
    });
    return {
      ...delivery,
      ...preparation,
      spoolStatus: async () => ({
        positions: census().spool.positions.map((p) => ({
          position: p.position,
          persisted: !!p.wire,
        })),
      }),
    };
  };
  const ops = open();
  const original = await ops.prepareNextEnvelope();
  await ops.prepareSubmission(1);
  const envelope = client.decodeNetworkEnvelope(original.bytes);
  const subject = {
    workspace: route.workspace,
    credential: route.credential,
    position: 1,
    epoch: 3,
    digest: Buffer.from(envelope.digest).toString('hex'),
  };
  const closed = refusal(subject, x.f.f.keys.acceptance, zero, 'retired-generation');
  route = current;
  return {
    x,
    keys,
    pub,
    update,
    rows,
    current,
    original,
    subject,
    closed,
    open,
    validate,
    census,
    authority,
    setFault(value) {
      fault = value;
    },
    setRoute(value) {
      route = value;
    },
  };
}

test('signed current-key retry keeps the same original edits, position and closed bytes through interrupted durable steps', async () => {
  const f = await fixture();
  const memo = client.createVerificationMemo();
  let ops = f.open();
  const refused = response({ kind: 'refused', refusal: f.closed });
  f.setFault('after-response');
  await assert.rejects(ops.recordResponse(1, refused), /Lost reply/);
  ops = f.open();
  assert.equal((await ops.deliveryStatus()).state, 'closed');
  const before = structuredClone(f.rows);
  f.setFault('before-retry');
  await assert.rejects(ops.retryRetiredGeneration(), /Interrupted/);
  assert.deepEqual(f.rows, before);
  f.setFault('after-retry');
  await assert.rejects(ops.retryRetiredGeneration(), /Lost reply/);
  ops = f.open();
  assert.equal(await ops.retryRetiredGeneration(), false);
  assert.equal((await ops.deliveryStatus()).state, 'ready');
  await f.validate(undefined, memo);
  f.setFault('after-attempt');
  await assert.rejects(ops.prepareNextEnvelope(), /Lost reply/);
  ops = f.open();
  f.setFault('before-envelope');
  await assert.rejects(ops.prepareNextEnvelope(), /Interrupted/);
  ops = f.open();
  f.setFault('after-envelope');
  await assert.rejects(ops.prepareNextEnvelope(), /Lost reply/);
  ops = f.open();
  const retry = f.census().spool.positions[0];
  assert.equal(f.census().spool.attempts, 4);
  assert.equal(f.census().spool.positions.length, 1);
  assert.deepEqual(retry.retries[0].wire, f.original.bytes);
  assert.deepEqual(retry.retries[0].refusal, refused);
  assert.deepEqual(f.rows.slice(0, before.length), before, 'all original records stay exact');
  f.setFault('after-submission');
  await assert.rejects(ops.prepareSubmission(1), /Lost reply/);
  ops = f.open();
  const saved = await ops.prepareSubmission(1),
    decoded = client.decodeSubmission(saved.bytes);
  assert.deepEqual(decoded.parent, f.closed);
  assert.deepEqual(decoded.envelope, retry.wire);
  const e = client.decodeNetworkEnvelope(retry.wire);
  assert.equal(e.gen, 2);
  assert.equal(e.epoch, 5);
  assert.equal(e.seq, 1);
  const opened = await client.openNetworkEnvelope(
    retry.wire,
    {
      v: 2,
      workspace_id: f.current.workspace,
      credential_id: f.current.credential,
      epoch: 5,
      gen: 2,
    },
    f.pub,
    f.keys.get(2),
  );
  assert.deepEqual(opened.updates, [f.update]);
  await f.validate(undefined, memo);
  const subject = { ...f.subject, epoch: 5, digest: Buffer.from(e.digest).toString('hex') };
  const accepted = response({
    kind: 'accepted',
    head: head(subject, zero, 5, f.x.f.f.keys.acceptance),
    leaf: { epoch: 5, digest: subject.digest },
  });
  f.setFault('after-response');
  await assert.rejects(ops.recordResponse(1, accepted), /Lost reply/);
  ops = f.open();
  assert.equal((await ops.deliveryStatus()).acceptedThrough, 1);
  assert.equal(await ops.retryRetiredGeneration(), false);
  assert.equal(await ops.prepareNextEnvelope(), null, 'the original is not allocated twice');
  await f.validate(undefined, memo);
  assert.equal(
    (await ops.recordResponse(1, refused)).kind,
    'unknown',
    'old refusal cannot close its accepted successor',
  );
});

test('unsigned, substituted and wrong-purpose refusals cannot authorize re-encryption', async () => {
  const f = await fixture(),
    ops = f.open(),
    before = hash(JSON.stringify(f.rows));
  for (const changed of [
    { ...f.closed, signature: '00'.repeat(64) },
    refusal(
      { ...f.subject, digest: 'fa'.repeat(32) },
      f.x.f.f.keys.acceptance,
      zero,
      'retired-generation',
    ),
    refusal(f.subject, f.x.f.f.keys.acceptance, 'ab'.repeat(32), 'retired-generation'),
  ]) {
    assert.equal(
      (await ops.recordResponse(1, response({ kind: 'refused', refusal: changed }))).kind,
      'unknown',
    );
    assert.equal(await ops.retryRetiredGeneration(), false);
    assert.equal(hash(JSON.stringify(f.rows)), before);
  }
  const wrong = refusal(f.subject, f.x.f.f.keys.acceptance, zero, 'epoch-generation-mismatch');
  await ops.recordResponse(1, response({ kind: 'refused', refusal: wrong }));
  assert.equal(await ops.retryRetiredGeneration(), false);
  assert.equal((await ops.deliveryStatus()).state, 'closed');
  const forgedRetry = client.encodeSpoolEntry(
    { type: 'retry', position: 1, refusal: response({ kind: 'refused', refusal: f.closed }) },
    f.current,
  );
  const rows = [...f.rows, { kind: 'heads', seq: f.rows.length + 1, gen: 2, bytes: forgedRetry }];
  await assert.rejects(f.validate(rows), /retained closing decision/);
});

test('the outbound driver retries only with installed newer authority and does not block after recording a valid refusal', async () => {
  const f = await fixture();
  let ops = f.open(),
    sends = 0;
  const refuse = async () => {
    sends++;
    return ops.recordResponse(1, response({ kind: 'refused', refusal: f.closed }));
  };
  const result = await client.driveOutboundStep(
    { ...ops, submitPending: refuse },
    'unused',
    () => 'ready',
  );
  assert.equal(result.kind, 'progress');
  assert.equal(sends, 1);
  assert.equal((await ops.deliveryStatus()).state, 'ready');
  ops = f.open();
  let sent;
  await client.driveOutboundStep(
    {
      ...ops,
      submitPending: async () => {
        sent = (await ops.pendingSubmissions())[0].bytes;
        return { kind: 'unknown' };
      },
    },
    'unused',
    () => 'ready',
  );
  assert.equal(client.decodeNetworkEnvelope(client.decodeSubmission(sent).envelope).gen, 2);
  assert.equal(f.census().spool.positions.length, 1);
});

test('a refusal received by an old writer stays closed until newer membership is installed', async () => {
  const f = await fixture();
  f.setRoute(client.captureRouteAt(f.current, 3));
  let ops = f.open();
  await ops.recordResponse(1, response({ kind: 'refused', refusal: f.closed }));
  const before = structuredClone(f.rows);
  assert.equal(await ops.retryRetiredGeneration(), false);
  assert.deepEqual(f.rows, before);
  assert.equal((await client.driveOutboundStep(ops, 'unused', () => 'ready')).kind, 'blocked');
  f.setRoute(f.current);
  ops = f.open();
  let sent;
  await client.driveOutboundStep(
    {
      ...ops,
      submitPending: async () => {
        sent = (await ops.pendingSubmissions())[0].bytes;
        return { kind: 'unknown' };
      },
    },
    'unused',
    () => 'ready',
  );
  assert.equal(client.decodeNetworkEnvelope(client.decodeSubmission(sent).envelope).gen, 2);
  assert.deepEqual(client.decodeSubmission(sent).parent, f.closed);
  await f.validate();
});
