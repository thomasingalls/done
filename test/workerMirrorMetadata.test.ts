// @vitest-environment node
/** Controlled Window mirror model only; native authority stays in the real browser regression. */
import { afterEach, expect, it } from 'vitest';
import { fixture, cleanupMirrorFixtures, scope } from './fixtures/accountMirror';
afterEach(cleanupMirrorFixtures);
it('a durable actor rename survives the immediately following non-text command and later flush', async () => {
  const f = await fixture(),
    w = await f.open();
  await w.command({ kind: 'actor', patch: { name: 'Updated fixture name' } }).accepted;
  await w.whenDurable();
  expect(w.read().actors.find((a) => a.id === scope.principalId)?.name).toBe(
    'Updated fixture name',
  );
  await w.command({
    kind: 'compose',
    to: { date: '2026-10-28', section: 'done' },
    text: 'First writing',
  }).accepted;
  expect(w.read().actors.find((a) => a.id === scope.principalId)?.name).toBe(
    'Updated fixture name',
  );
  await w.whenDurable();
  expect(w.read().actors.find((a) => a.id === scope.principalId)?.name).toBe(
    'Updated fixture name',
  );
});
