/**
 * The one place the wide breakpoint is defined (TRD §8.1).
 *
 * The shell needs it in CSS to choose a `grid-template-areas`, and the gesture
 * layer needs it in JS because at wide the menu is already visible and there is
 * nothing to swipe to. Keeping the query here and setting the result as an
 * attribute means one number rather than two that can drift.
 */

import { useEffect, useState } from 'react';

export const WIDE_MEDIA_QUERY = '(min-width: 64rem)';

export type Breakpoint = 'overlay' | 'wide';

export const useBreakpoint = (): Breakpoint => {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() =>
    typeof window !== 'undefined' && window.matchMedia(WIDE_MEDIA_QUERY).matches
      ? 'wide'
      : 'overlay',
  );

  useEffect(() => {
    const query = window.matchMedia(WIDE_MEDIA_QUERY);
    const update = (): void => setBreakpoint(query.matches ? 'wide' : 'overlay');
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return breakpoint;
};
