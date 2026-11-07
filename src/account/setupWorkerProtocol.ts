/** Fixed presentation/command data only. Native verification never accepts this as authority. */
import type { SetupState } from './setupProgress';
import { credentialFields } from '../crdt/ownedCredentialPrompt';
import { workerMessageBytes } from '../crdt/workerChannel';
export const setupCommands = [
  'inspect',
  'start',
  'savedDeviceCode',
  'confirmDeviceCode',
  'unlock',
  'passkey',
  'resumeSetup',
  'savedRecovery',
  'confirmRecovery',
  'saveName',
  'restart',
  'approvePasskey',
  'visit',
] as const;
export type SetupCommand = (typeof setupCommands)[number];
export interface SetupCommandInput {
  command: SetupCommand;
  value?: string;
}
const textCommands = [
  'start',
  'confirmDeviceCode',
  'unlock',
  'confirmRecovery',
  'saveName',
  'visit',
];
export function captureSetupCommand(input: unknown): SetupCommandInput {
  workerMessageBytes(input);
  credentialFields(
    input,
    Object.hasOwn(input as object, 'value') ? ['command', 'value'] : ['command'],
  );
  const v = input as SetupCommandInput;
  if (
    !setupCommands.includes(v.command) ||
    textCommands.includes(v.command) !== Object.hasOwn(v, 'value') ||
    (v.value !== undefined && (typeof v.value !== 'string' || v.value.length > 4096))
  )
    throw Error('Setup command changed');
  return structuredClone(v);
}
type Presentation<T> = T extends unknown ? Omit<T, 'workspace' | 'sync' | 'devices'> : never;
export type SetupPresentation = Presentation<SetupState>;
const fields = [
  'kind',
  'error',
  'message',
  'detail',
  'code',
  'returning',
  'accountName',
  'accountId',
  'fresh',
  'requestedName',
  'description',
  'disposition',
  'actorId',
] as const;
const kinds = [
  'intro',
  'unlock',
  'resume-setup',
  'passkey',
  'confirm-passkey',
  'confirm-recovery',
  'name',
  'confirm-device-code',
  'save-recovery',
  'save-device-code',
  'working',
  'approve-passkey',
  'storage-blocked',
  'ready',
];
export function setupPresentation(state: unknown): SetupPresentation {
  if (!state || typeof state !== 'object') throw Error('Setup presentation changed');
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const d = Object.getOwnPropertyDescriptor(state, field);
    if (d) {
      if (!('value' in d)) throw Error('Setup presentation accessor');
      if (d.value !== undefined) out[field] = d.value;
    }
  }
  workerMessageBytes(out);
  if (!kinds.includes(out['kind'] as string)) throw Error('Setup presentation kind changed');
  for (const field of [
    'error',
    'message',
    'detail',
    'code',
    'accountName',
    'accountId',
    'requestedName',
    'description',
    'actorId',
  ])
    if (
      out[field] !== undefined &&
      (typeof out[field] !== 'string' || (out[field] as string).length > 4096)
    )
      throw Error('Setup presentation field changed');
  for (const field of ['returning', 'fresh'])
    if (out[field] !== undefined && typeof out[field] !== 'boolean')
      throw Error('Setup presentation flag changed');
  if (out['disposition'] !== undefined) {
    credentialFields(out['disposition'], ['kind', 'reason']);
    const d = out['disposition'] as { kind: unknown; reason: unknown };
    if (
      typeof d.kind !== 'string' ||
      typeof d.reason !== 'string' ||
      d.kind.length > 64 ||
      d.reason.length > 4096
    )
      throw Error('Setup disposition changed');
  }
  if (
    ['save-recovery', 'save-device-code'].includes(out['kind'] as string) &&
    typeof out['code'] !== 'string'
  )
    throw Error('Setup display code missing');
  if (out['kind'] === 'ready' && typeof out['actorId'] !== 'string')
    throw Error('Setup actor missing');
  return Object.freeze(structuredClone(out)) as SetupPresentation;
}
