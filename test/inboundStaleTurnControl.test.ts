// @vitest-environment node
import { expect, it } from 'vitest';
import { staleTurnModule } from './inbound-page/stale-turn-module';
it('the permanent dense-to-legacy stale-turn negative control breaks full/continuation equality and retained sequence while baseline passes', async () => {
  const baseline = await staleTurnModule(false);
  try {
    const result = await baseline.api.staleTurnCase();
    expect(result.same).toBe(true);
    expect(result.fullWrong).toEqual([]);
    expect(result.incrementalWrong).toEqual([]);
    expect(result.prefixes.map(([, p]) => p)).toEqual([9, 9]);
    expect(result.physical).toBe(4);
  } finally {
    await baseline.dispose();
  }
  const fault = await staleTurnModule(true);
  try {
    const result = await fault.api.staleTurnCase();
    expect(result.same).toBe(false);
    expect(result.fullWrong).toHaveLength(2);
    expect(result.fullWrong.map((r) => [r.position, r.envelopePosition])).toEqual([
      [9, 8],
      [9, 8],
    ]);
    expect(new Set(result.fullWrong.map((r) => r.publisher)).size).toBe(2);
    expect(result.incrementalWrong).toEqual([]);
    expect(result.prefixes.map(([, p]) => p)).toEqual([9, 9]);
  } finally {
    await fault.dispose();
  }
});
