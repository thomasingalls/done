/** Local authenticated encoding floor. It grants no permission to read, verify or write content. */
import { StorageCompatibilityError } from './storageCompatibility';
export const INBOUND_RECEIPT_VERSION_FIELD = 'inboundReceiptVersion';
export interface InboundReceiptVersion {
  inboundReceiptVersion?: 1;
}
export function inboundReceiptVersionFields(input: unknown): string[] {
  if (!input || typeof input !== 'object') return [];
  const field = Object.getOwnPropertyDescriptor(input, INBOUND_RECEIPT_VERSION_FIELD);
  if (!field) {
    if (INBOUND_RECEIPT_VERSION_FIELD in input) throw new StorageCompatibilityError();
    return [];
  }
  if (!field.enumerable || !Object.hasOwn(field, 'value') || field.value !== 1)
    throw new StorageCompatibilityError();
  return [INBOUND_RECEIPT_VERSION_FIELD];
}
export function captureInboundReceiptVersion(input: unknown): InboundReceiptVersion {
  return inboundReceiptVersionFields(input).length ? { inboundReceiptVersion: 1 } : {};
}
/** A retained reading has its own authenticated encoding scope. Never inherit the native
 * account's floor when constructing that reading's context. This copies syntax, not trust. */
export function withInboundReceiptScope<T extends object>(
  context: T,
  source: unknown,
): Omit<T, 'inboundReceiptVersion'> & InboundReceiptVersion {
  const { inboundReceiptVersion: _floor, ...rest } = context as T & InboundReceiptVersion;
  return { ...rest, ...captureInboundReceiptVersion(source) };
}
export function inboundReceiptMacTail(input: unknown): ['inboundReceiptVersion', 1][] {
  return inboundReceiptVersionFields(input).length ? [[INBOUND_RECEIPT_VERSION_FIELD, 1]] : [];
}
/** The authenticated old marker is compared again by the native caller before committing. */
export function requireMonotonicInboundReceiptVersion(previous: unknown, next: unknown): void {
  const before = inboundReceiptVersionFields(previous).length,
    after = inboundReceiptVersionFields(next).length;
  if (before && !after) throw new StorageCompatibilityError('Inbound receipt encoding regressed.');
}
