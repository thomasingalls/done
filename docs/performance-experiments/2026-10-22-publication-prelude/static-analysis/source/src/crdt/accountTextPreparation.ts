/** Private Account-only ordered text adapter. Never exported from an application workspace. */
import type { Bytes } from './custodyCrypto';
import type { SourceUpdate } from './sourceCapture';
export const accountTextPreparation = Symbol('account-text-preparation');
export interface AccountTextCandidate {
  readonly update: Bytes;
  readonly sources: SourceUpdate[];
  /** Called only after durability and canonical promotion; must apply these exact bytes. */
  accept(update: Bytes, revision: number): void;
}
export interface AccountTextPreparation {
  prepare(
    input: Bytes,
    head: Readonly<{ writer: number; clock: number; revision: number }>,
  ): AccountTextCandidate | undefined;
}
