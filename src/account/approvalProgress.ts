/** Keep the completed first connection when a later connection uses the same custody carrier. */
import { closed } from '../../account-protocol/preparation';
type Vault = { load(): Promise<unknown>; save(value: unknown, check?: () => void): Promise<void> };
const split = (value: unknown) => {
  if ((value as { kind?: unknown } | null)?.kind !== 'membership-progress')
    return { wrapped: false, previous: value, current: null };
  const v = closed(value, ['v', 'kind', 'previous', 'current']);
  if (v['v'] !== 2) throw Error('Unsupported membership progress');
  return { wrapped: true, previous: v['previous'], current: v['current'] };
};
export function approvalProgress(vault: Vault, channel: 'legacy' | 'membership') {
  return {
    load: async () => {
      const value = split(await vault.load());
      if (channel === 'legacy' && value.current !== null)
        throw Error('Additional-device setup requires its current owner');
      return channel === 'legacy' ? value.previous : value.current;
    },
    save: async (next: unknown, check?: () => void) => {
      if (next === undefined) throw Error('Approval progress is missing');
      const value = split(await vault.load());
      if (channel === 'legacy') {
        if (value.current !== null)
          throw Error('Additional-device setup requires its current owner');
        return vault.save(
          value.wrapped
            ? { v: 2, kind: 'membership-progress', previous: next, current: null }
            : next,
          check,
        );
      }
      return vault.save(
        { v: 2, kind: 'membership-progress', previous: value.previous, current: next },
        check,
      );
    },
  };
}
