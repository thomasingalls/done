/** Build-time conservative verifier closure; never hashes browser data, credentials or working state. */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
const ROOTS = ['src', 'account-protocol', 'private', 'vendor-patches', 'vite'] as const;
const REQUIRED = [
  'package.json',
  'pnpm-lock.yaml',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'wasm/journal-seal/seal.generated.ts',
];
export function retentionPreparationIdentity(
  root: string,
  configuration: Readonly<Record<string, string | undefined>> = {},
) {
  const paths: string[] = [];
  const walk = (relative: string) => {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      const path = relative + '/' + entry.name;
      if (entry.isSymbolicLink())
        throw Error('Verifier closure cannot silently follow a symlink: ' + path);
      if (entry.isDirectory()) walk(path);
      else if (
        entry.isFile() &&
        !/\.(?:test|spec|d)\.[cm]?[jt]sx?$/.test(path) &&
        /\.(?:[cm]?[jt]sx?|json|wasm|patch)$/.test(path)
      )
        paths.push(path);
    }
  };
  for (const directory of ROOTS) {
    if (!existsSync(join(root, directory)))
      throw Error('Missing verifier source root: ' + directory);
    if (!lstatSync(join(root, directory)).isDirectory())
      throw Error('Verifier closure root must be a real directory: ' + directory);
    walk(directory);
  }
  for (const path of REQUIRED) {
    if (!existsSync(join(root, path))) throw Error('Missing verifier build input: ' + path);
    if (!lstatSync(join(root, path)).isFile())
      throw Error('Verifier build input must be a real file: ' + path);
    paths.push(path);
  }
  const inputs = [...new Set(paths)].sort().map((path) => ({
    path,
    sha256: createHash('sha256')
      .update(readFileSync(join(root, path)))
      .digest('hex'),
  }));
  // Include every Account build switch and the build mode. Unset versus equivalent explicit
  // defaults may invalidate conservatively; flags can never widen reuse from another build.
  const flags = Object.entries(configuration)
    .filter(([name]) => name.startsWith('VITE_ACCOUNT_') || name === '$mode')
    .sort(([a], [b]) => a.localeCompare(b));
  const digest = createHash('sha256')
    .update(JSON.stringify({ version: 1, inputs, flags }))
    .digest('hex');
  return { digest, inputs, flags };
}
