import assert from 'node:assert/strict';
import { sign, createHash } from 'node:crypto';
import { ready as enrollment, fresh, lp } from '../account-enrollment/fixtures.mjs';
import { authorityFixture } from '../account-authority/fixtures.mjs';
const hash = (v) => createHash('sha256').update(v).digest();
export async function setup(t, options = {}) {
  const authority = authorityFixture(t);
  let now = 1000;
  const config = { pin: authority.pin, operatorKey: authority.key };
  const x = await enrollment(t, { authority, sessions: config, now: () => now, ...options });
  const entry = x.candidate();
  entry.input.loginRetryKey = fresh();
  const begun = await x.enroll('begin', entry.input);
  assert.equal(begun.stage, 'challenge', JSON.stringify(begun));
  const context = begun.challenge.context;
  const prove = (label = 'done/enrollment-and-session-assertion/v1', edits = {}) => ({
    ...entry.input,
    candidate: undefined,
    attemptId: context.attemptId,
    response: x.account.key.assert(
      { options: { challenge: hash(lp(label, JSON.stringify(context))).toString('base64url') } },
      edits,
    ),
    possession: sign(
      null,
      lp('done/enrollment-preparation-possession/v1', JSON.stringify(context)),
      entry.key,
    ).toString('hex'),
  });
  const proof = JSON.parse(JSON.stringify(prove()));
  return {
    ...x,
    config,
    entry,
    begun,
    context,
    proof,
    prove: (...args) => JSON.parse(JSON.stringify(prove(...args))),
    setTime: (v) => {
      now = v;
    },
    finish: (p = proof) => x.enroll('finish', p),
  };
}
