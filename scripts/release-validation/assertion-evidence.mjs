import assert from 'node:assert/strict';

export const evidenceEncoding = 'tagged-json-v1';
// An injective representation of the plain values used by these assertions. JSON alone
// erases undefined object fields and conflates undefined array entries with null.
export function encodeEvidence(value) {
  if (value === undefined) return ['undefined'];
  if (value === null) return ['null'];
  if (typeof value === 'string' || typeof value === 'boolean') return [typeof value, value];
  if (typeof value === 'number') {
    assert(Number.isFinite(value), 'Non-finite assertion evidence');
    return ['number', Object.is(value, -0) ? '-0' : String(value)];
  }
  assert(typeof value === 'object', 'Unsupported assertion evidence');
  assert(!Object.getOwnPropertySymbols(value).length, 'Symbol assertion evidence');
  if (Array.isArray(value)) {
    assert(
      Object.keys(value).length === value.length &&
        Object.keys(value).every((key, i) => key === String(i)),
      'Sparse assertion evidence',
    );
    return ['array', Array.from(value, encodeEvidence)];
  }
  const proto = Object.getPrototypeOf(value);
  assert(proto === Object.prototype || proto === null, 'Non-plain assertion evidence');
  return [
    proto === null ? 'null-object' : 'object',
    Object.keys(value)
      .sort()
      .map((key) => [key, encodeEvidence(value[key])]),
  ];
}
export function validateEvidence(value) {
  assert(Array.isArray(value), 'Missing tagged assertion evidence');
  const [kind, data] = value;
  if (kind === 'undefined' || kind === 'null') assert.equal(value.length, 1);
  else {
    assert.equal(value.length, 2);
    if (kind === 'string' || kind === 'boolean') assert.equal(typeof data, kind);
    else if (kind === 'number')
      assert(
        typeof data === 'string' &&
          Number.isFinite(Number(data)) &&
          (data === '-0' || String(Number(data)) === data),
        'Invalid number evidence',
      );
    else if (kind === 'array') {
      assert(Array.isArray(data));
      data.forEach(validateEvidence);
    } else {
      assert(kind === 'object' || kind === 'null-object', 'Unknown evidence tag');
      assert(Array.isArray(data));
      const keys = data.map((entry) => {
        assert(Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string');
        validateEvidence(entry[1]);
        return entry[0];
      });
      assert.deepEqual(keys, [...new Set(keys)].sort(), 'Non-canonical object evidence');
    }
  }
}
export function encodeCatalogueEvidence(result) {
  const report = (r) => ({
    ...r,
    cases: r.cases.map((c) => ({
      ...c,
      assertions: c.assertions.map((a) => ({
        ...a,
        actual: encodeEvidence(a.actual),
        expected: encodeEvidence(a.expected),
      })),
    })),
  });
  return {
    ...result,
    evidenceEncoding,
    candidates: result.candidates.map(report),
    mutations: result.mutations.map((m) => ({ ...m, result: report(m.result) })),
  };
}
