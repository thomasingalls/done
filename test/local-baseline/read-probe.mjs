// Test-only observation of the actual logical recovery seam, never an alternative reader.
export function baselineReadProbe() {
  let hits = 0;
  return {
    name: 'observe-private-baseline-reads',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/crdt/contentStore.ts')) return;
      const anchor = 'const result = task.step(() => structuredClone(openedView!.baseline!));';
      if (code.split(anchor).length !== 2) throw Error('Logical read probe anchor changed');
      hits++;
      return code.replace(
        anchor,
        anchor +
          `
        (globalThis.baselineReadSamples ??= []).push({
          physical: records.length, logical: result.records.length, firstSuffix: result.firstSuffix,
        });`,
      );
    },
    buildEnd(error) {
      if (!error && hits !== 1) throw Error('Logical read probe not applied once');
    },
  };
}
