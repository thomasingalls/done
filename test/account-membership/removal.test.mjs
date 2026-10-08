import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fixture, message, signed, hash } from './fixtures.mjs';
import { rotationIntentMessage } from '../../account-protocol/rotation.ts';
import { lp } from '../account-ceremony/oracle.mjs';
const require = createRequire(import.meta.url),
  vr = createRequire(require.resolve('vite'));
const { rolldown } = await import(vr.resolve('rolldown'));
const bundle = await rolldown({
  input: fileURLToPath(new URL('./removal-entry.ts', import.meta.url)),
});
let built;
try {
  built = await bundle.generate({ format: 'esm' });
} finally {
  await bundle.close();
}
const directory = mkdtempSync(join(tmpdir(), 'done-device-removal-')),
  path = join(directory, 'client.mjs');
writeFileSync(path, built.output[0].code);
process.once('exit', () => rmSync(directory, { recursive: true, force: true }));
const client = await import(pathToFileURL(path).href);
const raw = (s) => new Uint8Array(Buffer.from(s, 'hex'));
async function ready(pending = false) {
  const pairs = await Promise.all(
    [0, 1, 2].map(() => crypto.subtle.generateKey('X25519', false, ['deriveBits'])),
  );
  const publics = await Promise.all(
    pairs.map(async (p) =>
      Buffer.from(await crypto.subtle.exportKey('raw', p.publicKey)).toString('hex'),
    ),
  );
  const f = fixture({
    wrappingPublicKey: publics[0],
    joiningPublicKey: publics[1],
    recoveryPublicKey: publics[2],
  });
  let parent = await client.verifyMembershipAnchor(
    f.f.base,
    f.f.successor,
    f.certification,
    f.anchor,
  );
  let target = f.context.candidate.id;
  if (pending) {
    const a = f.admit(client.membershipState(parent));
    parent = await client.verifyMembershipAdmission(a, parent);
    target = a.epoch.preparation.context.candidate.credentialId;
  }
  const p = client.membershipState(parent),
    participant = structuredClone(f.context.existing),
    controller = new AbortController();
  let retained = null,
    prepared = null,
    outcome = null,
    fail,
    replacement = 0;
  const sent = [],
    opened = [];
  const io = {
    signal: controller.signal,
    load: async () => {
      fail?.('read', retained);
      return structuredClone(retained);
    },
    replace: async (before, next) => {
      fail?.('before-save', next);
      assert.deepEqual(before, retained, 'atomic compare and replace');
      retained = structuredClone(next);
      replacement++;
      fail?.('after-save', next);
    },
    prepare: async (r) => {
      assert.deepEqual(retained.request, r);
      assert.equal(retained.rotation, null);
      sent.push({ kind: 'prepare', body: structuredClone(r) });
      if (!prepared) {
        const body = {
          v: 1,
          kind: 'removal-preparation',
          request: r,
          cutoff: structuredClone(p.heads),
        };
        prepared = {
          ...body,
          signature: signed(f.f.keys.authority, message('done/removal-preparation/v1', body)),
        };
      } else assert.deepEqual(prepared.request, r);
      fail?.('prepare-reply', prepared);
      return structuredClone(prepared);
    },
    submit: async (r) => {
      assert.deepEqual(retained.rotation, r);
      assert.equal(
        opened.at(-1).every((b) => b === 0),
        true,
        'transient opener wiped before send',
      );
      sent.push({ kind: 'submit', body: structuredClone(r) });
      if (!outcome) {
        const body = {
          v: 1,
          kind: 'rotate',
          workspaceId: p.workspaceId,
          lineageId: p.lineageId,
          target: 2,
          epoch: p.epoch + 1,
          committedId: hash(await rotationIntentMessage(r)),
        };
        outcome = {
          ...body,
          signature: signed(
            f.f.keys.authority,
            lp(
              'done/transition-out/v1',
              '1',
              'rotate',
              body.workspaceId,
              body.lineageId,
              '2',
              String(body.epoch),
              body.committedId,
            ),
          ),
        };
      }
      fail?.('submit-reply', outcome);
      return structuredClone(outcome);
    },
  };
  const owner = {
    participant,
    sign: async (bytes) => signed(f.keys.existing, bytes),
    openWrap: async (w, info) => {
      fail?.('open', w);
      const key = await client.openGeneration(w, pairs[0].privateKey, raw(publics[0]), info);
      opened.push(key);
      return key;
    },
  };
  return {
    f,
    p,
    parent,
    target,
    publics,
    pairs,
    owner,
    io,
    controller,
    sent,
    opened,
    set fail(value) {
      fail = value;
    },
    get retained() {
      return structuredClone(retained);
    },
    get replacements() {
      return replacement;
    },
    set retained(value) {
      retained = structuredClone(value);
    },
    run: () => client.continueDeviceRemoval(parent, f.f.base.request.recovery, target, owner, io),
  };
}

test('real fresh key wraps open only for the exact remaining devices and recovery, with no raw key retained', async () => {
  for (const pending of [false, true]) {
    const x = await ready(pending);
    assert.equal(await x.run(), 'committed');
    const r = x.retained.rotation,
      info = client.generationInfo({
        workspaceId: x.p.workspaceId,
        lineageId: x.p.lineageId,
        authRoot: x.p.pin.authRoot,
        generation: 2,
      });
    const keys = [];
    for (const w of r.payload.wraps) {
      const i = w.credentialId === x.owner.participant.id ? 0 : 1;
      keys.push(await client.openGeneration(w, x.pairs[i].privateKey, raw(x.publics[i]), info));
    }
    keys.push(
      await client.openGeneration(
        r.payload.recoveryWrap,
        x.pairs[2].privateKey,
        raw(x.publics[2]),
        info,
      ),
    );
    for (const k of keys) assert.deepEqual(k, keys[0]);
    assert.equal(keys[0].length, 32);
    assert(!JSON.stringify(x.retained).includes(Buffer.from(keys[0]).toString('hex')));
    assert.equal(r.payload.wraps.length, pending ? 2 : 1);
    if (!pending)
      await assert.rejects(
        client.openGeneration(r.payload.wraps[0], x.pairs[1].privateKey, raw(x.publics[1]), info),
      );
    await assert.rejects(
      client.openGeneration(
        r.payload.wraps[0],
        x.pairs[0].privateKey,
        raw(x.publics[0]),
        client.generationInfo({
          workspaceId: x.p.workspaceId,
          lineageId: x.p.lineageId,
          authRoot: x.p.pin.authRoot,
          generation: 1,
        }),
      ),
    );
    assert(x.opened.every((k) => k.every((b) => b === 0)));
    const before = x.sent.length;
    assert.equal(await x.run(), 'committed');
    assert.equal(x.sent.length, before);
    keys.forEach((k) => k.fill(0));
  }
});

test('lost preparation and rotation replies retry exact retained bytes and cold-resolve the committed outcome', async () => {
  const x = await ready();
  let losePrepare = true,
    loseSubmit = true;
  x.fail = (kind) => {
    if (kind === 'prepare-reply' && losePrepare) {
      losePrepare = false;
      throw Error('lost preparation reply');
    }
    if (kind === 'submit-reply' && loseSubmit) {
      loseSubmit = false;
      throw Error('lost committed reply');
    }
  };
  assert.equal(await x.run(), 'pending');
  assert.equal(x.retained.preparation, null);
  assert.equal(await x.run(), 'pending');
  const pending = x.retained;
  assert(pending.rotation);
  assert.equal(pending.outcome, null);
  assert.equal(await x.run(), 'committed');
  assert.deepEqual(
    x.sent.filter((s) => s.kind === 'prepare').map((s) => s.body),
    [pending.request, pending.request],
  );
  assert.deepEqual(
    x.sent.filter((s) => s.kind === 'submit').map((s) => s.body),
    [pending.rotation, pending.rotation],
  );
});

test('interruption at each persistence boundary cannot send unretained intent and recovers without remint after save', async () => {
  for (const stage of ['request', 'preparation', 'rotation', 'outcome'])
    for (const edge of ['before-save', 'after-save']) {
      const x = await ready();
      let fail = true;
      x.fail = (where, p) => {
        const actual = p?.outcome
          ? 'outcome'
          : p?.rotation
            ? 'rotation'
            : p?.preparation
              ? 'preparation'
              : 'request';
        if (fail && edge === where && actual === stage) {
          fail = false;
          throw Error(`interrupted ${stage} ${edge}`);
        }
      };
      await assert.rejects(x.run(), /interrupted/);
      const held = x.retained;
      if (stage === 'request') assert.equal(x.sent.length, 0);
      if (stage !== 'outcome')
        assert.equal(
          x.sent.some((s) => s.kind === 'submit'),
          false,
        );
      assert.equal(await x.run(), 'committed');
      if (held?.rotation) assert.deepEqual(x.retained.rotation, held.rotation);
      assert(x.opened.every((k) => k.every((b) => b === 0)));
    }
});

test('changed retained state, failed self opener, wrong owner and closed lifetime stop transmission', async () => {
  const x = await ready();
  x.fail = (kind) => {
    if (kind === 'submit-reply') throw Error('lost');
  };
  assert.equal(await x.run(), 'pending');
  const held = x.retained,
    sent = x.sent.length;
  x.retained = { ...held, preparation: null };
  await assert.rejects(x.run(), /Incomplete/);
  assert.equal(x.sent.length, sent);
  x.retained = held;
  x.fail = (kind) => {
    if (kind === 'open') throw Error('opener lost');
  };
  await assert.rejects(x.run(), /opener lost/);
  assert.equal(x.sent.length, sent);
  x.fail = null;
  x.owner.participant.sPub = 'ff'.repeat(32);
  await assert.rejects(x.run(), /another owner/);
  assert.equal(x.sent.length, sent);
  const y = await ready();
  y.fail = (kind, p) => {
    if (kind === 'after-save' && p.rotation) y.controller.abort();
  };
  await assert.rejects(y.run(), { name: 'AbortError' });
  assert.equal(
    y.sent.some((s) => s.kind === 'submit'),
    false,
  );
  assert(y.retained.rotation);
});

test('unsigned stale response remains pending; authenticated competing outcome is retained without remint', async () => {
  const x = await ready();
  x.io.submit = async (r) => {
    assert.deepEqual(r, x.retained.rotation);
    return { ok: false, refusal: 'stale' };
  };
  assert.equal(await x.run(), 'pending');
  const held = x.retained;
  x.io.submit = async (r) => {
    assert.deepEqual(r, held.rotation);
    const o = {
      v: 1,
      kind: 'rotate',
      workspaceId: x.p.workspaceId,
      lineageId: x.p.lineageId,
      target: 2,
      epoch: x.p.epoch + 1,
      committedId: 'ef'.repeat(32),
    };
    return {
      ...o,
      signature: signed(
        x.f.f.keys.authority,
        lp(
          'done/transition-out/v1',
          '1',
          'rotate',
          o.workspaceId,
          o.lineageId,
          '2',
          String(o.epoch),
          o.committedId,
        ),
      ),
    };
  };
  assert.equal(await x.run(), 'superseded');
  assert.deepEqual(x.retained.rotation, held.rotation);
  assert.equal(await x.run(), 'superseded');
  assert.deepEqual(x.retained.rotation, held.rotation);
});
