/** Reading an existing baseline never grants permission to install or retire history.
 * The packaged default enables readers only; private fixtures explicitly enable writers. */
export const hasBaselineReader = () => import.meta.env?.['VITE_ACCOUNT_BASELINE_READ'] === '1';
export const hasBaselineInstaller = () =>
  import.meta.env?.['VITE_ACCOUNT_BASELINE_INSTALL'] === '1';
export const hasBaselineVerifier = () => hasBaselineReader() || hasBaselineInstaller();
export const hasRetentionWriter = () =>
  hasBaselineReader() &&
  hasBaselineInstaller() &&
  import.meta.env?.['VITE_ACCOUNT_RETENTION'] === '1';
