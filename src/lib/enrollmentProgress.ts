/** Presentation only. These observations never authorize a transition or survive an operation. */
export type HistoryReplayProgress =
  | { stage: 'baseline' }
  | { stage: 'sources'; completed: number; total: number }
  | { stage: 'history'; completed: number; total: number | null };
export type ReplacementProgress = HistoryReplayProgress | { stage: 'local-writing' | 'snapshot' };
export type EnrollmentProgress =
  | ReplacementProgress
  | { stage: 'checking' | 'publishing' | 'delivery' | 'installation' | 'certification' };
export type EnrollmentProgressListener = (progress: EnrollmentProgress | null) => void;

export function reportEnrollmentProgress<T>(
  listener: ((progress: T) => void) | undefined,
  progress: T,
): void {
  try {
    listener?.(progress);
  } catch {
    // A presentation failure cannot interrupt verification or change saved protocol state.
  }
}

export function enrollmentProgressMessage(progress: EnrollmentProgress): string {
  switch (progress.stage) {
    case 'checking':
      return 'Checking the saved device connection…';
    case 'baseline':
      return 'Checking the saved writing snapshot…';
    case 'sources':
      return `Checking writing snapshots: ${progress.completed} of ${progress.total} checked…`;
    case 'history':
      return progress.total === null
        ? `Checking synced changes: ${progress.completed} checked…`
        : `Checking synced changes: ${progress.completed} of ${progress.total} checked…`;
    case 'local-writing':
      return 'Checking writing saved on this device…';
    case 'snapshot':
      return 'Preparing the new device’s writing snapshot…';
    case 'publishing':
      return 'Sending the writing snapshot…';
    case 'delivery':
      return 'Sending approved access to the new device…';
    case 'installation':
      return 'Checking and saving access on this device…';
    case 'certification':
      return 'Verifying that the new device is connected…';
  }
}
