import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import * as runtime from '../../account-protocol/ceremonyExchange.ts';
import { leafPaths, at, changed, replace } from '../account-successor/oracle.mjs';
import { exchangeFixture, message, unsigned, hash } from './exchange-oracle.mjs';

export const authority = (x, role = 'existing', context = x.context) =>
  runtime.verifyCeremonyContext(context, x.f.base, x.f.successor, x.held, x.local(role), x.now);
const pair = async (x, role = 'existing') =>
  runtime.verifyCeremonyPair(await authority(x, role), x.commits.existing, x.commits.new, x.now);

test('exchange bytes, both device signatures and final SAS agree independently after preparation expiry', async () => {
  const x = exchangeFixture();
  assert(x.now > x.f.preparation.expiresAt);
  assert.deepEqual(
    Buffer.from(await runtime.ceremonyContextMessage(x.context)),
    message('done/enrollment-ceremony-context/v1', x.context),
  );
  assert.equal(await runtime.ceremonyContextHash(x.context), x.contextHash(x.context));
  for (const role of ['existing', 'new']) {
    const p = await pair(x, role);
    assert(Object.isFrozen(p.authority.context.pin));
    assert(Object.isFrozen(p.existing.context.candidate));
    assert.deepEqual(
      Buffer.from(await runtime.ceremonyCommitMessage(x.commits[role])),
      message('done/enrollment-ceremony-commitment/v1', unsigned(x.commits[role])),
    );
    const proposed = await runtime.prepareCeremonyReveal(p, x.nonces[role], x.now);
    await assert.rejects(runtime.verifyCeremonyReveal(p, proposed, role, x.now));
    assert.deepEqual(unsigned(proposed), unsigned(x.reveals[role]));
    assert.deepEqual(
      Buffer.from(await runtime.ceremonyRevealMessage(proposed)),
      message('done/enrollment-ceremony-reveal/v1', unsigned(x.reveals[role])),
    );
    assert.deepEqual(
      await runtime.verifyCeremonyReveal(p, x.reveals[role], role, x.now),
      x.reveals[role],
    );
    assert.deepEqual(
      await runtime.deriveCeremonyExchange(p, x.reveals.existing, x.reveals.new, x.now),
      x.result,
    );
    assert.equal(p.existingCommitHash, hash(JSON.stringify(x.commits.existing)));
  }
});

test('every context leaf is authority-bound or changes the signed attempt, with local custody and held head required', async () => {
  const x = exchangeFixture();
  for (const path of leafPaths(x.context)) {
    const c = replace(x.context, path, changed(at(x.context, path)));
    if (['attemptId', 'createdAt', 'expiresAt'].includes(path[0])) continue;
    await assert.rejects(authority(x, 'existing', c), undefined, path.join('.'));
  }
  for (const role of ['existing', 'new']) {
    const local = x.local(role);
    for (const field of ['id', 'wPub', 'sPub'])
      await assert.rejects(
        runtime.verifyCeremonyContext(
          x.context,
          x.f.base,
          x.f.successor,
          x.held,
          { ...local, [field]: field === 'id' ? 'aa'.repeat(16) : 'aa'.repeat(32) },
          x.now,
        ),
      );
  }
  for (const held of [x.f.held, { epoch: 2, head: 'ff'.repeat(32) }])
    await assert.rejects(
      runtime.verifyCeremonyContext(
        x.context,
        x.f.base,
        x.f.successor,
        held,
        x.local('existing'),
        x.now,
      ),
    );
  const signedWrongRoster = structuredClone(x.f.epoch);
  signedWrongRoster.roster.find((m) => m.state === 'certified').sPub = x.context.candidate.sPub;
  await assert.rejects(
    runtime.verifyCeremonyContext(
      x.context,
      x.f.base,
      x.f.seal(signedWrongRoster),
      x.held,
      x.local('existing'),
      x.now,
    ),
  );
});

test('every commitment and reveal leaf is verified; a root signature cannot replace a device signature', async () => {
  const x = exchangeFixture(),
    a = await authority(x),
    p = await pair(x);
  for (const role of ['existing', 'new']) {
    for (const path of leafPaths(x.commits[role])) {
      const bad = replace(x.commits[role], path, changed(at(x.commits[role], path)));
      await assert.rejects(
        runtime.verifyCeremonyCommit(a, bad, role, x.now),
        undefined,
        path.join('.'),
      );
    }
    for (const path of leafPaths(x.reveals[role])) {
      const bad = replace(x.reveals[role], path, changed(at(x.reveals[role], path)));
      await assert.rejects(
        runtime.verifyCeremonyReveal(p, bad, role, x.now),
        undefined,
        path.join('.'),
      );
    }
    await assert.rejects(
      runtime.verifyCeremonyCommit(
        a,
        x.signCommit(unsigned(x.commits[role]), x.f.keys.authority),
        role,
        x.now,
      ),
    );
    await assert.rejects(
      runtime.verifyCeremonyReveal(
        p,
        x.signReveal(unsigned(x.reveals[role]), x.f.keys.authority),
        role,
        x.now,
      ),
    );
    await assert.rejects(
      runtime.verifyCeremonyReveal(
        p,
        x.reveal(role, x.commits, x.context, 'bb'.repeat(32)),
        role,
        x.now,
      ),
      /opening changed/,
    );
  }
});

test('exact retries survive JSON key order; another attempt, signed pair, role or nonce does not', async () => {
  const x = exchangeFixture(),
    a = await authority(x),
    p = await pair(x);
  const reverse = (value) =>
    Array.isArray(value)
      ? value.map(reverse)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .reverse()
              .map(([k, v]) => [k, reverse(v)]),
          )
        : value;
  assert.deepEqual(
    await runtime.verifyCeremonyPair(a, reverse(x.commits.existing), reverse(x.commits.new), x.now),
    p,
  );
  const otherContext = { ...x.context, attemptId: 'c1'.repeat(32) };
  await assert.rejects(
    runtime.verifyCeremonyPair(a, x.commits.existing, x.commit('new', otherContext), x.now),
    /context changed/,
  );
  const laterContext = {
    ...x.context,
    createdAt: x.context.createdAt - 1,
    expiresAt: x.context.expiresAt - 1,
  };
  await assert.rejects(
    runtime.verifyCeremonyCommit(a, x.commit('new', laterContext), 'new', x.now),
    /context changed/,
  );
  await assert.rejects(runtime.verifyCeremonyPair(a, x.commits.new, x.commits.existing, x.now));
  await assert.rejects(
    runtime.prepareCeremonyReveal(p, x.nonces.new, x.now),
    /Local ceremony nonce changed/,
  );
  const revised = { ...x.commits, existing: x.commit('existing', x.context, 'c2'.repeat(32)) };
  const otherPair = await runtime.verifyCeremonyPair(a, revised.existing, revised.new, x.now);
  await assert.rejects(
    runtime.verifyCeremonyReveal(otherPair, x.reveals.new, 'new', x.now),
    /pair changed/,
  );
  await assert.rejects(runtime.verifyCeremonyReveal(p, x.reveals.new, 'existing', x.now));
  for (const copy of [{}, structuredClone(a)])
    await assert.rejects(
      runtime.verifyCeremonyPair(copy, x.commits.existing, x.commits.new, x.now),
      /Unverified/,
    );
  for (const copy of [{}, structuredClone(p)])
    await assert.rejects(
      runtime.prepareCeremonyReveal(copy, x.nonces.existing, x.now),
      /Unverified/,
    );
});

test('closed messages, byte limits and exact fixed deadlines fail before verification', async () => {
  const x = exchangeFixture(),
    a = await authority(x),
    p = await pair(x);
  for (const [parse, value, limit] of [
    [runtime.parseCeremonyContext, x.context, runtime.CEREMONY_CONTEXT_LIMIT],
    [runtime.parseCeremonyCommit, x.commits.existing, runtime.CEREMONY_COMMIT_LIMIT],
    [runtime.parseCeremonyReveal, x.reveals.new, runtime.CEREMONY_REVEAL_LIMIT],
  ]) {
    for (const invalid of [
      null,
      [],
      {},
      { ...value, extra: 1 },
      { ...value, extra: 'x'.repeat(limit) },
    ])
      assert.throws(() => parse(invalid));
    for (const key of Object.keys(value)) {
      const missing = { ...value };
      delete missing[key];
      assert.throws(() => parse(missing));
    }
  }
  for (const createdAt of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER, '700000'])
    assert.throws(() => runtime.parseCeremonyContext({ ...x.context, createdAt }));
  assert.throws(() =>
    runtime.parseCeremonyContext({ ...x.context, expiresAt: x.context.expiresAt + 1 }),
  );
  for (const now of [x.context.createdAt - 1, x.context.expiresAt, NaN]) {
    await assert.rejects(
      runtime.verifyCeremonyContext(
        x.context,
        x.f.base,
        x.f.successor,
        x.held,
        x.local('existing'),
        now,
      ),
    );
    await assert.rejects(runtime.verifyCeremonyPair(a, x.commits.existing, x.commits.new, now));
    await assert.rejects(runtime.prepareCeremonyReveal(p, x.nonces.existing, now));
    await assert.rejects(runtime.verifyCeremonyReveal(p, x.reveals.new, 'new', now));
    await assert.rejects(runtime.deriveCeremonyExchange(p, x.reveals.existing, x.reveals.new, now));
  }
});

test('context, local custody, commitments and reveals are captured before async verification', async () => {
  const x = exchangeFixture(),
    c = structuredClone(x.context),
    local = x.local('existing'),
    source = structuredClone(x.f.successor);
  const pendingContext = runtime.verifyCeremonyContext(c, x.f.base, source, x.held, local, x.now);
  c.candidate.sPub = 'ff'.repeat(32);
  local.sPub = 'ff'.repeat(32);
  source.signature = '00'.repeat(64);
  const a = await pendingContext;
  const e = structuredClone(x.commits.existing),
    n = structuredClone(x.commits.new);
  const pendingPair = runtime.verifyCeremonyPair(a, e, n, x.now);
  e.signature = '00'.repeat(64);
  n.context.head = 'ff'.repeat(32);
  const p = await pendingPair;
  const re = structuredClone(x.reveals.existing),
    rn = structuredClone(x.reveals.new);
  const pendingResult = runtime.deriveCeremonyExchange(p, re, rn, x.now);
  re.nonce = 'ff'.repeat(32);
  rn.signature = '00'.repeat(64);
  assert.deepEqual(await pendingResult, x.result);
});

test('60 generated attempt IDs/nonces independently bind exact signed messages and reproduce the selected SAS', async () => {
  const bytes = fc
    .uint8Array({ minLength: 32, maxLength: 32 })
    .map((b) => Buffer.from(b).toString('hex'));
  const x = exchangeFixture();
  await fc.assert(
    fc.asyncProperty(bytes, bytes, bytes, async (id, e, n) => {
      const c = { ...x.context, attemptId: id },
        a = await authority(x, 'existing', c);
      const commits = { existing: x.commit('existing', c, e), new: x.commit('new', c, n) };
      const p = await runtime.verifyCeremonyPair(a, commits.existing, commits.new, x.now);
      const reveals = {
        existing: x.reveal('existing', commits, c, e),
        new: x.reveal('new', commits, c, n),
      };
      const { derive } = await import('./oracle.mjs');
      assert.deepEqual(
        await runtime.deriveCeremonyExchange(p, reveals.existing, reveals.new, x.now),
        derive({ ...x.transcript, nonceExisting: e, nonceNew: n }),
      );
      assert.equal(p.contextHash, x.contextHash(c));
    }),
    { seed: 16091608, numRuns: 60 },
  );
});
