/** One complete top-level array entry per line. Only JSON whitespace changes. */
export function inventorySnapshot(inventory) {
  return (
    '{\n' +
    Object.entries(inventory)
      .map(
        ([key, value]) =>
          '  ' +
          JSON.stringify(key) +
          ': ' +
          (Array.isArray(value)
            ? '[\n' + value.map((row) => '    ' + JSON.stringify(row)).join(',\n') + '\n  ]'
            : JSON.stringify(value)),
      )
      .join(',\n') +
    '\n}\n'
  );
}
