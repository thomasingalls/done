// Recompute stable-text arrivals from raw captures and the four-point main-thread slope.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.ceil((values.length * p) / 100) - 1];
const stable = (data) => {
  const arrivals = [];
  for (let i = 0; i < data.keys.length; i++) {
    const want = data.armed.baseLength + i + 1;
    let previous = data.armed.baseLength + i,
      last;
    for (const l of data.lengths) {
      if (l.t < data.keys[i].t - 1) {
        previous = l.len;
        continue;
      }
      if (previous < want && l.len >= want) last = l.t;
      previous = l.len;
    }
    if (last !== undefined) arrivals.push(last - data.keys[i].t);
  }
  return {
    samples: arrivals.length,
    p50: percentile(arrivals, 50),
    p95: percentile(arrivals, 95),
    max: Math.max(...arrivals),
  };
};
const result = {};
for (const [index, arm] of ['baseline', 'candidate'].entries()) {
  const dir = process.argv[index + 2];
  const summary = read(join(dir, 'slope.summary.json'));
  const rows = [0, 520, 1220, 2220].map((prior) => {
    const name = 'history-' + prior + '-T-traced';
    const block = summary.blocks.find((b) => b.name === name);
    const maintenance = summary.blocks.find((b) => b.name === 'history-' + prior + '-maintenance');
    const raw = read(join(dir, 'slope-' + name + '.raw.json'));
    if (!block?.textComplete || block.typedBefore !== prior || !maintenance)
      throw Error('Incomplete point: ' + name);
    return {
      prior,
      mainP50: block.trace.allMainThreadMsPerKey.p50,
      paintP95: block.keyToNextPaintMs.p95,
      stable: stable(raw.data),
      keyGapP50: percentile(
        raw.data.keys.slice(1).map((k, i) => k.t - raw.data.keys[i].t),
        50,
      ),
      maintenance,
    };
  });
  const mx = rows.reduce((n, r) => n + r.prior, 0) / rows.length,
    my = rows.reduce((n, r) => n + r.mainP50, 0) / rows.length;
  const slope =
    rows.reduce((n, r) => n + (r.prior - mx) * (r.mainP50 - my), 0) /
    rows.reduce((n, r) => n + (r.prior - mx) ** 2, 0);
  result[arm] = {
    rows,
    fittedSlopeMsPerEdit: slope,
    endpointSlopeMsPerEdit: (rows.at(-1).mainP50 - rows[0].mainP50) / 2220,
    notes: summary.notes,
  };
}
result.slopeReduction =
  1 - result.candidate.fittedSlopeMsPerEdit / result.baseline.fittedSlopeMsPerEdit;
console.log(JSON.stringify(result, null, 2));
