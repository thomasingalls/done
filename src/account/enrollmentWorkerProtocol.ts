/** Closed UI data only. Signed enrollment progress and custody stay in the native owner. */
import type { EnrollmentView } from './deviceEnrollment';
import type { EnrollmentProgress } from '../lib/enrollmentProgress';
import { credentialFields } from '../crdt/ownedCredentialPrompt';
import { workerMessageBytes } from '../crdt/workerChannel';
export interface EnrollmentBootstrapData {
  role: 'existing' | 'new';
  workspaceId?: string;
  invitation?: unknown;
  begin?: string;
}
export function captureEnrollmentBootstrap(input: unknown): EnrollmentBootstrapData {
  workerMessageBytes(input);
  const v = input as EnrollmentBootstrapData;
  credentialFields(input, [
    'role',
    ...['workspaceId', 'invitation', 'begin'].filter((k) => Object.hasOwn(input as object, k)),
  ]);
  if (!['existing', 'new'].includes(v.role)) throw Error('Enrollment role changed');
  for (const k of ['workspaceId', 'begin'] as const)
    if (v[k] !== undefined && (typeof v[k] !== 'string' || v[k]!.length > 4096))
      throw Error('Enrollment route changed');
  return structuredClone(v);
}
const commands = [
  'notificationsStart',
  'notificationsStop',
  'initialize',
  'refresh',
  'enroll',
  'reconnect',
  'compare',
  'cancel',
  'openWriting',
] as const;
export function captureEnrollmentCommand(input: unknown) {
  workerMessageBytes(input);
  credentialFields(
    input,
    Object.hasOwn(input as object, 'value') ? ['command', 'value'] : ['command'],
  );
  const v = input as { command: (typeof commands)[number]; value?: string };
  if (
    !commands.includes(v.command) ||
    (v.command === 'compare') !== Object.hasOwn(v, 'value') ||
    (v.value !== undefined && (typeof v.value !== 'string' || v.value.length > 4096))
  )
    throw Error('Enrollment command changed');
  return structuredClone(v);
}
export type EnrollmentPresentation = Omit<EnrollmentView, 'editor'> & {
  editor?: { actorId: string; accountId: string };
};
const kinds = [
  'reconnect',
  'locked',
  'invite',
  'enroll',
  'waiting',
  'compare',
  'display',
  'approved',
  'certified',
  'editing',
  'mismatch',
  'expired',
  'restart-required',
  'removal-required',
  'cancelled',
];
export function enrollmentPresentation(input: unknown): EnrollmentPresentation {
  if (!input || typeof input !== 'object') throw Error('Enrollment presentation changed');
  const out: Record<string, unknown> = {};
  for (const k of [
    'kind',
    'message',
    'link',
    'code',
    'retryPending',
    'canCancel',
    'canOpenWriting',
  ]) {
    const d = Object.getOwnPropertyDescriptor(input, k);
    if (d) {
      if (!('value' in d)) throw Error('Enrollment accessor');
      if (d.value !== undefined) out[k] = d.value;
    }
  }
  const d = Object.getOwnPropertyDescriptor(input, 'editor');
  if (d) {
    if (!('value' in d)) throw Error('Enrollment accessor');
    if (d.value) {
      const editor: Record<string, unknown> = {};
      for (const k of ['actorId', 'accountId']) {
        const field = Object.getOwnPropertyDescriptor(d.value, k);
        if (
          !field ||
          !('value' in field) ||
          typeof field.value !== 'string' ||
          !field.value ||
          field.value.length > 4096
        )
          throw Error('Enrollment identity changed');
        editor[k] = field.value;
      }
      out['editor'] = editor;
    }
  }
  workerMessageBytes(out);
  if (
    !kinds.includes(out['kind'] as string) ||
    typeof out['message'] !== 'string' ||
    out['message'].length > 4096 ||
    (out['kind'] === 'editing') !== Object.hasOwn(out, 'editor')
  )
    throw Error('Enrollment presentation changed');
  for (const k of ['link', 'code'])
    if (out[k] !== undefined && (typeof out[k] !== 'string' || (out[k] as string).length > 4096))
      throw Error('Enrollment text changed');
  for (const k of ['retryPending', 'canCancel', 'canOpenWriting'])
    if (out[k] !== undefined && typeof out[k] !== 'boolean') throw Error('Enrollment flag changed');
  return Object.freeze(structuredClone(out)) as EnrollmentPresentation;
}
export function enrollmentProgressPresentation(input: unknown): EnrollmentProgress | null {
  workerMessageBytes(input);
  if (input === null) return null;
  const v = input as EnrollmentProgress;
  const counters = v.stage === 'history' || v.stage === 'sources';
  credentialFields(v, counters ? ['stage', 'completed', 'total'] : ['stage']);
  if (
    ![
      'baseline',
      'sources',
      'history',
      'local-writing',
      'snapshot',
      'checking',
      'publishing',
      'delivery',
      'installation',
      'certification',
    ].includes(v.stage)
  )
    throw Error('Enrollment progress changed');
  if (counters) {
    const c = v as { completed: number; total: number | null };
    if (
      !Number.isSafeInteger(c.completed) ||
      c.completed < 0 ||
      (!(v.stage === 'history' && c.total === null) &&
        (!Number.isSafeInteger(c.total) || c.total! < c.completed))
    )
      throw Error('Enrollment counters changed');
  }
  return Object.freeze(structuredClone(v));
}

export interface EnrollmentNotificationPresentation {
  generation: number;
  connected: boolean;
  event: 'ready' | 'hint' | 'content' | 'resume' | null;
}
export function enrollmentNotificationPresentation(
  input: unknown,
): EnrollmentNotificationPresentation {
  workerMessageBytes(input);
  credentialFields(input, ['generation', 'connected', 'event']);
  const v = input as EnrollmentNotificationPresentation;
  if (
    !Number.isSafeInteger(v.generation) ||
    v.generation < 0 ||
    typeof v.connected !== 'boolean' ||
    ![null, 'ready', 'hint', 'content', 'resume'].includes(v.event) ||
    (v.generation === 0) !== (v.event === null)
  )
    throw Error('Enrollment notification changed');
  return Object.freeze(structuredClone(v));
}
