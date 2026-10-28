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
/** Separate private policy opt-in; compatible reading alone must never schedule conversion. */
export const hasAutomaticLocalRetention = () =>
  hasRetentionWriter() && import.meta.env?.['VITE_ACCOUNT_RETENTION_AUTO'] === '1';
/** Durable receipt reuse is an explicit experiment; never survives HMR under a stale identity. */
declare const __ACCOUNT_PREPARATION_VERIFIER__: string;
export const preparationVerifierIdentity = () =>
  hasRetentionWriter() &&
  import.meta.env?.['VITE_ACCOUNT_RETENTION_RESUME'] === '1' &&
  import.meta.env.PROD &&
  typeof __ACCOUNT_PREPARATION_VERIFIER__ === 'string' &&
  /^[0-9a-f]{64}$/.test(__ACCOUNT_PREPARATION_VERIFIER__)
    ? __ACCOUNT_PREPARATION_VERIFIER__
    : undefined;
