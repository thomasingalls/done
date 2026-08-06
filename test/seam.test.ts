/**
 * TRD §10.1: "Isolate every Yjs import behind one internal module so the
 * migration has a single seam."
 *
 * A constraint stated in a document is a constraint until the first person in a
 * hurry. This is the version that fails the build.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Each seam is one file, and it is the only file allowed to name its packages.
 * Yjs is TRD §10.1; Temporal is the same argument for a different reason —
 * the ponyfill is there only until the platform ships the API, and when it does
 * the migration should be one import rather than a search.
 */
const SEAMS: Record<string, readonly string[]> = {
  'src/crdt/yjs.ts': [
    'yjs',
    'y-indexeddb',
    'y-protocols',
    'y-codemirror.next',
    'y-websocket',
    'y-sweet',
  ],
  'src/lib/temporal.ts': ['temporal-polyfill'],
};

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.ts', '.tsx'].includes(extname(entry.name)) ? [path] : [];
  });

const importedPackages = (source: string): string[] =>
  [...source.matchAll(/^\s*(?:import|export)[\s\S]*?from\s+'([^']+)'/gm)].map(
    (match) => match[1] as string,
  );

describe.each(Object.entries(SEAMS))('the %s seam', (seam, packages) => {
  it('is the only file that imports its packages', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles('src')) {
      const path = relative('.', file).replaceAll('\\', '/');
      if (path === seam) continue;
      for (const specifier of importedPackages(readFileSync(file, 'utf8'))) {
        const packageName = specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : (specifier.split('/')[0] as string);
        if (packages.includes(packageName)) offenders.push(`${path} imports ${specifier}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('the Yjs seam', () => {
  it('re-exports what the rest of the app needs, so there is no reason to reach past it', () => {
    const seam = readFileSync('src/crdt/yjs.ts', 'utf8');
    for (const name of [
      'Y',
      'IndexeddbPersistence',
      'Awareness',
      'yCollab',
      'yUndoManagerKeymap',
    ]) {
      expect(seam).toContain(name);
    }
  });
});
