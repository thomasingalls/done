import test from 'node:test';
import assert from 'node:assert/strict';
import { native, seed, prepare, genesis, admit, snapshot } from '../account-admission/fixtures.mjs';
import { evidence } from '../account-activation/fixtures.mjs';
for (const stage of ['begin', 'challenge', 'finish'])
  test(
    `unsigned ${stage} refusal retains progress and an exact retry can finish`,
    { timeout: 60000 },
    async (t) => {
      const f = await native(t),
        item = await f.ready('refusal-' + stage);
      await seed(f.page, item, [{ at: 4, remove: 0, insert: ' refusal trial', disk: false }]);
      await prepare(f.page, item);
      await genesis(f.page, item);
      await f.page.evaluate((stage) => {
        const real = admissionTransport[stage];
        let once = true;
        admissionTransport[stage] = (input) => {
          if (once) {
            once = false;
            return Promise.resolve({ ok: false, refusal: 'expired' });
          }
          return real(input);
        };
      }, stage);
      await assert.rejects(
        admit(f.page, item),
        new RegExp(`Promotion ${stage} did not complete: expired`),
      );
      const retained = await snapshot(f.page, item);
      assert.equal(
        retained.marker.stage,
        stage === 'begin' ? 'admission-requested' : 'admission-offered',
      );
      assert.equal(retained.marker.admission.receipt, null);
      const result = await admit(f.page, item);
      assert.equal(result.kind, 'promotion-receipt');
      evidence('refusal-' + stage, {
        retainedStage: retained.marker.stage,
        noReceiptFromHint: true,
        retry: 'promotion-receipt',
      });
    },
  );
