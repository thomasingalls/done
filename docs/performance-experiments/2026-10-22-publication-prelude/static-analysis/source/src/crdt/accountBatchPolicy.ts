import type { BatchTiming } from './batchWindow';

/** Measured Account policy; the reference build retains the previous scheduling behavior. */
export function accountBatchPolicy(value: string | undefined): {
  publication?: BatchTiming;
  localFlush?: BatchTiming;
} {
  if (value === 'reference') return {};
  const match = /^(publication|coordinated)-(1000|2000)$/.exec(value || 'coordinated-2000');
  if (!match) throw Error('Invalid VITE_ACCOUNT_BATCH');
  const timing = Object.freeze({ quietMs: 300, maxMs: Number(match[2]) });
  return Object.freeze({
    publication: timing,
    ...(match[1] === 'coordinated' ? { localFlush: timing } : {}),
  });
}
