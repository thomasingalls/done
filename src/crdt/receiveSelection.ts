/** Scheduling only. A selected publisher and every returned page still require fresh authority. */
export function createReceiveSelection() {
  let next = 0;
  let streak = 0;
  let previous: string | undefined;
  return {
    next(publishers: readonly string[]) {
      if (!publishers.length) throw Error('No eligible receive publisher');
      return publishers[next++ % publishers.length]!;
    },
    completed(publishers: readonly string[], publisher: string, progress: boolean) {
      const index = publishers.indexOf(publisher);
      if (index < 0) return;
      streak = progress ? (previous === publisher ? streak + 1 : 1) : 0;
      previous = publisher;
      // Four useful pages, then let other publishers reconcile. The outer scheduler
      // yields to the event loop and any due sender after EVERY page.
      if (progress && streak < 4) next = index;
      else {
        next = index + 1;
        streak = 0;
      }
    },
  };
}
