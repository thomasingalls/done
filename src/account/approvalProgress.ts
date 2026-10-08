/** Keep the completed first connection when a later connection uses the same custody carrier. */
import { same } from '../../account-protocol/admission';
import { closed } from '../../account-protocol/preparation';
type Vault = { load(): Promise<unknown>; save(value: unknown, check?: () => void): Promise<void> };
const split = (value: unknown) => {
  if ((value as { kind?: unknown } | null)?.kind !== 'membership-progress')
    return { wrapped: false, previous: value, current: null, archived: [] as unknown[] };
  const version = (value as { v?: unknown }).v;
  if (version !== 2 && version !== 3) throw Error('Unsupported membership progress');
  const v = closed(value, [
    'v',
    'kind',
    'previous',
    'current',
    ...(version === 3 ? ['archived'] : []),
  ]);
  const archived = version === 3 ? v['archived'] : [];
  if (!Array.isArray(archived) || archived.length > 64) throw Error('Invalid connection archive');
  return { wrapped: true, previous: v['previous'], current: v['current'], archived };
};
export function approvalProgress(vault: Vault, channel: 'legacy' | 'membership') {
  const wrap = (value: ReturnType<typeof split>, current: unknown, archived = value.archived) => ({
    v: archived.length ? 3 : 2,
    kind: 'membership-progress',
    previous: value.previous,
    current,
    ...(archived.length ? { archived } : {}),
  });
  return {
    archiveConnection: async (expected: unknown, next: unknown, check?: () => void) => {
      if (channel !== 'membership' || next === undefined || next === null)
        throw Error('Invalid connection archive');
      const value = split(await vault.load());
      if (!same(value.current, expected) || value.current === null || value.archived.length >= 64)
        throw Error('Connection archive changed or is full');
      await vault.save(wrap(value, next, [...value.archived, value.current]), check);
    },
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
        return vault.save(value.wrapped ? wrap({ ...value, previous: next }, null) : next, check);
      }
      return vault.save(wrap(value, next), check);
    },
  };
}
