/** Release build policy only; storage owners still enforce every reader/writer and proof gate. */
export function accountRetentionFlags(environment: Readonly<Record<string, string | undefined>>) {
  const flag = (name: string, fallback: string) => {
    const value = environment[name] || fallback;
    if (value !== '0' && value !== '1') throw Error(name + ' must be 0 or 1');
    return value;
  };
  const automatic = flag('VITE_ACCOUNT_RETENTION_AUTO', '0');
  const flags = {
    VITE_ACCOUNT_BASELINE_READ: flag('VITE_ACCOUNT_BASELINE_READ', '1'),
    VITE_ACCOUNT_BASELINE_INSTALL: flag('VITE_ACCOUNT_BASELINE_INSTALL', automatic),
    VITE_ACCOUNT_RETENTION: flag('VITE_ACCOUNT_RETENTION', automatic),
    VITE_ACCOUNT_RETENTION_AUTO: automatic,
  };
  if (automatic === '1' && Object.values(flags).some((value) => value !== '1'))
    throw Error(
      'Automatic retention requires compatible reading, installation and retention writing; remove contradictory zero overrides.',
    );
  return Object.fromEntries(
    Object.entries(flags).map(([name, value]) => [
      'import.meta.env.' + name,
      JSON.stringify(value),
    ]),
  );
}

/** Explicit experimental build switches; local automation never enables service work. */
export function accountPreparationFlags(environment: Readonly<Record<string, string | undefined>>) {
  const binary = (name: string) => {
    const value = environment[name] || '0';
    if (value !== '0' && value !== '1') throw Error(name + ' must be 0 or 1');
    return value;
  };
  const resume = binary('VITE_ACCOUNT_RETENTION_RESUME');
  const service = binary('VITE_ACCOUNT_HISTORY_AUTO');
  const capabilities = accountRetentionFlags(environment);
  if (
    resume === '1' &&
    ['VITE_ACCOUNT_BASELINE_READ', 'VITE_ACCOUNT_BASELINE_INSTALL', 'VITE_ACCOUNT_RETENTION'].some(
      (k) => capabilities['import.meta.env.' + k] !== JSON.stringify('1'),
    )
  )
    throw Error(
      'Resumable preparation requires compatible reading, installation and retention writing.',
    );
  return {
    'import.meta.env.VITE_ACCOUNT_RETENTION_RESUME': JSON.stringify(resume),
    'import.meta.env.VITE_ACCOUNT_HISTORY_AUTO': JSON.stringify(service),
  };
}
