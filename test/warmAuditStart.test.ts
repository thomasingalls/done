import { describe, expect, it } from 'vitest';
import {
  createWarmAuditStart,
  WARM_AUDIT_FORCE_ROWS,
  WARM_AUDIT_INPUT_QUIET_MS,
} from '../src/crdt/warmAuditStart';

const fixture = () => {
  let at = 0;
  const policy = createWarmAuditStart(() => at);
  return { policy, time: (next: number) => (at = next) };
};

describe('discretionary warm audit start', () => {
  it('a due device with no local input can audit immediately', () => {
    const f = fixture();
    f.time(300_000);
    expect(f.policy.delay(0)).toBe(0);
    expect(f.policy.delay(256)).toBe(0);
  });

  it('waits the complete 1000ms quiet period after local input', () => {
    const f = fixture();
    f.policy.input();
    expect(f.policy.delay(256)).toBe(WARM_AUDIT_INPUT_QUIET_MS);
    f.time(999);
    expect(f.policy.delay(256)).toBe(1);
    f.time(1000);
    expect(f.policy.delay(256)).toBe(0);
  });

  it('each further input moves the start to its own quiet boundary', () => {
    const f = fixture();
    f.policy.input();
    f.time(750);
    f.policy.input();
    f.time(1000);
    expect(f.policy.delay(768)).toBe(750);
    f.time(1749);
    expect(f.policy.delay(768)).toBe(1);
    f.time(1750);
    expect(f.policy.delay(768)).toBe(0);
  });

  it('queued foreground work defers a due audit even after input is quiet', () => {
    const f = fixture();
    f.policy.input();
    const settle = f.policy.foreground();
    f.time(5000);
    expect(f.policy.delay(256)).toBeUndefined();
    settle();
    expect(f.policy.delay(256)).toBe(0);
  });

  it('waits for every queued job without relying on settlement order', () => {
    const f = fixture();
    const first = f.policy.foreground();
    const second = f.policy.foreground();
    second();
    expect(f.policy.delay(256)).toBeUndefined();
    first();
    expect(f.policy.delay(256)).toBe(0);
  });

  it('duplicate settlement cannot clear another job', () => {
    const f = fixture();
    const first = f.policy.foreground();
    const second = f.policy.foreground();
    first();
    first();
    expect(f.policy.delay(256)).toBeUndefined();
    second();
    expect(f.policy.delay(256)).toBe(0);
  });

  it('the physical row cap forces an attempt despite input and queued work', () => {
    const f = fixture();
    f.policy.input();
    f.policy.foreground();
    expect(f.policy.delay(WARM_AUDIT_FORCE_ROWS - 1)).toBeUndefined();
    expect(f.policy.delay(WARM_AUDIT_FORCE_ROWS)).toBe(0);
    expect(f.policy.delay(WARM_AUDIT_FORCE_ROWS + 1)).toBe(0);
  });

  it('continuous typing cannot defer every attempt beyond the row cap', () => {
    const f = fixture();
    for (let rows = 256; rows <= 1280; rows += 256) {
      f.time(rows);
      f.policy.input();
      expect(f.policy.delay(rows)).toBe(rows < 1024 ? 1000 : 0);
    }
  });

  it('a completed job does not waive a more recent input quiet period', () => {
    const f = fixture();
    const settle = f.policy.foreground();
    f.time(300);
    f.policy.input();
    f.time(500);
    settle();
    expect(f.policy.delay(256)).toBe(800);
  });

  it('clock rollback starts a bounded new quiet period', () => {
    const f = fixture();
    f.time(100_000);
    f.policy.input();
    f.time(50);
    expect(f.policy.delay(256)).toBe(1000);
    f.time(1050);
    expect(f.policy.delay(256)).toBe(0);
  });

  it('close permanently prevents attempts and late settlement cannot rearm it', () => {
    const f = fixture();
    const settle = f.policy.foreground();
    f.policy.close();
    f.policy.input();
    settle();
    f.policy.foreground()();
    expect(f.policy.delay(0)).toBeUndefined();
    expect(f.policy.delay(1024)).toBeUndefined();
    f.time(Number.NaN);
    expect(f.policy.delay(1024)).toBeUndefined();
  });

  it('invalid internal row pressure refuses instead of bypassing the cap', () => {
    const f = fixture();
    for (const rows of [-1, 1.5, Number.NaN, Infinity])
      expect(() => f.policy.delay(rows)).toThrow('Invalid warm audit pressure');
  });

  it('invalid internal clock readings refuse instead of granting an idle start', () => {
    const f = fixture();
    for (const at of [-1, Number.NaN, Infinity]) {
      f.time(at);
      expect(() => f.policy.input()).toThrow('Invalid warm audit clock');
      expect(() => f.policy.delay(256)).toThrow('Invalid warm audit clock');
    }
  });
});
