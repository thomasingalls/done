import type { SessionTask } from './writeSession';

export const RETENTION_STAGES = [
  'durability',
  'reading',
  'opening',
  'verifying',
  'building',
  'coverage',
  'current',
  'installing',
  'readback',
  'complete',
] as const;
export interface RetentionProgress {
  readonly stage: (typeof RETENTION_STAGES)[number];
  readonly completed?: number;
  readonly total?: number;
}
export type RetentionProgressSink = (progress: RetentionProgress) => void;
/** Presentation only: copy fixed labels/numbers, never retain arbitrary observer payloads. */
export function copyRetentionProgress(value: RetentionProgress): RetentionProgress | undefined {
  try {
    if (!value || typeof value !== 'object') return;
    const { stage, completed, total } = value;
    if (!RETENTION_STAGES.includes(stage)) return;
    if (completed !== undefined || total !== undefined) {
      if (
        !Number.isSafeInteger(completed) ||
        !Number.isSafeInteger(total) ||
        completed! < 0 ||
        total! < completed!
      )
        return;
      return Object.freeze({
        stage,
        completed: completed!,
        total: total!,
      });
    }
    return Object.freeze({ stage });
  } catch {
    return;
  }
}
export function reportRetentionProgress(
  sink: RetentionProgressSink | undefined,
  value: RetentionProgress,
) {
  if (!sink) return;
  try {
    const snapshot = copyRetentionProgress(value);
    if (snapshot) sink(snapshot);
  } catch {
    /* Presentation cannot change verification or storage outcomes. */
  }
}

export interface MaintenanceInterruptionConditions {
  readonly queuePriority?: boolean;
  readonly suspended?: boolean;
  readonly shadowActivity?: boolean;
  readonly journal?: boolean;
  readonly handoff?: boolean;
  readonly authorityStamp?: boolean;
  readonly other?: boolean;
}
const interruptionFields = [
  'queuePriority',
  'suspended',
  'shadowActivity',
  'journal',
  'handoff',
  'authorityStamp',
  'other',
] as const;
const interruptionConditions = new WeakMap<MaintenanceInterrupted, readonly number[]>();
const conditionMask = (input: MaintenanceInterruptionConditions): number => {
  const fields = Object.getOwnPropertyDescriptors(input);
  let mask = 0;
  for (const key of Reflect.ownKeys(input)) {
    const field = typeof key === 'string' ? fields[key] : undefined;
    const index = interruptionFields.indexOf(key as (typeof interruptionFields)[number]);
    if (!field || !('value' in field) || typeof field.value !== 'boolean' || index < 0)
      return 1 << interruptionFields.length;
    if (field.value) mask |= 1 << index;
  }
  return mask;
};
/** Discretionary maintenance yielded; never a storage/integrity refusal or mutation permission. */
export class MaintenanceInterrupted extends Error {
  override readonly name = 'MaintenanceInterrupted';
  constructor(conditions: readonly MaintenanceInterruptionConditions[] = []) {
    super('Content maintenance yielded to foreground work.');
    interruptionConditions.set(this, conditions.length ? conditions.map(conditionMask) : [0]);
  }
}
/** Add observed conditions when another guarded boundary is already unwinding. */
export function addMaintenanceInterruptionConditions(
  cause: MaintenanceInterrupted,
  conditions: MaintenanceInterruptionConditions,
) {
  const mask = conditionMask(conditions);
  if (mask)
    interruptionConditions.set(cause, [...(interruptionConditions.get(cause) ?? [0]), mask]);
  return cause;
}
/** Only locally constructed, entirely priority-only observations shorten a retry clock. */
export function isPriorityOnlyMaintenanceInterruption(cause: unknown): boolean {
  const observed =
    cause instanceof MaintenanceInterrupted ? interruptionConditions.get(cause) : undefined;
  return !!observed?.length && observed.every((mask) => mask === 1);
}

const maintenanceTasks = new WeakSet<SessionTask>();
export const isMaintenanceTask = (task: SessionTask): boolean => maintenanceTasks.has(task);

/** Keep the writer lifetime and native settlement ownership. Cancellation prevents the next
 * effect; it does not release admission while an earlier transaction or crypto job is in flight.
 * Yield only before starting async work, never inside an active IDB transaction callback. */
export function maintenanceTask(parent: SessionTask, interrupt?: AbortSignal): SessionTask {
  if (!interrupt) return parent;
  let yieldedAt = performance.now();
  const check = () => {
    if (interrupt.aborted) throw new MaintenanceInterrupted();
  };
  const task: SessionTask = {
    signal: parent.signal,
    step(effect) {
      parent.step(check);
      return parent.step(effect);
    },
    wait(start) {
      return parent.wait(async () => {
        parent.step(check);
        if (performance.now() - yieldedAt >= 8) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          yieldedAt = performance.now();
          parent.step(check);
        }
        // Return owned outputs to their existing cleanup scopes even if input arrives while
        // this operation is pending. The next step/wait checks cancellation before any effect.
        return start();
      });
    },
  };
  maintenanceTasks.add(task);
  return task;
}
