/** Private, unmounted selection metadata owner. Tokens carry no document or admission authority. */
import type { RelativeSelection } from './workspaceCommands';

declare const snapshotBrand: unique symbol;
export interface SelectionSnapshot {
  readonly [snapshotBrand]: true;
}
export type SelectionPositions = Map<string, RelativeSelection>;
export type SelectionMetadata = Map<'before' | 'after', SelectionSnapshot>;

const record = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  Boolean(
    value &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key)),
  );
const natural = (value: unknown): boolean =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const id = (value: unknown): boolean =>
  record(value, ['client', 'clock']) && natural(value['client']) && natural(value['clock']);
const position = (value: unknown): boolean =>
  record(value, ['type', 'tname', 'item', 'assoc']) &&
  Number.isSafeInteger(value['assoc']) &&
  (value['item'] === null || id(value['item'])) &&
  ((value['type'] === null && typeof value['tname'] === 'string' && value['tname'].length > 0) ||
    (id(value['type']) && value['tname'] === null));

/** Validate cloned data only. Resolution against a live Y.Doc belongs to the workspace. */
function validate(value: unknown): asserts value is SelectionPositions {
  if (!(value instanceof Map)) throw Error('Invalid selection snapshot value');
  for (const [key, selected] of value) {
    if (
      typeof key !== 'string' ||
      !(key === 'master' || (key.startsWith('card:') && key.length > 5)) ||
      !record(selected, ['ranges', 'main']) ||
      !Array.isArray(selected['ranges']) ||
      !selected['ranges'].length ||
      Object.keys(selected['ranges']).length !== selected['ranges'].length ||
      Object.keys(selected['ranges']).some((key, index) => key !== String(index)) ||
      !natural(selected['main']) ||
      (selected['main'] as number) >= selected['ranges'].length ||
      !selected['ranges'].every(
        (range: unknown) =>
          record(range, ['anchor', 'head']) && position(range['anchor']) && position(range['head']),
      )
    )
      throw Error('Invalid selection snapshot value');
  }
}

export const createSelectionSnapshots = () => {
  // No strong token inventory or per-branch release: dropping one metadata map must not
  // invalidate a snapshot retained by a sibling. GC timing is deliberately not observable.
  let snapshots: WeakMap<SelectionSnapshot, SelectionPositions> | undefined = new WeakMap();
  const live = () => {
    if (!snapshots) throw Error('Selection snapshot owner is closed');
  };
  const read = (token: SelectionSnapshot): SelectionPositions => {
    live();
    const value = snapshots!.get(token);
    if (!value) throw Error('Unknown or foreign selection snapshot');
    return value;
  };
  return Object.freeze({
    capture(positions: ReadonlyMap<string, RelativeSelection>): SelectionSnapshot {
      live();
      const value = structuredClone(positions);
      validate(value);
      // Native cloning can invoke a supplied accessor, including one that closes this owner.
      live();
      const token = Object.freeze(Object.create(null)) as SelectionSnapshot;
      snapshots!.set(token, value);
      return token;
    },
    restore(token: SelectionSnapshot): SelectionPositions {
      const value = read(token);
      return structuredClone(value);
    },
    fork(metadata: ReadonlyMap<'before' | 'after', SelectionSnapshot>): SelectionMetadata {
      live();
      if (!(metadata instanceof Map)) throw Error('Invalid selection snapshot metadata');
      const copy: SelectionMetadata = new Map();
      // Read Map entries directly; subclass iterator overrides are not part of this private schema.
      for (const [key, token] of Map.prototype.entries.call(metadata)) {
        if (key !== 'before' && key !== 'after') throw Error('Invalid selection snapshot metadata');
        read(token);
        copy.set(key, token);
      }
      return copy;
    },
    close(): void {
      snapshots = undefined;
    },
  });
};
