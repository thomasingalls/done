import assert from 'node:assert/strict';

/** Keep the first observation; later observations must never replace the expectation. */
export function rememberCaptures(retained, observed) {
  const current = new Map(observed.map((c) => [c.id, c]));
  assert.equal(current.size, observed.length, 'Duplicate observed capture');
  for (const [id, original] of retained)
    assert.deepEqual(
      current.get(id),
      original,
      'Previously captured source changed or disappeared',
    );
  for (const [id, capsule] of current)
    if (!retained.has(id)) retained.set(id, structuredClone(capsule));
}
export function verifyCaptures(retained, observed, initializationRoute) {
  for (const c of observed) {
    if (retained.has(c.id)) continue;
    assert(initializationRoute, 'Unexpected recovered capture');
    for (const field of ['v', 'workspace', 'principal', 'credential', 'epoch', 'generation'])
      assert.equal(c[field], initializationRoute[field], 'Initialization capture route differs');
    assert.deepEqual(
      c.sources,
      [{ actor: c.principal, kind: 'human', bytes: [0, 0] }],
      'Unexpected nonempty initialization capture',
    );
  }
  rememberCaptures(retained, observed);
}
