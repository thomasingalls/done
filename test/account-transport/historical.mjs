// Seed with the actual signed pre-R-01 decision implementation, never a relaxed production flag.
// The synthetic authority supplies its issuer to a test-only facade. Current code owns all reads/retries.
export async function legacyDecision(t, x, w) {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { resolve, join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const { tmpdir } = await import('node:os');
  const { DatabaseSync } = await import('node:sqlite');
  const dir = mkdtempSync(join(tmpdir(), 'done-r01-historical-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = execFileSync(
    'git',
    ['show', '4bb09042f37f68ec31f0d82587af608f599eb096:account-service/delivery.ts'],
    { encoding: 'utf8', timeout: 5000, maxBuffer: 2 * 1024 * 1024 },
  );
  const filename = join(dir, 'delivery.ts');
  writeFileSync(
    filename,
    source.replace(/from '([^']+)'/g, (match, specifier) =>
      specifier.startsWith('.')
        ? `from '${pathToFileURL(resolve('account-service', specifier)).href}'`
        : match,
    ),
  );
  const legacy = await import(pathToFileURL(filename).href);
  return x.authority.owner.decideSubmission(
    {
      async decideSubmission(input, issuer) {
        const db = new DatabaseSync(x.f.path);
        try {
          return await legacy.decideSubmission(db, input, issuer, () => {});
        } finally {
          db.close();
        }
      },
    },
    { workspaceId: x.workspace, bytes: w.bytes },
  );
}
