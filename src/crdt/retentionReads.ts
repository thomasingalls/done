/** Process-local exclusion; abort is an optimization, the generation check is the fence. */
export function createRetentionReads(changed: () => Error) {
  let current = new AbortController(),
    paused = false,
    closed = false;
  return {
    capture() {
      if (paused || closed) throw changed();
      const held = current;
      return {
        signal: held.signal,
        check() {
          if (closed || paused || held !== current || held.signal.aborted) throw changed();
        },
      };
    },
    begin() {
      if (paused || closed) throw changed();
      paused = true;
      current.abort(changed());
      current = new AbortController();
      let active = true;
      return () => {
        if (active) {
          active = false;
          paused = false;
        }
      };
    },
    close() {
      closed = true;
      paused = true;
      current.abort(changed());
    },
  };
}
