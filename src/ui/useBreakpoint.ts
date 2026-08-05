/**
 * The one place the breakpoints are defined (TRD §8.1).
 *
 * They are needed in CSS to choose a `grid-template-areas` and in JS because
 * the gesture layer has to know what lies in each direction — at wide there is
 * nothing to swipe to, at medium only the menu, at narrow both. A media query
 * here plus a `matchMedia` there would be two copies of one number that can
 * disagree, so the query lives here and the result is set as an attribute.
 *
 * | Breakpoint | Menu             | Today | Goals            |
 * | ---------- | ---------------- | ----- | ---------------- |
 * | narrow     | off-screen left  | full  | off-screen right |
 * | medium     | behind a trigger | panel | panel            |
 * | wide       | panel            | panel | panel            |
 */

import { useEffect, useState } from 'react';

export const MEDIUM_MEDIA_QUERY = '(min-width: 48rem)';
export const WIDE_MEDIA_QUERY = '(min-width: 64rem)';

export type Breakpoint = 'narrow' | 'medium' | 'wide';

const current = (): Breakpoint => {
  if (typeof window === 'undefined') return 'narrow';
  if (window.matchMedia(WIDE_MEDIA_QUERY).matches) return 'wide';
  if (window.matchMedia(MEDIUM_MEDIA_QUERY).matches) return 'medium';
  return 'narrow';
};

export const useBreakpoint = (): Breakpoint => {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(current);

  useEffect(() => {
    const queries = [window.matchMedia(MEDIUM_MEDIA_QUERY), window.matchMedia(WIDE_MEDIA_QUERY)];
    const update = (): void => setBreakpoint(current());
    update();
    for (const query of queries) query.addEventListener('change', update);
    return () => {
      for (const query of queries) query.removeEventListener('change', update);
    };
  }, []);

  return breakpoint;
};

/** Whether the menu is a panel already, rather than something to swipe to. */
export const menuIsPanel = (breakpoint: Breakpoint): boolean => breakpoint === 'wide';

/** Whether Goals sits beside Today — which is what separates narrow from medium. */
export const goalsIsPanel = (breakpoint: Breakpoint): boolean => breakpoint !== 'narrow';
