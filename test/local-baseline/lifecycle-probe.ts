import type { Plugin } from 'vite';
/** Observe real private branches without replacing their verification or storage operations. */
export function baselineLifecycleProbe(): Plugin {
  const patches: [string, string, string][] = [
    [
      'contentStore.ts',
      '        context.assertCurrent();\n        return true;',
      "        context.assertCurrent();\n        console.info('baseline-lifecycle:prospective');\n        return true;",
    ],
    [
      'localBaselineReplay.ts',
      '    decoded = decodeLocalBaseline(held.payload);',
      "    decoded = decodeLocalBaseline(held.payload);\n    console.info('baseline-lifecycle:rebase');",
    ],
    [
      'rotationObservation.ts',
      '  const spool = baseline.ledger.census.delivery.spool,',
      "  console.info('baseline-lifecycle:detached');\n  const spool = baseline.ledger.census.delivery.spool,",
    ],
    [
      'accountCatchup.ts',
      '          journal = await owner.journal.readSnapshot(task);',
      "          if (loaded.kind === 'baseline-plus-suffix') console.info('baseline-lifecycle:catchup');\n          journal = await owner.journal.readSnapshot(task);",
    ],
    [
      'membershipSource.ts',
      '            async (recovered, baseline) => {',
      "            async (recovered, baseline) => {\n              if (baseline) console.info('baseline-lifecycle:membership-source');",
    ],
    [
      'accountRotation.ts',
      '            if (baseline) return;',
      "            if (baseline) { console.info('baseline-lifecycle:rotation'); return; }",
    ],
    [
      'rotationCapture.ts',
      'const catalog = captureCatalog(',
      "  if (loaded.kind === 'baseline-plus-suffix') console.info('baseline-lifecycle:rotation-journal');\n const catalog = captureCatalog(",
    ],
  ];
  return {
    name: 'observe-baseline-lifecycle',
    enforce: 'pre',
    transform(code, id) {
      const patch = patches.find(([file]) => id.endsWith('/src/crdt/' + file));
      if (!patch) return;
      const escaped = patch[1]
        .trim()
        .split(/\s+/)
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s+');
      const pattern = new RegExp(escaped, 'g');
      if ([...code.matchAll(pattern)].length !== 1)
        throw Error('Lifecycle probe anchor changed: ' + patch[0]);
      return code.replace(pattern, patch[2]);
    },
  };
}
