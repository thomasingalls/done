/** Follow the actual native owner's withdrawal, independently of the Window's advisory hints. */
import type { AdmissionCarrier } from './admissionQueue';
export function followWorkerNativeLifetime(
  owner: Pick<AdmissionCarrier, 'signal'>,
  root: AbortSignal,
  retire: () => void,
) {
  const signal = owner.signal;
  if (
    !(signal instanceof AbortSignal) ||
    !(root instanceof AbortSignal) ||
    typeof retire !== 'function'
  )
    throw Error('Native Worker lifetime is unavailable');
  let attached = true;
  const close = () => {
    if (!attached) return;
    attached = false;
    signal.removeEventListener('abort', withdraw);
    root.removeEventListener('abort', close);
  };
  const withdraw = () => {
    if (!attached) return;
    close();
    if (root.aborted) return;
    // Never await root drain inside the native abort dispatch or its own pending task.
    retire();
  };
  if (root.aborted) close();
  else {
    signal.addEventListener('abort', withdraw, { once: true });
    root.addEventListener('abort', close, { once: true });
    if (root.aborted) close();
    else if (signal.aborted) withdraw();
  }
  return Object.freeze({ close });
}
