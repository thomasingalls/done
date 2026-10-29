/** Public execution is fixed to Worker. Explicit legacy service compatibility is loaded separately. */
import type { SetupConfig } from '../account/setupProgress';
import type { EnrollmentBootstrapData } from '../account/enrollmentWorkerProtocol';
import type { EnrollmentProgressListener } from '../lib/enrollmentProgress';
import { createWorkerAccountEnrollment } from './accountEnrollmentWorker';
export async function createUiAccountEnrollment(
  config: SetupConfig,
  slot: string,
  code: string,
  data: EnrollmentBootstrapData,
  signal: AbortSignal,
  onProgress?: EnrollmentProgressListener,
) {
  if (config.networkSessions)
    return createWorkerAccountEnrollment(config, slot, code, data, signal, onProgress);
  const { createLegacyUiEnrollment } = await import('./accountEnrollmentPage');
  signal.throwIfAborted();
  return createLegacyUiEnrollment(config, slot, code, data, signal, onProgress);
}
