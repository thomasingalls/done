// @vitest-environment node
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parseSync } from '@babel/core';
import { expect, it } from 'vitest';

function runtimeImports(file: string): string[] {
  const source = parseSync(readFileSync(file, 'utf8'), {
    filename: file,
    configFile: false,
    babelrc: false,
    parserOpts: { plugins: ['typescript'] },
  });
  const paths: string[] = [];
  for (const node of source!.program.body) {
    if (node.type === 'ImportDeclaration') {
      if (node.importKind === 'type') continue;
      if (
        node.specifiers.length > 0 &&
        node.specifiers.every((v) => v.type === 'ImportSpecifier' && v.importKind === 'type')
      )
        continue;
    } else if (node.type === 'ExportNamedDeclaration') {
      if (node.exportKind === 'type') continue;
      if (
        node.specifiers.length > 0 &&
        node.specifiers.every((v) => v.type === 'ExportSpecifier' && v.exportKind === 'type')
      )
        continue;
    } else if (node.type === 'ExportAllDeclaration') {
      if (node.exportKind === 'type') continue;
    } else continue;
    const specifier = node.source;
    if (!specifier || !specifier.value.startsWith('.')) continue;
    const path = resolve(dirname(file), specifier.value);
    const target = [path, path + '.ts', path + '/index.ts'].find((v) => existsSync(v));
    if (!target) throw Error('Unresolved local runtime import: ' + file + ' -> ' + specifier.value);
    paths.push(target);
  }
  return paths;
}
for (const entry of ['runtimePorts', 'writeSession'])
  it(
    entry + ' has an acyclic low-level dependency closure without account/storage ownership',
    () => {
      const forbidden = new Set(
        [
          'custody',
          'localGenesisStorage',
          'accountReceive',
          'windowJournalBridge',
          'accountWorkerCohort',
        ].map((name) => resolve('src/crdt/' + name + '.ts')),
      );
      const visited = new Set<string>();
      const visit = (path: string, stack: string[]) => {
        const next = [...stack, path];
        expect(forbidden.has(path), 'High-level owner dependency: ' + next.join(' -> ')).toBe(
          false,
        );
        expect(stack.includes(path), 'Runtime import cycle: ' + next.join(' -> ')).toBe(false);
        if (visited.has(path)) return;
        visited.add(path);
        for (const child of runtimeImports(path)) visit(child, next);
      };
      visit(resolve('src/crdt/' + entry + '.ts'), []);
    },
  );

it('old public coordination exports retain the same class and injective slot names', async () => {
  const old = await import('../src/crdt/writeSession');
  const actual = await import('../src/crdt/nativeCoordination');
  expect(old.WriteSessionError).toBe(actual.WriteSessionError);
  expect(old.slotPermitName).toBe(actual.slotPermitName);
  expect(() => old.slotPermitName('')).toThrow(actual.WriteSessionError);
  for (const value of ['slot', 'a/b', '"slot"', '\ud800', 'a\u0000b'])
    expect(old.slotPermitName(value)).toBe('done/slot-writer/' + JSON.stringify(value));
});
