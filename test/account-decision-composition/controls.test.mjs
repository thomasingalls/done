import test from 'node:test';
import assert from 'node:assert/strict';
import {
  native,
  prepared,
  decide,
  bundle,
  open,
  close,
  record,
  deliveryStatus,
  census,
  assertRetained,
  evidence,
} from './fixtures.mjs';
for (const control of ['persist', 'closure', 'conflict'])
  test(
    `actual browser ${control} omission is detected with a genuinely service-issued decision`,
    { timeout: 45000 },
    async (t) => {
      const f = await native(t),
        kind = control === 'conflict' ? 'conflict' : 'closed',
        x = await prepared(f, 'control-' + control, kind);
      await decide(x);
      await f.page.evaluate(await bundle(control));
      await open(f.page, x.item);
      const result = await record(f.page, 1, x.answer),
        status = await deliveryStatus(f.page);
      assert.equal(result.recorded, true);
      assert.equal(
        status.state,
        'ready',
        'Omitted guard exposes its predicted incorrect readiness',
      );
      assert.throws(() => assert.equal(status.state, kind));
      await close(f.page);
      const retained = await census(f.page, x.item);
      if (control === 'persist')
        assert.throws(() => assertRetained(x, retained, true), /response row count/);
      else assertRetained(x, retained, true);
      evidence('control-' + control, {
        actualStatus: status,
        expectedState: kind,
        falseDurableReturn: control === 'persist',
        cryptoAndIssuerUnchanged: true,
        detected: true,
      });
    },
  );
