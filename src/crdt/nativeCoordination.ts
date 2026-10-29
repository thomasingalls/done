/** Native coordination primitives only: no runtime installer, storage, keys or owner imports. */
export type WriteSessionRefusal =
  | 'invalid-slot'
  | 'invalid-options'
  | 'unsupported'
  | 'cancelled'
  | 'inactive'
  | 'cleanup-failed';

export class WriteSessionError extends Error {
  override readonly name = 'WriteSessionError';
  constructor(
    readonly code: WriteSessionRefusal,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Coordination names are independent of content/custody format versions. */
export const slotPermitName = (slotId: string): string => {
  if (typeof slotId !== 'string' || slotId.length === 0)
    throw new WriteSessionError(
      'invalid-slot',
      'A writer permit requires a nonempty slot identity.',
    );
  // JSON string encoding is injective over JS strings, including lone surrogates.
  return `done/slot-writer/${JSON.stringify(slotId)}`;
};

export interface AccountWorkerTicket {
  readonly v: 1;
  readonly slotId: string;
  readonly incarnation: string;
  readonly windowClient: string;
}
export const cohortNames = (slotId: string, incarnation: string) => {
  const slot = slotPermitName(slotId);
  return {
    slot,
    reservation: slot + '/worker-supervisor',
    anchor: slot + '/worker-window/' + incarnation,
    member: slot + '/worker-member/' + incarnation,
  };
};
export const inactive = () =>
  new DOMException('Account worker cohort is inactive.', 'InvalidStateError');
export const cancelled = () =>
  new DOMException('Account worker opening was cancelled.', 'AbortError');
export function captureTicket(input: AccountWorkerTicket): AccountWorkerTicket {
  if (!input || typeof input !== 'object') throw inactive();
  const fields = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(fields).sort().join(',') !== 'incarnation,slotId,v,windowClient' ||
    Object.values(fields).some((v) => !('value' in v))
  )
    throw inactive();
  if (
    input.v !== 1 ||
    typeof input.slotId !== 'string' ||
    !input.slotId ||
    typeof input.incarnation !== 'string' ||
    !/^[a-f0-9]{32}$/.test(input.incarnation) ||
    typeof input.windowClient !== 'string' ||
    !input.windowClient ||
    input.windowClient.length > 256
  )
    throw inactive();
  return Object.freeze({ ...input });
}

export function requireNativeLocks(): LockManager {
  if (globalThis.isSecureContext !== true || !globalThis.navigator?.locks)
    throw new Error('Web Locks requires a supported secure context.');
  return globalThis.navigator.locks;
}
