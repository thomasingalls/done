/** Closed command data only. Native account verification and the Window fence remain mandatory. */
export interface WorkerLocalBaselineCommand {
  readonly kind: 'install' | 'advance';
  readonly expectedRevision?: number;
}
export function captureWorkerLocalBaselineCommand(value: unknown): WorkerLocalBaselineCommand {
  const fail = () => new Error('Worker local-history command is invalid.');
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    throw fail();
  const fields = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(fields);
  if (ownKeys.some((key) => typeof key !== 'string')) throw fail();
  const keys = ownKeys.sort().join(',');
  if (
    !['kind', 'expectedRevision,kind'].includes(keys) ||
    Object.values(fields).some((field) => !('value' in field))
  )
    throw fail();
  const kind = fields['kind']!.value;
  const revision = fields['expectedRevision']?.value;
  if (
    !['install', 'advance'].includes(kind) ||
    (Object.hasOwn(fields, 'expectedRevision') && (!Number.isSafeInteger(revision) || revision < 1))
  )
    throw fail();
  return { kind, ...(revision !== undefined ? { expectedRevision: revision } : {}) };
}
