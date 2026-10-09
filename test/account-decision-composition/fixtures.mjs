import assert from 'node:assert/strict';
import { build } from 'vite';
import { dirname, join, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { AccountCore } from '../../account-service/core.ts';
import { PrivateAuthority } from '../../account-service/authority.ts';
import { decodeSubmission } from '../../account-protocol/submission.ts';
import { decodeNetworkEnvelope } from '../../account-protocol/envelope.ts';
import { proof } from '../account-service-delivery/fixtures.mjs';
import {
  native as base,
  selected,
  open,
  close,
  prepare,
  submission,
  args,
  captures,
  deliveryStatus,
  envelopes,
  status as spoolStatus,
} from '../account-driver/fixtures.mjs';
export * from '../account-driver/fixtures.mjs';
export const hash = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
export function evidence(name, value) {
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(value, null, 2) + '\n',
    );
}
export async function bundle(control) {
  const targets = {
    persist: [
      '/src/crdt/accountDelivery.ts',
      "await persist(task, owner, route, { type: 'response', position, wire: bytes });",
      'void bytes;',
    ],
    closure: ['/src/crdt/deliveryRecord.ts', 's.refusals.set(n, old ?? e.refusalId);', 'void old;'],
    conflict: [
      '/src/crdt/deliveryRecord.ts',
      "if (e.kind === 'conflict') s.conflict = true;",
      "if (e.kind === 'conflict') s.conflict = false;",
    ],
  };
  let hits = 0;
  const r = await build({
    configFile: false,
    logLevel: 'error',
    plugins: control
      ? [
          {
            name: 'decision-composition-control',
            enforce: 'pre',
            transform(code, id) {
              const target = targets[control];
              if (!target) throw Error('Unknown control');
              if (!id.endsWith(target[0])) return;
              assert.equal(code.split(target[1]).length, 2, 'Unique control anchor');
              hits++;
              return code.replace(target[1], target[2]);
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-decision-composition/browser.ts'),
        name: 'Harness',
        formats: ['iife'],
      },
    },
  });
  if (control) assert.equal(hits, 1);
  return (Array.isArray(r) ? r[0] : r).output.find((x) => x.type === 'chunk').code;
}
const script = await bundle();
export async function native(t) {
  const f = await base(t),
    setup = f.setup;
  f.setup = async (page) => {
    await setup(page);
    await page.evaluate(script);
    await page.evaluate((token) => {
      window.openSync = async (item) => {
        window.opened = await Harness.openOwnedSyncingAccountWorkspace(optionsFor(item), token);
        window.editor = opened.workspace;
        window.surface = editor.text({ kind: 'master' });
      };
    }, f.testOperatorToken);
  };
  await f.setup(f.page);
  return f;
}
export const sync = (page, item) => page.evaluate((item) => openSync(item), args(item));
export const view = (page) => page.evaluate(() => editor.read().master);
export const census = (page, item) =>
  page.evaluate((item) => Harness.compositionCensus(item.slotId, item.code), args(item));
export const raw = (page) => page.evaluate(() => Harness.inventory());
export function service(f) {
  const db = new DatabaseSync(f.dbPath, { readOnly: true });
  try {
    return {
      promotions: db.prepare('SELECT * FROM promotions ORDER BY account_id').all(),
      decisions: db
        .prepare('SELECT * FROM delivery_decisions ORDER BY account_id,ordinal')
        .all()
        .map((r) => ({ ...r, submission: [...r.submission], response: [...r.response] })),
    };
  } finally {
    db.close();
  }
}
/** Each call cold-opens real service and authority owners against the fixture's retained DBs. */
export async function issue(f, item, bytes, hook) {
  const core = new AccountCore(
      f.dbPath,
      { origin: f.pin.origin, rpId: f.pin.rpId },
      hook ? { hook } : {},
    ),
    owner = PrivateAuthority.open(join(dirname(f.dbPath), 'root.sqlite'), f.pin, f.testOperatorKey);
  try {
    return await owner.decideSubmission(core, {
      workspaceId: item.scope.workspaceId,
      bytes: new Uint8Array(bytes),
    });
  } finally {
    owner.close();
    core.close();
  }
}
export function subject(bytes) {
  const e = decodeNetworkEnvelope(decodeSubmission(new Uint8Array(bytes)).envelope);
  return {
    workspace: e.workspace_id,
    credential: e.credential_id,
    position: e.seq,
    digest: Buffer.from(e.digest).toString('hex'),
    epoch: e.epoch,
  };
}
export async function prepared(f, id, kind) {
  const item = await selected(f, id);
  await open(f.page, item);
  await prepare(f.page);
  const own = await submission(f.page),
    text = await view(f.page),
    savedCaptures = await captures(f.page),
    spool = await spoolStatus(f.page),
    savedEnvelopes = await envelopes(f.page),
    snapshot = await f.page.evaluate(() => [...editor.snapshot()]);
  assert.equal(own.kind, 'ready');
  await close(f.page);
  const request =
    kind === 'accepted'
      ? own.bytes
      : await f.page.evaluate(
          ({ item, original, kind, snapshot }) =>
            Harness.authorCompetingRequest(item.slotId, item.code, original, kind, snapshot),
          { item: args(item), original: own.bytes, kind, snapshot },
        );
  const beforeRaw = await raw(f.page),
    before = await census(f.page, item);
  assert.equal(await raw(f.page), beforeRaw, 'Census is read-only');
  return {
    f,
    item,
    kind,
    own,
    request,
    text,
    captures: savedCaptures,
    spool,
    envelopes: savedEnvelopes,
    snapshot,
    before,
    seals: f.invocations.length,
  };
}
export async function decide(x, hook) {
  const result = await issue(x.f, x.item, x.request, hook);
  if (result.kind === 'unknown') return result;
  const row = service(x.f).promotions.find((r) => r.workspace_id === x.item.scope.workspaceId),
    offer = JSON.parse(row.offer),
    expected = subject(x.request);
  const parsed = proof(result, offer.epoch.acceptancePublicKey, expected);
  assert.equal(parsed.kind, x.kind === 'closed' ? 'refused' : 'accepted');
  if (x.kind === 'closed') {
    assert.deepEqual(expected, subject(x.own.bytes));
    assert.equal(parsed.refusal.reason, 'epoch-generation-mismatch');
  } else if (x.kind === 'conflict') assert.notEqual(expected.digest, subject(x.own.bytes).digest);
  x.answer = [...result.bytes];
  x.service = service(x.f);
  const ownResult = await issue(x.f, x.item, x.own.bytes);
  assert.deepEqual([...ownResult.bytes], x.answer);
  assert.deepEqual(service(x.f), x.service);
  return result;
}
export const expectedStatus = (kind, recorded) => ({
  state: recorded && kind !== 'accepted' ? kind : 'ready',
  acceptedThrough: recorded && kind === 'accepted' ? 1 : 0,
  finalThrough: null,
  closed: recorded && kind === 'closed' ? [1] : [],
  submissions: [1],
  responses: recorded ? [{ position: 1, count: 1 }] : [],
});
export async function assertOpen(x, recorded, text = x.text) {
  assert.deepEqual(await deliveryStatus(x.f.page), expectedStatus(x.kind, recorded));
  assert.equal(await view(x.f.page), text);
  assert.deepEqual(await envelopes(x.f.page), x.envelopes);
  assert.deepEqual(await spoolStatus(x.f.page), x.spool);
  assert.equal(x.f.invocations.length, x.seals, 'No network reseal');
}
export function assertRetained(x, after, recorded) {
  const domain = (r) => {
      try {
        return JSON.parse(Buffer.from(r.bytes).toString())[0];
      } catch {
        return '';
      }
    },
    retained = (rows) => rows.filter((r) => r.kind === 'outbound' || r.kind === 'heads');
  for (const r of retained(x.before.rows))
    assert.deepEqual(
      after.rows.find((a) => a.seq === r.seq && a.kind === r.kind),
      r,
      'Original source/ledger row retained',
    );
  const responses = after.rows.filter(
    (r) =>
      domain(r) === 'done/account-delivery/v1' &&
      JSON.parse(Buffer.from(r.bytes).toString())[9] === 'response',
  );
  assert.equal(responses.length, recorded ? 1 : 0, 'Exact response row count');
  if (recorded)
    assert.equal(
      JSON.parse(Buffer.from(responses[0].bytes).toString())[11],
      Buffer.from(x.answer).toString('hex'),
    );
  assert.equal(after.witness.events, x.before.witness.events + (recorded ? 1 : 0));
  assert(after.counter.next_seq >= x.before.counter.next_seq);
  for (const [generation, count] of Object.entries(x.before.counter.reserved))
    assert(after.counter.reserved[generation] >= count);
}

/** Opening the existing editor can append a canonical empty Yjs update. Retain every old capsule
 * exactly, and admit only that precise no-op as an otherwise unexplained new capture. */
export function assertCaptures(actual, expected) {
  for (const prior of expected)
    assert.deepEqual(
      actual.find((c) => c.id === prior.id),
      prior,
    );
  for (const added of actual.filter((c) => !expected.some((p) => p.id === c.id))) {
    const { id: _id, sources, ...route } = added,
      { id: _prior, sources: _sources, ...expectedRoute } = expected[0];
    assert.deepEqual(route, expectedRoute);
    assert(sources.length > 0);
    for (const source of sources) {
      assert.equal(source.actor, added.principal);
      assert.equal(source.kind, 'human');
      assert.deepEqual(source.bytes, [0, 0], 'Unexpected newly captured content');
    }
  }
}
