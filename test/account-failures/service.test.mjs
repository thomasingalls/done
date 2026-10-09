import test from 'node:test';
import assert from 'node:assert/strict';
import { ready } from '../account-service-delivery/fixtures.mjs';
import { evidence } from '../account-activation/fixtures.mjs';
test('service catch diagnostics are bounded and redact the thrown failure while withholding a decision', async (t) => {
  let fail = false,
    hits = 0;
  const x = await ready(t, {
    hook(point) {
      if (fail && point === 'before-commit') {
        hits++;
        throw Error('PRIVATE-writing-factor-token');
      }
    },
  });
  fail = true;
  const response = await x.call(x.make(1));
  assert.equal(response.kind, 'unknown');
  assert.equal(response.reason, 'storage-unavailable');
  assert.equal(hits, 1, 'The intended transaction fault actually ran');
  const events = x.f.core.diagnostics;
  assert(events.length);
  assert(events.some((e) => e.operation === 'submit' && e.phase === 'commit'));
  assert(!JSON.stringify(events).includes('PRIVATE'));
  evidence('service-diagnostics', { response, events });
});
