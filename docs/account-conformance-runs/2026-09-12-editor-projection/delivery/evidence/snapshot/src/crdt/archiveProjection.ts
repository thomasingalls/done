/** Derived text only, never admission authority. Bound ownership and detach every returned array. */
import { parseCollections, type Collections } from './serialize';
export const ARCHIVE_CACHE_ENTRIES = 512;
export const ARCHIVE_CACHE_CHARACTERS = 2 * 1024 * 1024;
export const createArchiveProjection = () => {
  const cache = new Map<string, { source: string; parsed: Collections; cost: number }>();
  let characters = 0;
  const remove = (date: string) => {
    const old = cache.get(date);
    if (old) characters -= old.cost;
    cache.delete(date);
  };
  return {
    read(date: string, source: string): Collections {
      let entry = cache.get(date);
      remove(date);
      if (!entry || entry.source !== source) {
        const parsed = parseCollections(source);
        entry = {
          source,
          parsed,
          cost:
            source.length +
            Object.values(parsed)
              .flat()
              .reduce((n, s) => n + s.length, 0),
        };
      }
      if (entry.cost <= ARCHIVE_CACHE_CHARACTERS) {
        while (
          cache.size >= ARCHIVE_CACHE_ENTRIES ||
          characters + entry.cost > ARCHIVE_CACHE_CHARACTERS
        )
          remove(cache.keys().next().value!);
        cache.set(date, entry);
        characters += entry.cost;
      }
      const p = entry.parsed;
      return { next: [...p.next], scheduled: [...p.scheduled], done: [...p.done] };
    },
    retain(dates: ReadonlySet<string>) {
      for (const date of cache.keys()) if (!dates.has(date)) remove(date);
    },
    clear() {
      cache.clear();
      characters = 0;
    },
  };
};
