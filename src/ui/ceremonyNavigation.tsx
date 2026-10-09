import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { RouterHistory } from '@tanstack/react-router';

export type PreviewNavigation = {
  history: RouterHistory;
  href: string;
  go: (href: string, replace?: boolean, settled?: boolean) => Promise<void>;
};
export const PreviewNavigationContext = createContext<PreviewNavigation | null>(null);

/** URLs name views, never authorize protocol transitions. Owners decide which views still exist. */
export function useCeremonyNavigation(options: {
  base: string;
  step: string | null;
  parent: string;
  visit: (step: string) => boolean;
  close: () => Promise<void>;
  warnOnLeave?: () => boolean;
  preserveEntry?: boolean;
}) {
  const navigation = useContext(PreviewNavigationContext);
  const latest = useRef(options);
  latest.current = options;
  const departing = useRef(false);
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const identity = navigation ? new URL(navigation.href, location.origin).search : '';
  const previous = useRef<string | null>(null);
  const incoming = useRef<string | null>(null);

  useEffect(() => {
    if (!navigation) return;
    const { history, go } = navigation;
    return history.block({
      enableBeforeUnload: () => latest.current.warnOnLeave?.() === true,
      blockerFn: async ({ nextLocation, action }) => {
        if (departing.current) return true;
        const current = latest.current;
        const sameFlow =
          nextLocation.pathname.startsWith(current.base + '/') && nextLocation.search === identity;
        const step = nextLocation.pathname.slice(current.base.length + 1);
        if (sameFlow && current.step) {
          incoming.current = nextLocation.href;
          if (step === current.step || current.visit(step)) return false;
          incoming.current = null;
        }
        // Back into an irreversible step means leaving, not rerunning it. A stale
        // Forward entry is treated the same way; cold entries are classified by inspect().
        if (
          current.warnOnLeave?.() &&
          !window.confirm(
            'Leave setup? This browser will discard the recovery code shown in this ceremony. Make sure you saved your copy. Your setup progress will be kept.',
          )
        )
          return true;
        departing.current = true;
        setLeaving(true);
        try {
          await current.close();
        } catch {
          setError('This workspace could not finish closing. Reload to resume saved progress.');
          return true;
        }
        if (
          (sameFlow || action === 'BACK' || action === 'GO') &&
          nextLocation.href !== current.parent
        ) {
          // TanStack restores a blocked POP asynchronously. Wait for that actual
          // restoration before redirecting, rather than racing it with a timer.
          const redirect = () => {
            void go(current.parent, true, true);
          };
          if (['BACK', 'FORWARD', 'GO'].includes(action))
            window.addEventListener('popstate', () => queueMicrotask(redirect), { once: true });
          else queueMicrotask(redirect);
          return true;
        }
        return false;
      },
    });
  }, [navigation, identity]);

  useEffect(() => {
    if (!navigation || !options.step || departing.current) return;
    // During a route transition React may still render the outgoing parent with
    // the incoming location. It must not redirect that destination back into itself.
    if (!new URL(navigation.href, location.origin).pathname.startsWith(options.base + '/')) return;
    if (incoming.current && navigation.href !== incoming.current) return;
    incoming.current = null;
    const target = options.base + '/' + options.step + identity;
    if (navigation.href !== target) {
      // Cold entry always follows authenticated inspection, not its requested URL.
      const replace = previous.current === null && !options.preserveEntry;
      previous.current = options.step;
      void navigation.go(target, replace, true);
    } else previous.current = options.step;
  }, [navigation, options.base, options.step, options.preserveEntry, identity]);

  return {
    enabled: navigation !== null,
    leaving,
    error,
    back: () => navigation?.history.back(),
  };
}
