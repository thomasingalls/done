import { describe, expect, it } from 'vitest';
import {
  GENTLE_CONTEXT_KEY,
  gentleContextValue,
  readGentleContext,
} from '../src/ui/useGentleContext';

describe('gentle context browser preference', () => {
  it('defaults on for missing and unsupported values', () => {
    for (const value of [null, '', '1', 'true', 'corrupt'])
      expect(gentleContextValue(value)).toBe(true);
  });
  it('honors an explicit off value', () => {
    expect(gentleContextValue('0')).toBe(false);
  });
  it('reads only its presentation key', () => {
    const keys: string[] = [];
    expect(
      readGentleContext({
        getItem: (key) => {
          keys.push(key);
          return '0';
        },
      }),
    ).toBe(false);
    expect(keys).toEqual([GENTLE_CONTEXT_KEY]);
  });
  it('keeps the default when storage refuses access', () => {
    expect(
      readGentleContext({
        getItem: () => {
          throw Error('blocked');
        },
      }),
    ).toBe(true);
  });
});
