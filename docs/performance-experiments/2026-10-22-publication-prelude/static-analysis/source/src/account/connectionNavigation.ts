/** A navigation attempt distinguishes starting again from reloading retained progress. */
export const newConnectionHref = (slotId: string) =>
  '/connect/unlock?slot=' +
  encodeURIComponent(slotId) +
  '&begin=' +
  crypto.randomUUID().replaceAll('-', '');
