import test from 'node:test';
import assert from 'node:assert/strict';
import { ScopedRequestBudget, REQUEST_LIMITS as L } from '../../account-service/requestBudget.ts';

const drain = (budget, key, count) => {
  for (let i = 0; i < count; i++) {
    const lease = budget.acquire(key);
    assert.ok(lease, `admission ${i}`);
    lease();
  }
};

test('one sequential batch uses one live slot while reserving its exact work count', () => {
  const budget = new ScopedRequestBudget(() => 0),
    leases = [];
  for (let i = 0; i < L.sessionActive; i++) {
    const lease = budget.acquire('a');
    assert.ok(lease);
    assert.equal(lease.reserveWork(4), true);
    leases.push(lease);
  }
  assert.equal(budget.acquire('a'), undefined);
  for (const lease of leases) {
    lease.settleWork(4);
    lease();
  }
  drain(budget, 'a', L.sessionBurst - 4 * L.sessionActive);
  assert.equal(budget.acquire('a'), undefined);
});

test('an unsuccessful work top-up debits neither a partial tail nor another session', () => {
  const budget = new ScopedRequestBudget(() => 0);
  drain(budget, 'a', L.sessionBurst - 3);
  const lease = budget.acquire('a');
  assert.equal(lease.reserveWork(4), false);
  lease.settleWork(0);
  lease();
  drain(budget, 'a', 2);
  assert.equal(budget.acquire('a'), undefined);
  drain(budget, 'b', L.sessionBurst);
});

test('unused tail is refunded once while the admission and started failed work stay charged', () => {
  const budget = new ScopedRequestBudget(() => 0),
    lease = budget.acquire('a');
  assert.equal(lease.reserveWork(4), true);
  lease.settleWork(2);
  lease.settleWork(0);
  lease();
  lease();
  drain(budget, 'a', L.sessionBurst - 2);
  assert.equal(budget.acquire('a'), undefined);
  assert.ok(budget.acquire('b'));
});

test('a malformed or wholly unstarted request still consumes one admission unit', () => {
  const budget = new ScopedRequestBudget(() => 0);
  for (let i = 0; i < L.sessionBurst; i++) {
    const lease = budget.acquire('a');
    assert.ok(lease);
    lease.settleWork(0);
    lease();
  }
  assert.equal(budget.acquire('a'), undefined);
});

test('closed and settled tickets cannot reserve or refund another request allowance', () => {
  const budget = new ScopedRequestBudget(() => 0),
    closed = budget.acquire('a');
  assert.equal(closed.reserveWork(4), true);
  closed();
  assert.equal(closed.reserveWork(8), false);
  closed.settleWork(0);
  const settled = budget.acquire('a');
  assert.equal(settled.reserveWork(4), true);
  settled.settleWork(1);
  assert.equal(settled.reserveWork(4), false);
  settled();
  drain(budget, 'a', L.sessionBurst - 5);
  assert.equal(budget.acquire('a'), undefined);
});

test('invalid counts cannot enlarge, refund or partially alter a live work reservation', () => {
  const budget = new ScopedRequestBudget(() => 0),
    lease = budget.acquire('a');
  for (const n of [0, -1, 1.5, NaN, Infinity, L.sessionBurst + 1])
    assert.equal(lease.reserveWork(n), false);
  assert.equal(lease.reserveWork(4), true);
  for (const n of [-1, 1.5, NaN, Infinity, 5]) assert.throws(() => lease.settleWork(n));
  assert.equal(lease.reserveWork(4), false);
  lease.settleWork(4);
  lease();
  drain(budget, 'a', L.sessionBurst - 4);
  assert.equal(budget.acquire('a'), undefined);
});

test('refill and unused refunds remain capped at burst and reject backwards-clock minting', () => {
  let now = 0;
  const budget = new ScopedRequestBudget(() => now),
    lease = budget.acquire('a');
  assert.equal(lease.reserveWork(4), true);
  now = 100000;
  lease.settleWork(1);
  lease();
  drain(budget, 'a', L.sessionBurst);
  assert.equal(budget.acquire('a'), undefined);
  now = 0;
  assert.equal(budget.acquire('a'), undefined);
  now = 100000 + 1000 / L.sessionPerSecond;
  const next = budget.acquire('a');
  assert.ok(next);
  next();
  assert.equal(budget.acquire('a'), undefined);
});

test('process work reservations are atomic and refunds restore only unused shared units', () => {
  const budget = new ScopedRequestBudget(() => 0);
  for (let s = 0; s < 3; s++) drain(budget, String(s), L.sessionBurst);
  drain(budget, 'fourth', L.sessionBurst - 3);
  const lease = budget.acquire('last');
  assert.equal(lease.reserveWork(4), false);
  lease.settleWork(0);
  lease();
  drain(budget, 'other', 2);
  assert.equal(budget.acquire('unused'), undefined);
});
