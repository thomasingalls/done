import test from 'node:test';
import assert from 'node:assert/strict';
import { ScopedRequestBudget, REQUEST_LIMITS as L } from '../../account-service/requestBudget.ts';

test('exhausted sessions and invalid bearers cannot debit another session; refill is bounded', () => {
  let now = 0;
  const b = new ScopedRequestBudget(() => now);
  for (let i = 0; i < L.sessionBurst; i++) b.acquire('a')();
  for (let i = 0; i < 1000; i++) assert.equal(b.acquire('a'), undefined);
  for (let i = 0; i < 120; i++) assert.equal(b.invalid(), true);
  assert.equal(b.invalid(), false);
  for (let i = 0; i < L.sessionBurst; i++) b.acquire('b')();
  now = 1000 / L.sessionPerSecond;
  b.acquire('a')();
  assert.equal(b.acquire('a'), undefined);
  now = 0;
  assert.equal(b.acquire('a'), undefined, 'a backwards clock cannot create tokens');
});

test('shared rate and concurrency ceilings remain enforced; release is idempotent', () => {
  const b = new ScopedRequestBudget(() => 0);
  for (let s = 0; s < L.processBurst / L.sessionBurst; s++)
    for (let i = 0; i < L.sessionBurst; i++) b.acquire(String(s))();
  assert.equal(b.acquire('new-session'), undefined);
  const c = new ScopedRequestBudget(() => 0),
    releases = [];
  for (let i = 0; i < L.active; i++)
    releases.push(c.acquire(String(Math.floor(i / L.sessionActive))));
  assert.ok(releases.every(Boolean));
  assert.equal(c.acquire('new-session'), undefined);
  releases[0]();
  releases[0]();
  const one = c.acquire('new-session');
  assert.ok(one);
  assert.equal(c.acquire('new-session'), undefined, 'double release cannot free two slots');
  for (const release of releases) release();
  one();
  const d = new ScopedRequestBudget(() => 0);
  for (let i = 0; i < L.sessionActive; i++) assert.ok(d.acquire('a'));
  assert.equal(d.acquire('a'), undefined);
  assert.ok(d.acquire('b'));
});

test('session-key churn cannot erase a depleted allowance', () => {
  let now = 0;
  const b = new ScopedRequestBudget(() => now);
  for (let i = 0; i < L.sessions; i++) b.acquire(String(i))?.();
  assert.equal(b.acquire('overflow'), undefined);
  now = 10000;
  b.acquire('overflow')();
  for (let i = 0; i < L.sessionBurst - 1; i++) b.acquire('overflow')();
  b.acquire('other')();
  assert.equal(b.acquire('overflow'), undefined);
});
