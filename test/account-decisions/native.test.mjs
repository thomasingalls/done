import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  native,
  selected,
  open,
  edit,
  close,
  cold,
  prepare,
  envelopes,
  status,
  captures,
  inspect,
  subjects,
  decisionBundle,
  waitHit,
} from './fixtures.mjs';
import { inventory } from '../account-capture/fixtures.mjs';
import { fixtureAcceptance, head, refusal, response, link, key } from './oracle.mjs';
const ZERO = '00'.repeat(32),
  old = JSON.parse(readFileSync('test/vectors/antireplay.json')),
  current = key(old.keys.k_accept.seed),
  retired = key(old.keys.k_accept_retired.seed);
const artifact = (name, value) => {
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name),
      JSON.stringify(value, null, 2) + '\n',
    );
};
async function ready(t, id) {
  const f = await native(t),
    item = await selected(f, id);
  await open(f.page, item);
  await prepare(f.page);
  await f.page.evaluate(() => editor.whenDurable());
  return { f, item, signer: fixtureAcceptance(f, item.scope.workspaceId) };
}
test(
  'owned proof checks resolve certified custody, retain exact wire and do not persist decision state',
  { timeout: 30000 },
  async (t) => {
    const { f, item, signer } = await ready(t, 'read-proof'),
      s = (await subjects(f.page))[0],
      before = await inventory(f.page),
      wire = await envelopes(f.page),
      sources = await captures(f.page),
      budget = await status(f.page);
    const yes = response({ kind: 'accepted', head: head(s, ZERO, 1, signer), leaf: s });
    assert.equal((await inspect(f.page, s.position, yes)).kind, 'accepted');
    const no = response({ kind: 'refused', refusal: refusal(s, signer) });
    assert.equal((await inspect(f.page, s.position, no)).kind, 'refused');
    assert.deepEqual(await envelopes(f.page), wire);
    assert.deepEqual(await captures(f.page), sources);
    assert.deepEqual(await status(f.page), budget);
    assert.equal(await inventory(f.page), before);
    await close(f.page);
    await cold(f);
    await open(f.page, item);
    assert.deepEqual(await envelopes(f.page), wire);
    assert.equal((await inspect(f.page, s.position, yes)).kind, 'accepted');
    await close(f.page);
  },
);
test(
  'foreign keys, subjects, parent and claimed chain links leave delivery unknown; proved conflicting digest is distinct',
  { timeout: 30000 },
  async (t) => {
    const { f, signer } = await ready(t, 'wrong-proof'),
      s = (await subjects(f.page))[0],
      before = await inventory(f.page);
    const bad = [
      response({ kind: 'refused', refusal: refusal(s, retired) }),
      response({ kind: 'refused', refusal: refusal({ ...s, workspace: 'other' }, signer) }),
      response({ kind: 'refused', refusal: refusal({ ...s, credential: 'other' }, signer) }),
      response({ kind: 'refused', refusal: refusal({ ...s, epoch: 2 }, signer) }),
      response({ kind: 'refused', refusal: refusal({ ...s, digest: 'ff'.repeat(32) }, signer) }),
      response({ kind: 'refused', refusal: refusal(s, signer, 'ff'.repeat(32)) }),
      response({ kind: 'accepted', head: head(s, 'ff'.repeat(32), 1, signer), leaf: s }),
      new Uint8Array([1, 2, 3]),
    ];
    for (const b of bad) assert.equal((await inspect(f.page, s.position, b)).kind, 'unknown');
    const other = { ...s, digest: 'aa'.repeat(32) };
    assert.equal(
      (
        await inspect(
          f.page,
          s.position,
          response({ kind: 'accepted', head: head(other, ZERO, 1, signer), leaf: other }),
        )
      ).kind,
      'conflict',
    );
    assert.equal(
      (
        await inspect(
          f.page,
          s.position + 1,
          response({ kind: 'refused', refusal: refusal(s, signer) }),
        )
      ).kind,
      'unknown',
    );
    assert.equal(await inventory(f.page), before);
    await close(f.page);
  },
);
test(
  'close drains a pending response verification and withholds its evidence before releasing exclusion',
  { timeout: 30000 },
  async (t) => {
    const { f, item, signer } = await ready(t, 'proof-close'),
      s = (await subjects(f.page))[0],
      bytes = response({ kind: 'refused', refusal: refusal(s, signer) });
    await f.page.evaluate(
      ({ position, bytes }) => {
        const verify = crypto.subtle.verify.bind(crypto.subtle);
        crypto.subtle.verify = async function (alg, key, sig, msg) {
          if (new TextDecoder().decode(msg).includes('done/position-refuse/v1')) {
            window.hit = true;
            await new Promise((r) => (window.release = r));
          }
          return verify(alg, key, sig, msg);
        };
        window.work = opened.inspectResponse(position, new Uint8Array(bytes)).then(
          (x) => ({ returned: x.kind }),
          (e) => ({ error: String(e) }),
        );
      },
      { position: s.position, bytes: [...bytes] },
    );
    await waitHit(f.page);
    await f.page.evaluate((slot) => {
      window.closing = editor.close();
      window.competed = false;
      window.competitor = navigator.locks.request(
        Harness.slotPermitName(slot),
        () => (window.competed = true),
      );
    }, item.slotId);
    await f.page.waitForFunction(async () => (await navigator.locks.query()).pending.length > 0);
    assert.equal(await f.page.evaluate(() => competed), false);
    await f.page.evaluate(() => release());
    const result = await f.page.evaluate(() => work);
    assert.ok(result.error);
    assert.equal(result.returned, undefined);
    await f.page.evaluate(() => closing);
    await f.page.evaluate(() => competitor);
    await assert.rejects(inspect(f.page, s.position, bytes), /inactive|live/i);
    await cold(f);
    await open(f.page, item);
    assert.equal((await inspect(f.page, s.position, bytes)).kind, 'refused');
    await close(f.page);
  },
);
test(
  'eight generated response histories preserve stored sources, wire and counters through cold restart',
  { timeout: 90000 },
  async (t) => {
    const f = await native(t),
      seed = 9622026,
      histories = [];
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom(
            'accepted',
            'refused',
            'foreign-key',
            'foreign-prefix',
            'conflict',
            'junk',
          ),
          { minLength: 2, maxLength: 5 },
        ),
        async (history) => {
          const evidence = { commands: history, observations: [] };
          histories.push(evidence);
          artifact('generated.json', { seed, histories, status: 'running' });
          console.log(`decision history ${histories.length}/8: ${JSON.stringify(history)}`);
          const item = await selected(f, 'generated-proof-' + histories.length);
          await open(f.page, item);
          await prepare(f.page);
          await f.page.evaluate(() => editor.whenDurable());
          const signer = fixtureAcceptance(f, item.scope.workspaceId),
            s = (await subjects(f.page))[0],
            wire = await envelopes(f.page),
            before = await inventory(f.page),
            budget = await status(f.page),
            sources = await captures(f.page);
          evidence.before = {
            inventoryHash: createHash('sha256').update(before).digest('hex'),
            wire,
            budget,
            sources,
          };
          for (const kind of history) {
            let b,
              expected = kind;
            if (kind === 'accepted')
              b = response({ kind: 'accepted', head: head(s, ZERO, 1, signer), leaf: s });
            else if (kind === 'refused')
              b = response({ kind: 'refused', refusal: refusal(s, signer) });
            else if (kind === 'foreign-key') {
              b = response({ kind: 'refused', refusal: refusal(s, retired) });
              expected = 'unknown';
            } else if (kind === 'foreign-prefix') {
              b = response({
                kind: 'accepted',
                head: head(s, 'ff'.repeat(32), 1, signer),
                leaf: s,
              });
              expected = 'unknown';
            } else if (kind === 'conflict') {
              const x = { ...s, digest: 'ff'.repeat(32) };
              b = response({ kind: 'accepted', head: head(x, ZERO, 1, signer), leaf: x });
            } else {
              b = new Uint8Array([255]);
              expected = 'unknown';
            }
            const observed = (await inspect(f.page, s.position, b)).kind,
              stored = await inventory(f.page);
            evidence.observations.push({
              kind: observed,
              inventoryHash: createHash('sha256').update(stored).digest('hex'),
            });
            artifact('generated.json', { seed, histories, status: 'running' });
            assert.equal(observed, expected);
            assert.equal(stored, before);
          }
          evidence.after = { budget: await status(f.page), sources: await captures(f.page) };
          assert.deepEqual(evidence.after.budget, budget);
          assert.deepEqual(evidence.after.sources, sources);
          await close(f.page);
          await cold(f);
          await open(f.page, item);
          evidence.recovered = { wire: await envelopes(f.page), sources: await captures(f.page) };
          assert.deepEqual(evidence.recovered.wire, wire);
          for (const source of sources)
            assert.deepEqual(
              evidence.recovered.sources.find((c) => c.id === source.id),
              source,
            );
          artifact('generated.json', { seed, histories, status: 'running' });
          await close(f.page);
        },
      ),
      { seed, numRuns: 8, endOnFailure: true },
    );
    artifact('generated.json', { seed, histories, status: 'passed' });
  },
);
test(
  'later-position acceptance reconstructs every retained predecessor instead of trusting a supplied link',
  { timeout: 30000 },
  async (t) => {
    const { f, signer } = await ready(t, 'proof-prefix');
    await edit(f.page, 0, 0, 'later ');
    await f.page.evaluate(() => editor.whenDurable());
    let guard = 0;
    while (await prepare(f.page)) if (++guard > 10) throw Error('Fixture bound');
    const all = await subjects(f.page);
    assert.ok(all.length >= 2);
    let previous = ZERO;
    for (const s of all) {
      assert.equal(
        (
          await inspect(
            f.page,
            s.position,
            response({ kind: 'accepted', head: head(s, previous, 1, signer), leaf: s }),
          )
        ).kind,
        'accepted',
      );
      previous = link(s, previous);
    }
    await close(f.page);
  },
);
test(
  'actual verifier controls expose wrong-key, wrong-epoch, unanchored-head and unbound-parent acceptance',
  { timeout: 45000 },
  async (t) => {
    const f = await native(t),
      results = [];
    const s = {
        workspace: 'ws',
        credential: 'cred',
        position: 3,
        digest: '33'.repeat(32),
        epoch: 8,
      },
      a = {
        workspace: 'ws',
        lineage: '11'.repeat(32),
        tip: 9,
        head: '22'.repeat(32),
        acceptanceKey: old.keys.k_accept.public_key,
      },
      expected = { ...s, parent: ZERO, previous: ZERO };
    for (const control of ['signature', 'epoch', 'link']) {
      let r;
      if (control === 'signature') r = { kind: 'refused', refusal: refusal(s, retired) };
      else if (control === 'epoch')
        r = { kind: 'refused', refusal: refusal({ ...s, epoch: 7 }, current) };
      else r = { kind: 'accepted', head: head(s, 'ff'.repeat(32), 9, current), leaf: s };
      const bytes = [...response(r)];
      const check = () =>
        f.page.evaluate(({ b, e, a }) => Harness.verifyPositionResponse(new Uint8Array(b), e, a), {
          b: bytes,
          e: expected,
          a,
        });
      await f.page.evaluate(await decisionBundle());
      const baseline = await check();
      assert.equal(baseline.kind, 'unknown');
      await f.page.evaluate(await decisionBundle(control));
      const got = await check();
      assert.equal(got.kind, control === 'link' ? 'accepted' : 'refused');
      results.push({
        control,
        baseline: baseline.kind,
        badEvidence: got.kind,
        response: r,
        bytes,
        expected,
        authority: a,
      });
    }
    const vectors = JSON.parse(readFileSync('test/vectors/private-envelope.json')),
      v = vectors.vectors[0];
    for (const control of ['parent', 'position']) {
      await f.page.evaluate(await decisionBundle(control));
      const decoded = await f.page.evaluate((w) => {
        const e = Harness.decodeNetworkEnvelope(
          Uint8Array.from(w.match(/../g), (x) => parseInt(x, 16)),
        );
        return {
          workspace: e.workspace_id,
          credential: e.credential_id,
          position: e.seq,
          digest: Array.from(e.digest, (b) => b.toString(16).padStart(2, '0')).join(''),
          epoch: e.epoch,
          gen: e.gen,
        };
      }, v.expected.wire);
      const p = refusal(
          {
            ...decoded,
            digest: 'ab'.repeat(32),
            position: decoded.position + (control === 'position' ? 1 : 0),
          },
          current,
        ),
        other = refusal(
          { ...decoded, digest: 'ab'.repeat(32) },
          current,
          ZERO,
          'retired-generation',
        );
      const result = await f.page.evaluate(
        async ({ v, keys, p, other, control, a }) => {
          const unhex = (s) => Uint8Array.from(s.match(/../g), (x) => parseInt(x, 16));
          const signer = await crypto.subtle.importKey(
              'pkcs8',
              unhex('302e020100300506032b657004220420' + keys.seed),
              'Ed25519',
              false,
              ['sign'],
            ),
            pub = await crypto.subtle.importKey('raw', unhex(keys.public_key), 'Ed25519', false, [
              'verify',
            ]);
          const wire = await Harness.signSubmission(
              { lineage: a.lineage, envelope: unhex(v.expected.wire), parent: p },
              signer,
            ),
            decoded = Harness.decodeSubmission(wire);
          const record = (s) => ({ ...s, envelope: [...s.envelope], signature: [...s.signature] });
          const original = record(decoded);
          if (control === 'parent') decoded.parent = other;
          const e = Harness.decodeNetworkEnvelope(decoded.envelope);
          const route = {
            v: 2,
            workspace_id: e.workspace_id,
            credential_id: e.credential_id,
            epoch: e.epoch,
            gen: e.gen,
          };
          const authority = { ...a, workspace: e.workspace_id, tip: e.epoch };
          const bytes = Harness.encodeSubmission(decoded);
          await Harness.verifySubmission(bytes, route, pub, authority);
          return {
            original,
            accepted: record(Harness.decodeSubmission(bytes)),
            bytes: [...bytes],
            route,
            authority,
            envelopePosition: e.seq,
            publicKey: keys.public_key,
            badSubmissionAccepted: true,
          };
        },
        { v, keys: vectors.keys.device, p, other, control, a },
      );
      assert.equal(result.badSubmissionAccepted, true);
      await f.page.evaluate(await decisionBundle());
      const baseline = await f.page.evaluate(async ({ bytes, route, authority, publicKey }) => {
        const raw = Uint8Array.from(publicKey.match(/../g), (x) => parseInt(x, 16));
        const pub = await crypto.subtle.importKey('raw', raw, 'Ed25519', false, ['verify']);
        try {
          await Harness.verifySubmission(new Uint8Array(bytes), route, pub, authority);
          return { accepted: true };
        } catch (error) {
          return { accepted: false, reason: String(error) };
        }
      }, result);
      assert.equal(baseline.accepted, false);
      assert.match(
        baseline.reason,
        control === 'parent' ? /Submission signature mismatch/ : /Successor subject mismatch/,
      );
      results.push({ control, ...result, baseline });
    }
    artifact('controls.json', results);
  },
);
