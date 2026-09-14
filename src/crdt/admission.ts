/** Ordered admission over the real factor-unlocked carriers; application wiring is a separate owner. */
import { openJournalSession, type CustodyAuthority, type JournalSession } from './custody';
import { mark, ADMISSION_LOAD_START, ADMISSION_LOAD_READY } from '../lib/marks';
import {
  createAdmissionOwner,
  type AdmissionOptions,
  type AdmissionSession,
} from './admissionQueue';
export {
  AdmissionError,
  MAX_PENDING_BYTES,
  MAX_PENDING_ITEMS,
  FLUSH_DELAY_MS,
} from './admissionQueue';
export type {
  AdmissionOptions,
  AdmissionSession,
  AdmissionTicket,
  AdmissionReceipt,
  AdmissionStatus,
  AcceptedUpdate,
} from './admissionQueue';
export type { PrepareIntent } from './admissionDocument';

export const openAdmissionSession = async (
  authority: CustodyAuthority,
  code: string,
  options: AdmissionOptions & { signal?: AbortSignal },
): Promise<AdmissionSession> => {
  // Capture required application validators before obtaining keys. They are trusted synchronous adapters.
  if (typeof options?.prepare !== 'function' || typeof options?.validateReceive !== 'function')
    throw new TypeError('Admission requires a command preparer and receive validator.');
  const captured = { prepare: options.prepare, validateReceive: options.validateReceive };
  let carrier: JournalSession | undefined;
  try {
    carrier = await openJournalSession(
      authority,
      code,
      options.signal ? { signal: options.signal } : {},
    );
    mark(ADMISSION_LOAD_START);
    const session = await createAdmissionOwner(carrier, captured);
    mark(ADMISSION_LOAD_READY);
    return session;
  } catch (cause) {
    await carrier?.close();
    throw cause;
  }
};
