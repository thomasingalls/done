import test from 'node:test';
import assert from 'node:assert/strict';
import { GENESIS_LIMIT } from '../../account-protocol/genesis.ts';
import { COVERAGE_LIMIT } from '../../account-protocol/admission.ts';
import {
  native,
  prepare,
  genesis,
  seed,
  admit,
  snapshot,
  args,
  census,
  cold,
  watch,
  observations,
  report,
} from './fixtures.mjs';
for (const delta of [-1, 0, 1])
  test(
    `actual retained snapshot at 16 MiB ${delta >= 0 ? '+' : ''}${delta} bytes is bounded before checkpoint sealing`,
    { timeout: 180000 },
    async (t) => {
      const f = await native(t),
        item = await f.ready('snapshot-' + delta),
        target = GENESIS_LIMIT + delta;
      const expected = await f.page.evaluate(
        ({ item, target }) => Harness.seedSized(item.scope, item.code, target),
        { item: args(item), target },
      );
      assert.equal(expected.bytes, target);
      await prepare(f.page, item);
      const before = await census(f),
        source = await census(f, true);
      await watch(f);
      let candidate;
      const make = () =>
        f.page.evaluate(
          (item) =>
            Harness.preparePromotionGenesis({
              ...item,
              pin,
              proveAuthority: prove,
              transport,
            }).then((c) => ({
              ciphertextBytes: c.checkpoint.ct.length / 2,
              signature: c.signature,
            })),
          args(item),
        );
      if (delta <= 0) {
        candidate = await make();
        assert.equal(candidate.ciphertextBytes, target + 16);
        assert.deepEqual((await observations(f)).seals, [{ bytes: target, zero: true }]);
        assert.equal(await census(f, true), source);
        const retained = await census(f);
        await cold(f);
        await watch(f);
        assert.deepEqual(await make(), candidate);
        assert.equal((await observations(f)).seals.length, 0);
        assert.equal((await observations(f)).puts.length, 0);
        assert.equal(await census(f), retained);
      } else {
        await assert.rejects(make(), /Genesis checkpoint exceeds/);
        assert.deepEqual(await observations(f), { seals: [], puts: [] });
        assert.equal(await census(f), before);
        await cold(f, 'snapshotGuard');
        await watch(f);
        // Later parsing still refuses the oversize candidate. The removed early guard permits forbidden sealing first.
        await assert.rejects(make(), /Malformed|Invalid|bound|bytes/i);
        assert.deepEqual((await observations(f)).seals, [{ bytes: target, zero: true }]);
        assert.equal((await observations(f)).puts.length, 0);
        assert.equal(await census(f), before);
        await cold(f);
        await watch(f);
        await assert.rejects(make(), /Genesis checkpoint exceeds/);
        assert.deepEqual(await observations(f), { seals: [], puts: [] });
      }
      const recovered = await f.page.evaluate(
        (item) => Harness.recovered(item.scope, item.code),
        args(item),
      );
      assert.deepEqual(
        { bytes: recovered.bytes, sha256: recovered.sha256, textLength: recovered.textLength },
        expected,
      );
      report('snapshot-' + delta, {
        target,
        source: expected,
        actualYjsDocument: true,
        exactColdReplay: true,
        sourceUnchanged: true,
        ...(candidate
          ? { candidate }
          : { earlyRefusal: true, omittedGuardSealsBeforeParserRefusal: true }),
      });
    },
  );

for (const large of ['sv', 'ds'])
  for (const delta of [-1, 0, 1])
    test(
      `injected ${large} coverage tests the actual owner preflight at combined byte edge ${delta}, with an effective omission`,
      { timeout: 60000 },
      async (t) => {
        const f = await native(t),
          results = [];
        {
          await f.setup(f.page);
          const item = await f.ready('coverage-' + large + '-' + delta);
          await seed(f.page, item, []);
          await prepare(f.page, item);
          await genesis(f.page, item);
          const before = await census(f);
          await f.setup(f.page, '', true);
          const configure = () =>
            f.page.evaluate(
              ({ large, total }) => {
                window.testCoverageParts =
                  large === 'sv'
                    ? { sv: '00'.repeat(total - 2), ds: '0000' }
                    : { sv: '00', ds: '00'.repeat(total - 1) };
                window.admissionCalls = 0;
                admissionTransport.begin = async () => {
                  admissionCalls++;
                  throw Error('stop-at-begin');
                };
              },
              { large, total: COVERAGE_LIMIT + delta },
            );
          await configure();
          await watch(f);
          await assert.rejects(
            admit(f.page, item),
            delta > 0 ? /coverage exceeds byte bound/ : /stop-at-begin/,
          );
          assert.equal(await f.page.evaluate(() => admissionCalls), delta > 0 ? 0 : 1);
          if (delta > 0) {
            assert.deepEqual(await observations(f), { puts: [], seals: [] });
            assert.equal(await census(f), before);
            await cold(f, 'coverageGuard', true);
            await configure();
            await watch(f);
            await assert.rejects(admit(f.page, item), /stop-at-begin/);
            assert.equal(await f.page.evaluate(() => admissionCalls), 1);
            assert.equal((await snapshot(f.page, item)).marker.stage, 'admission-requested');
            assert.equal(
              (await observations(f)).puts.filter((p) => p.stage === 'admission-requested').length,
              1,
            );
          } else assert.equal((await snapshot(f.page, item)).marker.stage, 'admission-requested');
          // Actual retained source/candidate were never oversized; remove injection and complete the real admission.
          await cold(f);
          const receipt = await admit(f.page, item);
          assert.equal(receipt.kind, 'promotion-receipt');
          results.push({
            delta,
            combinedBytes: COVERAGE_LIMIT + delta,
            injectedAtVerifiedGenesisReturn: true,
            refusedBeforeRequestedAndBegin: delta > 0,
            omissionReachedRequestedAndBegin: delta > 0,
            realRetryCompleted: true,
          });
        }
        report('coverage-' + large + '-' + delta, {
          results,
          limitation:
            'Synthetic descriptors at the verified-genesis callback; not a 16 MiB Yjs coverage history.',
        });
      },
    );
