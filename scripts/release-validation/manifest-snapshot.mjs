import assert from 'node:assert/strict';
/** One complete obligation per line. JSON values and schema are unchanged; only whitespace shrinks. */
export function manifestSnapshot(manifest) {
  const code =
    '{\n' +
    Object.entries(manifest)
      .map(
        ([key, value]) =>
          '  ' +
          JSON.stringify(key) +
          ': ' +
          (key === 'rows'
            ? '[\n' + value.map((row) => '    ' + JSON.stringify(row)).join(',\n') + '\n  ]'
            : JSON.stringify(value)),
      )
      .join(',\n') +
    '\n}\n';
  // Bounded headroom for the reviewed Account registrations; serialization stays unchanged.
  assert(Buffer.byteLength(code) <= 800000, 'Manifest size budget failed');
  return code;
}
