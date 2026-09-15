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
  // Reviewed F-17 integration adds six files and 55 cases (802,108 bytes before this
  // writer change). Keep bounded planning-file headroom; runtime report limits are separate.
  assert(Buffer.byteLength(code) <= 850000, 'Manifest size budget failed');
  return code;
}
