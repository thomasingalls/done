import test from 'node:test';
import assert from 'node:assert/strict';
import {
  quantiles,
  inputLatencies,
  submissionCadence,
  displayedBacklog,
} from '../scripts/lib/sync-cadence-analysis.mjs';
const event = (at) => ({
  kind: 'beforeinput',
  at,
  trusted: true,
  focused: true,
  visible: 'visible',
});
const journey = () => ({
  startedAt: 100,
  typingFinishedAt: 201,
  offers: [
    { index: 0, scheduledAt: 100, at: 100, returnedAt: 101 },
    { index: 1, scheduledAt: 200, at: 200, returnedAt: 201 },
  ],
  probesAtDeadline: [
    {
      events: [event(100), event(200)],
      lengths: [
        { at: 99, length: 10 },
        { at: 102, length: 11 },
        { at: 203, length: 12 },
      ],
    },
    {
      events: [],
      lengths: [
        { at: 99, length: 20 },
        { at: 150, length: 21 },
        { at: 260, length: 22 },
      ],
    },
  ],
});
const request = (body = 'a', extra = {}) => ({
  label: 'Q0',
  phase: 'measured',
  path: '/account/delivery/submit',
  at: 100,
  headersAt: 130,
  status: 200,
  bodySha256: body.repeat(64),
  ...extra,
});
test('cadence reconstructs exact hand-derived local and peer input latencies', () => {
  const x = inputLatencies(journey(), 2);
  assert.deepEqual(
    x.keys.map((v) => [v.localMs, v.peerMs]),
    [
      [2, 50],
      [3, 60],
    ],
  );
  assert.equal(x.peer.observed.p95, 60);
  assert.equal(x.peer.complete, true);
});
test('cadence retains missing peer inputs and never invents a complete peer quantile', () => {
  const x = journey();
  x.probesAtDeadline[1].lengths.pop();
  const v = inputLatencies(x, 2);
  assert.equal(v.peer.complete, false);
  assert.equal(v.peer.missing, 1);
  assert.equal(v.keys[1].peerMs, null);
  assert.equal(v.peer.observed.n, 1);
});
test('cadence rejects a missing trusted input instead of shrinking the denominator', () => {
  const x = journey();
  x.probesAtDeadline[0].events.pop();
  assert.throws(() => inputLatencies(x, 2), /input evidence/);
});
test('cadence rejects an unfocused or untrusted offered workload', () => {
  const x = journey();
  x.probesAtDeadline[0].events[0].trusted = false;
  assert.throws(() => inputLatencies(x, 2), /input evidence/);
});
test('cadence rejects a missing display baseline', () => {
  const x = journey();
  x.probesAtDeadline[1].lengths.shift();
  assert.throws(() => inputLatencies(x, 2), /baseline/);
});
test('cadence preserves negative sub-millisecond clock samples without clamping', () => {
  const x = journey();
  x.offers[0].at = 101;
  x.probesAtDeadline[0].events[0].at = 101;
  x.probesAtDeadline[0].lengths[1].at = 100.8;
  assert.ok(inputLatencies(x, 2).keys[0].localMs < 0);
});
test('cadence rejects non-finite and reordered input observations', () => {
  const x = journey();
  x.offers[1].at = NaN;
  assert.throws(() => inputLatencies(x, 2), /Non-finite/);
  x.offers[1].at = 99;
  assert.throws(() => inputLatencies(x, 2), /Invalid offered input/);
});
test('cadence separates repeated exact request attempts from unique published bytes', () => {
  const x = submissionCadence([
    request(),
    request('a', { at: 200, headersAt: 240 }),
    request('b', { at: 300, headersAt: 350 }),
  ]);
  assert.equal(x.requests, 3);
  assert.equal(x.uniqueBodies, 2);
  assert.equal(x.repeatedBodyAttempts, 1);
  assert.equal(x.observedLatencyMs.p95, 50);
  assert.equal(x.interArrivalMs.p95, 100);
});
test('cadence does not borrow another account or later phase submissions', () => {
  const x = submissionCadence([
    request(),
    request('b', { label: 'H0' }),
    request('c', { phase: 'guards' }),
  ]);
  assert.equal(x.requests, 1);
  assert.equal(x.uniqueBodies, 1);
});
test('cadence preserves missing response observations and refused requests', () => {
  const x = submissionCadence([
    request(),
    request('b', { headersAt: undefined, status: undefined }),
    request('c', { status: 429 }),
  ]);
  assert.equal(x.responseObservationsComplete, false);
  assert.equal(x.observedLatencyMs.n, 2);
  assert.deepEqual(x.statuses, { 200: 1, 429: 1, unobserved: 1 });
});
test('cadence refuses missing byte identities or malformed HTTP timing', () => {
  assert.throws(() => submissionCadence([request('', {})]), /identity/);
  assert.throws(() => submissionCadence([request('a', { headersAt: 99 })]), /HTTP/);
});
test('displayed backlog normalizes unequal initial positions and integrates a known queue', () => {
  const x = displayedBacklog(
    [
      { at: 0, accepted: 37 },
      { at: 10, accepted: 39 },
      { at: 30, accepted: 40 },
    ],
    [
      { at: 0, received: 38 },
      { at: 20, received: 39 },
      { at: 40, received: 41 },
    ],
    0,
    50,
  );
  assert.equal(x.maxPendingDelta, 2);
  assert.equal(x.pendingAtEnd, 0);
  assert.equal(x.backlogAreaPositionMs, 50);
  assert.equal(x.baselineAccepted, 37);
  assert.equal(x.baselineReceived, 38);
});
test('displayed backlog retains a receiver-leading clock/progress difference', () => {
  const x = displayedBacklog(
    [
      { at: 0, accepted: 5 },
      { at: 20, accepted: 6 },
    ],
    [
      { at: 0, received: 8 },
      { at: 10, received: 9 },
    ],
    0,
    30,
  );
  assert.equal(x.minPendingDelta, -1);
  assert.equal(x.backlogAreaPositionMs, -10);
  assert.equal(x.pendingAtEnd, 0);
});
test('displayed backlog groups simultaneous observations without a manufactured peak', () => {
  const x = displayedBacklog(
    [
      { at: 0, accepted: 1 },
      { at: 10, accepted: 2 },
    ],
    [
      { at: 0, received: 1 },
      { at: 10, received: 2 },
    ],
    0,
    20,
  );
  assert.equal(x.maxPendingDelta, 0);
  assert.equal(x.backlogAreaPositionMs, 0);
});
test('displayed backlog preserves censored pending work at the window boundary', () => {
  const x = displayedBacklog(
    [
      { at: 0, accepted: 1 },
      { at: 10, accepted: 4 },
    ],
    [
      { at: 0, received: 1 },
      { at: 30, received: 4 },
    ],
    0,
    20,
  );
  assert.equal(x.pendingAtEnd, 3);
  assert.equal(x.backlogAreaPositionMs, 30);
});
test('displayed backlog refuses missing baselines, invalid counters and regressions', () => {
  assert.throws(() => displayedBacklog([], [{ at: 0, received: 1 }], 0, 20), /baseline/);
  assert.throws(
    () =>
      displayedBacklog(
        [
          { at: 0, accepted: 1 },
          { at: 10, accepted: 0 },
        ],
        [{ at: 0, received: 1 }],
        0,
        20,
      ),
    /regressed/,
  );
  assert.throws(
    () => displayedBacklog([{ at: 0, accepted: 1.5 }], [{ at: 0, received: 1 }], 0, 20),
    /counter/,
  );
});
test('empty observed latency is missing evidence rather than zero', () => {
  assert.deepEqual(quantiles([]), { n: 0 });
  assert.throws(() => quantiles([NaN]), /Non-finite/);
  assert.deepEqual(submissionCadence([]).observedLatencyMs, { n: 0 });
});
