import test from 'node:test';
import assert from 'node:assert/strict';
import {
  native,
  seed,
  prepare,
  genesis,
  admit,
  handoff,
  classify,
  snapshot,
  inventory,
  args,
  boundary,
  indexBoundary,
  stable,
  waitHit,
  abandon,
  handoffBundle,
} from './fixtures.mjs';
const ready = async (f, id, alg) => {
  const item = await f.ready(id, alg);
  await seed(f.page, item, [{ at: 4, remove: 0, insert: ' journal writing', disk: false }]);
  await prepare(f.page, item);
  await genesis(f.page, item);
  await admit(f.page, item);
  return item;
};
test(
  'handoff selects exactly one Account route and cold classifies offline with passkey plus device factor',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await ready(f, 'main'),
      before = await inventory(f.page);
    const result = await handoff(f.page, item);
    assert.equal(result.kind, 'account-selected');
    assert.equal(result.principalId, item.scope.principalId);
    assert.equal(result.workspaceId, item.scope.workspaceId);
    assert.equal((await snapshot(f.page, item)).marker.stage, 'handoff-selected');
    const after = await inventory(f.page);
    await f.setup(f.page);
    await f.page.route('**/account/**', (route) => route.abort());
    assert.equal((await classify(f.page, { ...item, recoveryCode: undefined })).kind, 'account');
    assert.equal(await inventory(f.page), after);
    assert.notEqual(before, after);
    assert.equal(stable(before, item.slotId), stable(after, item.slotId));
  },
);

test(
  'real browser ES256 passkey assertion completes handoff and offline startup',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await ready(f, 'es256', -7);
    const cdp = await f.context.newCDPSession(f.page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    await cdp.send('WebAuthn.addCredential', {
      authenticatorId,
      credential: {
        credentialId: Buffer.from(item.key.id, 'base64url').toString('base64'),
        isResidentCredential: true,
        rpId: 'localhost',
        privateKey: item.key.pair.privateKey
          .export({ format: 'der', type: 'pkcs8' })
          .toString('base64'),
        userHandle: Buffer.from(item.accountId, 'base64url').toString('base64'),
        signCount: 0,
      },
    });
    const install = () =>
      f.page.evaluate(() => {
        window.assertPasskey = async (req) => {
          const b = req.credentialId.replaceAll('-', '+').replaceAll('_', '/');
          const id = Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
          const credential = await navigator.credentials.get({
            publicKey: {
              challenge: req.challenge,
              rpId: req.rpId,
              allowCredentials: [{ type: 'public-key', id }],
              userVerification: 'required',
            },
          });
          const r = credential.response;
          window.browserSignature = [...new Uint8Array(r.signature)];
          return {
            credentialId: credential.id,
            authenticatorData: new Uint8Array(r.authenticatorData),
            clientDataJSON: new Uint8Array(r.clientDataJSON),
            signature: new Uint8Array(r.signature),
          };
        };
      });
    await install();
    assert.equal((await handoff(f.page, item)).kind, 'account-selected');
    assert.equal((await f.page.evaluate(() => browserSignature))[0], 0x30);
    await f.setup(f.page);
    await install();
    await f.page.route('**/account/**', (route) => route.abort());
    assert.equal((await classify(f.page, item)).kind, 'account');
  },
);

for (const stage of ['handoff-prepared', 'index', 'handoff-selected'])
  for (const side of ['before', 'after'])
    test(
      `renderer interruption ${side} ${stage} commit resumes exactly`,
      { timeout: 30000 },
      async (t) => {
        const f = await native(t),
          item = await ready(f, stage + side),
          before = await inventory(f.page);
        if (stage === 'index') await indexBoundary(f.page, side);
        else await boundary(f.page, stage, side);
        await f.page.evaluate((item) => {
          window.work = Harness.finishPromotionHandoff({
            ...item,
            pin,
            proveAuthority: prove,
            transport,
            bindingTransport,
            assertPasskey,
          }).then(
            (v) => v,
            (e) => String(e),
          );
        }, args(item));
        await waitHit(f.page);
        const retained = (await snapshot(f.page, item)).marker;
        if (side === 'before')
          assert.match(await f.page.evaluate(() => work), /transaction did not complete/);
        else {
          const cdp = await f.context.newCDPSession(f.page),
            crash = f.page.waitForEvent('crash');
          void cdp.send('Page.crash').catch(() => {});
          await crash;
        }
        await f.page.close();
        f.page = await f.context.newPage();
        await f.setup(f.page);
        const result = await handoff(f.page, item);
        assert.equal(result.kind, 'account-selected');
        if (retained.handoff)
          assert.deepEqual((await snapshot(f.page, item)).marker.handoff, retained.handoff);
        assert.equal(stable(await inventory(f.page), item.slotId), stable(before, item.slotId));
        assert.equal((await classify(f.page, item)).kind, 'account');
        const after = await inventory(f.page);
        assert.deepEqual(await handoff(f.page, item), result);
        assert.equal(await inventory(f.page), after);
      },
    );

test(
  'binding and passkey refusals precede any index mutation; replay cannot reopen a new attempt',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await ready(f, 'refuse'),
      before = await inventory(f.page);
    await f.page.evaluate(() => {
      const call = bindingTransport;
      window.assertCalls = 0;
      const assertion = assertPasskey;
      window.assertPasskey = (r) => {
        assertCalls++;
        return assertion(r);
      };
      window.bindingTransport = async (input) => {
        const p = await call(input);
        p.stored.bindingSignature = '00'.repeat(64);
        return p;
      };
    });
    await assert.rejects(handoff(f.page, item), /signature/);
    assert.equal(await f.page.evaluate(() => assertCalls), 0);
    assert.equal(await inventory(f.page), before);
    await f.setup(f.page);
    await assert.rejects(handoff(f.page, { ...item, code: 'wrong' }));
    assert.equal(await inventory(f.page), before);
    await f.page.evaluate(() => {
      const call = assertPasskey;
      window.assertPasskey = async (request) => {
        window.saved = await call(request);
        return saved;
      };
    });
    await handoff(f.page, item);
    await f.page.evaluate(() => {
      window.assertPasskey = async () => saved;
    });
    const after = await inventory(f.page);
    await assert.rejects(classify(f.page, item), /challenge/);
    assert.equal(await inventory(f.page), after);
    await assert.rejects(abandon(f.page, item));
    assert.equal(await inventory(f.page), after);
  },
);

test(
  'missing, closed and changed Account routes refuse without repair or Local fallback',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await ready(f, 'routes');
    await handoff(f.page, item);
    const marker = (await snapshot(f.page, item)).marker,
      destination = marker.handoff.destination;
    for (const bad of [
      null,
      { ...destination, status: 'closed' },
      { ...destination, stores: [] },
      { ...destination, stores: [{ ...destination.stores[0], dbName: 'elsewhere' }] },
      { ...destination, account: { ...destination.account, epochHead: '00'.repeat(32) } },
    ]) {
      await f.page.evaluate(({ item, bad }) => Harness.putSlot(item.slotId, bad), {
        item: args(item),
        bad,
      });
      const before = await inventory(f.page);
      await assert.rejects(classify(f.page, item));
      await assert.rejects(handoff(f.page, item));
      assert.equal(await inventory(f.page), before);
    }
    await f.page.evaluate(({ item, destination }) => Harness.putSlot(item.slotId, destination), {
      item: args(item),
      destination,
    });
    assert.equal((await classify(f.page, item)).kind, 'account');
  },
);

test(
  'passkey fault control actually selects and classifies with an invalid assertion',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await ready(f, 'control'),
      before = await inventory(f.page);
    await f.page.evaluate(() => {
      const call = assertPasskey;
      window.assertPasskey = async (req) => ({
        ...(await call(req)),
        signature: (window.invalidHandoffSignature = new Uint8Array(64)),
      });
    });
    await assert.rejects(handoff(f.page, item), /signature/);
    const baselineInventory = await inventory(f.page);
    assert.equal(baselineInventory, before);
    await f.page.evaluate(await handoffBundle('passkey'));
    const accepted = await handoff(f.page, item),
      classified = await classify(f.page, item);
    assert.equal(accepted.kind, 'account-selected');
    assert.deepEqual(classified, { ...accepted, kind: 'account', detached: false });
    if (process.env.ACCOUNT_REPORT_DIR) {
      const { writeFileSync } = await import('node:fs'),
        { join } = await import('node:path');
      writeFileSync(
        join(process.env.ACCOUNT_REPORT_DIR, 'control-passkey.json'),
        JSON.stringify(
          {
            baseline: 'invalid signature refused',
            baselineUnchanged: baselineInventory === before,
            signature: await f.page.evaluate(() =>
              Array.from(invalidHandoffSignature, (b) => b.toString(16).padStart(2, '0')).join(''),
            ),
            expected: {
              slotId: item.slotId,
              accountId: item.accountId,
              principalId: item.scope.principalId,
              workspaceId: item.scope.workspaceId,
            },
            accepted,
            classified,
          },
          null,
          2,
        ),
      );
    }
  },
);

test(
  'cancelled index acknowledgement retains the permit until the native commit drains',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await ready(f, 'drain'),
      other = await f.context.newPage();
    await f.setup(other);
    await indexBoundary(f.page, 'after');
    await f.page.evaluate((item) => {
      window.abort = new AbortController();
      window.work = Harness.finishPromotionHandoff({
        ...item,
        pin,
        proveAuthority: prove,
        transport,
        bindingTransport,
        assertPasskey,
        signal: abort.signal,
      }).then(
        (v) => v,
        (e) => String(e),
      );
    }, args(item));
    await waitHit(f.page);
    await f.page.evaluate(() => abort.abort());
    await other.evaluate((item) => {
      window.finished = false;
      window.work = Harness.finishPromotionHandoff({
        ...item,
        pin,
        proveAuthority: prove,
        transport,
        bindingTransport,
        assertPasskey,
      }).then((v) => {
        finished = true;
        return v;
      });
    }, args(item));
    assert.ok((await other.evaluate(() => navigator.locks.query())).pending.length);
    assert.equal(await other.evaluate(() => finished), false);
    await f.page.evaluate(() => release());
    await f.page.evaluate(() => work);
    assert.equal((await other.evaluate(() => work)).kind, 'account-selected');
  },
);

test(
  '24 generated handoff histories preserve independent writing and source inventory across aborted commits and restart',
  { timeout: 90000 },
  async (t) => {
    const { default: fc } = await import('fast-check');
    const { openCandidate } = await import('../account-genesis/oracle.mjs');
    const { writeFileSync } = await import('node:fs'),
      { join } = await import('node:path');
    const f = await native(t),
      histories = [];
    let index = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          ops: fc.array(
            fc.record({
              at: fc.nat(80),
              remove: fc.nat(5),
              insert: fc.string({ minLength: 1, maxLength: 12 }),
              disk: fc.boolean(),
            }),
            { minLength: 1, maxLength: 8 },
          ),
          reverse: fc.boolean(),
          fault: fc.constantFrom(
            'none',
            'handoff-prepared',
            'index',
            'handoff-selected',
            'lost-binding',
            'bad-passkey',
          ),
          retries: fc.integer({ min: 1, max: 3 }),
        }),
        async (history) => {
          await f.setup(f.page);
          const item = await f.ready('generated-' + index++);
          let text = 'base';
          for (const op of history.ops) {
            const at = op.at % (text.length + 1);
            text =
              text.slice(0, at) +
              op.insert +
              text.slice(at + Math.min(op.remove, text.length - at));
          }
          const expected = await seed(f.page, item, history.ops, history.reverse);
          assert.equal(expected.state.json.master, text);
          await prepare(f.page, item);
          await genesis(f.page, item);
          await admit(f.page, item);
          const before = await inventory(f.page),
            candidate = (await snapshot(f.page, item)).marker.genesis;
          assert.deepEqual(
            await f.page.evaluate(
              (bytes) => Harness.decode(bytes),
              [...openCandidate(candidate, item.draft, item.recoveryCode)],
            ),
            expected.state,
          );
          if (history.fault.startsWith('handoff-')) await boundary(f.page, history.fault, 'before');
          if (history.fault === 'index') await indexBoundary(f.page, 'before');
          if (history.fault === 'lost-binding')
            await f.page.evaluate(() => {
              const call = bindingTransport;
              window.bindingTransport = async (input) => {
                await call(input);
                throw Error('lost binding reply');
              };
            });
          if (history.fault === 'bad-passkey')
            await f.page.evaluate(() => {
              const call = assertPasskey;
              window.assertPasskey = async (req) => ({
                ...(await call(req)),
                credentialId: 'wrong',
              });
            });
          if (history.fault !== 'none') {
            await assert.rejects(handoff(f.page, item));
            assert.equal(stable(await inventory(f.page), item.slotId), stable(before, item.slotId));
            await assert.rejects(classify(f.page, item));
          }
          await f.setup(f.page);
          const result = await handoff(f.page, item),
            after = await inventory(f.page);
          assert.equal(result.principalId, item.scope.principalId);
          assert.equal(result.workspaceId, item.scope.workspaceId);
          assert.equal(stable(after, item.slotId), stable(before, item.slotId));
          for (let n = 0; n < history.retries; n++) {
            await f.setup(f.page);
            // The offline startup owner must neither invoke a transport nor need the saved recovery factor.
            await f.page.evaluate(() => {
              window.fetch = () => {
                throw Error('unexpected network');
              };
            });
            const classified = await classify(f.page, { ...item, recoveryCode: undefined });
            assert.deepEqual(classified, { ...result, kind: 'account', detached: false });
            assert.equal(await inventory(f.page), after);
          }
          histories.push({ ...history, status: 'passed' });
        },
      ),
      { seed: 9272026, numRuns: 24, endOnFailure: true },
    );
    if (process.env.ACCOUNT_REPORT_DIR)
      writeFileSync(
        join(process.env.ACCOUNT_REPORT_DIR, 'generated-native.json'),
        JSON.stringify({ seed: 9272026, histories }, null, 2) + '\n',
      );
  },
);

test(
  'actual previous reader and Local owners refuse the Account handoff carrier',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await ready(f, 'previous');
    await handoff(f.page, item);
    const before = await inventory(f.page);
    await assert.rejects(prepare(f.page, item));
    await assert.rejects(genesis(f.page, item));
    await assert.rejects(admit(f.page, item));
    await assert.rejects(abandon(f.page, item));
    await assert.rejects(
      f.page.evaluate((item) => Harness.readText(item.scope, item.code), args(item)),
      /retained storage format/,
    );
    await f.page.evaluate(await handoffBundle('old-reader'));
    const calls = await f.page.evaluate(() => window.calls);
    await assert.rejects(handoff(f.page, item), /Malformed preparation|Unsupported promotion/);
    await assert.rejects(classify(f.page, item), /Malformed preparation|Unsupported promotion/);
    assert.equal(await f.page.evaluate(() => window.calls), calls);
    assert.equal(await inventory(f.page), before);
  },
);

test(
  'missing or damaged provenance refuses startup without creating or rewriting carriers',
  { timeout: 30000 },
  async (t) => {
    const f = await native(t),
      item = await ready(f, 'provenance');
    await handoff(f.page, item);
    const rows = await f.page.evaluate(() => Harness.rows());
    for (const row of rows.filter((r) => r.key[0] === item.slotId)) {
      await f.page.evaluate((key) => Harness.remove(key), row.key);
      const before = await inventory(f.page);
      await assert.rejects(classify(f.page, item));
      assert.equal(await inventory(f.page), before);
      await f.page.evaluate((row) => Harness.put(row.key, row.value), row);
    }
    const marker = (await snapshot(f.page, item)).marker;
    await f.page.evaluate(
      ({ item, marker }) =>
        Harness.put([item.slotId, 'application-upgrade'], { ...marker, mac: new Uint8Array(32) }),
      { item: args(item), marker },
    );
    const damaged = await inventory(f.page);
    await assert.rejects(classify(f.page, item));
    assert.equal(await inventory(f.page), damaged);
    await f.page.evaluate(
      ({ item, marker }) => Harness.put([item.slotId, 'application-upgrade'], marker),
      { item: args(item), marker },
    );
    const restored = await inventory(f.page);
    await assert.rejects(classify(f.page, { ...item, code: 'wrong' }));
    assert.equal(await inventory(f.page), restored);
    assert.equal((await classify(f.page, item)).kind, 'account');
  },
);
