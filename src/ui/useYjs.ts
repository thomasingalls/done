/**
 * React's view of the CRDT.
 *
 * Yjs is the state; React only needs to be told when to look again. So this
 * returns a small derived *string* rather than the data itself — the components
 * read the document directly, which keeps a card's text out of component state
 * and therefore out of the re-render that would otherwise disturb a caret.
 *
 * Two things about that are load-bearing, and both were learned the hard way.
 *
 * ## The snapshot is derived, not counted
 *
 * The obvious version of this is a counter bumped by an observer. It is wrong
 * here, and quietly: a day is created lazily (TRD §4.2), the surfaces watching
 * it mount before it exists, and `useSyncExternalStore` subscribes in an effect
 * that runs *after* the child effect which creates the day. A counter only
 * records events it was present for, so that first one is lost and the surface
 * never learns its day arrived. Reading the value out of the document instead
 * makes the gap harmless: React re-reads the snapshot immediately after
 * subscribing and re-renders if it moved, whether or not an event was seen.
 *
 * For the same reason "no day" and "an empty day" must not produce the same
 * string. They are different states, and the transition between them is the one
 * that matters most.
 *
 * ## Nothing outside the snapshot may read the document during render
 *
 * React Compiler is enabled (see vite.config.ts) and memoizes on the assumption
 * that a function of the same inputs returns the same thing. A CRDT read breaks
 * that assumption: `day.get('done')` is `undefined` before the day exists and
 * an array afterwards, with no argument having changed. The compiler is
 * entitled to cache the first answer forever, and does.
 *
 * Keying a `useMemo` on the snapshot is not enough either: the compiler infers
 * its own dependencies from the body and is free to drop one that only appears
 * as a `void` reference. So the rule is stronger than "memoize carefully" —
 * **components do not read the document during render at all.** They read the
 * result of a hook, and the read happens inside `useYValue`, whose return value
 * the compiler has to treat as new on every render because it comes out of a
 * hook it cannot see into.
 *
 * ## Why the observation is deep
 *
 * A collection cannot be observed before it exists, so the parent has to be
 * watched — and having watched the parent, the same handler may as well cover
 * everything under it. The cost is a short string rebuilt and compared once per
 * transaction; when it has not moved, React does nothing. That is cheaper than
 * resubscribing a shallow observer every time a child appears, and much harder
 * to get subtly wrong.
 */

import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { YDoc, YText } from '../crdt';

/**
 * Structural rather than `Y.Map<T>`, because Yjs's generics are invariant and
 * this cares about exactly one thing: that the type can be observed.
 */
export interface YObservable {
  observe: (handler: () => void) => void;
  unobserve: (handler: () => void) => void;
}

export interface YDeepObservable {
  observeDeep: (handler: () => void) => void;
  unobserveDeep: (handler: () => void) => void;
}

/**
 * Watches a subtree and returns a string derived from it. `read` must derive
 * its value from the document rather than from anything the render closed over;
 * it does not need a stable identity, only a stable return value.
 */
export const useYWatch = (target: YDeepObservable | undefined, read: () => string): string => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      target?.observeDeep(onChange);
      return () => target?.unobserveDeep(onChange);
    },
    [target],
  );

  return useSyncExternalStore(subscribe, read, read);
};

/**
 * The document read itself, cached against the snapshot.
 *
 * `select` runs when — and only when — `key` reports that something moved, so
 * the value it returns keeps its identity between changes and is safe to hand
 * to a list as props. The cache is a ref rather than a `useMemo` on purpose:
 * this is the one place that reads a mutable store, and it has to be the one
 * place the compiler is told to leave alone.
 */
export const useYValue = <T>(
  target: YDeepObservable | undefined,
  key: () => string,
  select: () => T,
): T => {
  'use no memo';

  const snapshot = useYWatch(target, key);
  const cache = useRef<{ key: string; value: T } | null>(null);

  if (!cache.current || cache.current.key !== snapshot) {
    cache.current = { key: snapshot, value: select() };
  }
  return cache.current.value;
};

/**
 * A derived value spanning multiple Yjs roots. Recovery depends on the card
 * registry, canonical locations, and day arrays, so no one root is sufficient.
 */
export const useYDocValue = <T>(doc: YDoc | undefined, key: () => string, select: () => T): T => {
  'use no memo';

  const subscribe = useCallback(
    (onChange: () => void) => {
      const handler = (): void => onChange();
      doc?.on('afterTransaction', handler);
      return () => doc?.off('afterTransaction', handler);
    },
    [doc],
  );
  const snapshot = useSyncExternalStore(subscribe, key, key);
  const cache = useRef<{ key: string; value: T } | null>(null);

  if (!cache.current || cache.current.key !== snapshot) {
    cache.current = { key: snapshot, value: select() };
  }
  return cache.current.value;
};

/**
 * A single `Y.Text` whose identity is already stable — a card's own text, which
 * exists for as long as the card does. Shallow, because there is no parent to
 * wait for and nothing nested to miss.
 */
export const useYText = (text: YText | undefined): string => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const observable = text as YObservable | undefined;
      observable?.observe(onChange);
      return () => observable?.unobserve(onChange);
    },
    [text],
  );

  const read = useCallback(() => text?.toString() ?? '', [text]);
  return useSyncExternalStore(subscribe, read, read);
};
