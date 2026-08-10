import { describe, expect, it } from 'vitest';
import { newId } from '../src/lib/id';

describe('newId', () => {
  it('creates a UUID when randomUUID is unavailable on plain HTTP', () => {
    const ownDescriptor = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });

    try {
      expect(newId()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      );
    } finally {
      if (ownDescriptor) Object.defineProperty(crypto, 'randomUUID', ownDescriptor);
      else delete (crypto as Partial<Crypto>).randomUUID;
    }
  });
});
