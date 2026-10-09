import assert from 'node:assert/strict';
import { within } from '../legacy-cleanup/diagnostics.mjs';

// Unlike a Promise.race around an infinite loop, a timed-out poll stops scheduling work.
export async function poll(label, read, predicate = Boolean, ms = 10000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = await within(label, Math.max(1, deadline - Date.now()), read);
    if (predicate(value)) return value;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(25, Math.max(1, deadline - Date.now()))),
    );
  }
  throw Error(label + ' timed out');
}
export function denialConfig(text, { readonly, mandatory, beforeLaunch }) {
  assert.ok(readonly && mandatory && beforeLaunch, 'denial-runtime-preconditions');
  assert.deepEqual(JSON.parse(text), { DefaultJavaScriptSetting: 2 }, 'denial-exact-global-policy');
}
export function triggerVerdict({ denied, positiveWrite, delivered }) {
  if (!positiveWrite) return 'control-failed';
  if (!denied) return 'counterexample';
  return delivered ? 'exercised-no-write' : 'trigger-unproven';
}
