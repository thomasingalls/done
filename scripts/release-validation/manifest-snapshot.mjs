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
  // Reviewed wrapper contracts now include ordered child invocations and separate case domains.
  // Keep bounded planning-file headroom; runtime report limits are separate.
  assert(Buffer.byteLength(code) <= 1000000, 'Manifest size budget failed');
  return code;
}
