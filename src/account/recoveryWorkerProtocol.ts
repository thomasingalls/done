/** Fixed recovery screen data. No one-use opening, factor cache, login or workspace crosses here. */
import { credentialFields } from '../crdt/ownedCredentialPrompt';
import { workerMessageBytes } from '../crdt/workerChannel';
export const recoverySteps = [
  'checking',
  'start',
  'recovery-code',
  'save-code',
  'confirm-code',
  'unlock',
  'review',
  'installed',
  'editing',
] as const;
export interface RecoveryPresentation {
  step: (typeof recoverySteps)[number];
  accountId: string;
  generated: string;
  error: string;
  editor?: { actorId: string; accountId: string };
}
const commands = [
  'inspect',
  'begin',
  'prepare',
  'savedCode',
  'confirm',
  'unlock',
  'recover',
  'openWriting',
  'visit',
] as const;
export function captureRecoveryCommand(input: unknown) {
  workerMessageBytes(input);
  credentialFields(
    input,
    Object.hasOwn(input as object, 'value') ? ['command', 'value'] : ['command'],
  );
  const v = input as { command: (typeof commands)[number]; value?: string };
  if (
    !commands.includes(v.command) ||
    ['prepare', 'confirm', 'unlock', 'visit'].includes(v.command) !== Object.hasOwn(v, 'value') ||
    (v.value !== undefined && (typeof v.value !== 'string' || v.value.length > 4096))
  )
    throw Error('Recovery command changed');
  return structuredClone(v);
}
export function recoveryPresentation(input: unknown): RecoveryPresentation {
  workerMessageBytes(input);
  credentialFields(
    input,
    Object.hasOwn(input as object, 'editor')
      ? ['step', 'accountId', 'generated', 'error', 'editor']
      : ['step', 'accountId', 'generated', 'error'],
  );
  const v = input as RecoveryPresentation;
  if (!recoverySteps.includes(v.step)) throw Error('Recovery screen changed');
  for (const k of ['accountId', 'generated', 'error'] as const)
    if (typeof v[k] !== 'string' || v[k].length > 4096) throw Error('Recovery display changed');
  if (v.generated && !['save-code', 'confirm-code'].includes(v.step))
    throw Error('Recovery code display out of scope');
  if ((v.step === 'editing') !== Object.hasOwn(v, 'editor')) throw Error('Recovery editor changed');
  if (v.editor) {
    credentialFields(v.editor, ['actorId', 'accountId']);
    if (
      typeof v.editor.actorId !== 'string' ||
      !v.editor.actorId ||
      v.editor.actorId.length > 4096 ||
      v.editor.accountId !== v.accountId ||
      !v.accountId
    )
      throw Error('Recovery identity changed');
  }
  return Object.freeze(structuredClone(v));
}
