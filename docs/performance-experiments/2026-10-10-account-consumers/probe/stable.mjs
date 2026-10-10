// Offline: recompute key -> character *stably* in the editor DOM from the raw block captures.
// The controlled editor lets the browser insert the character natively, then removes it again when
// the command is queued instead of accepted, and re-adds it on acceptance. "First arrival" is therefore
// optimistic; "stable arrival" is the last time the text length rose to include that key's character.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RESULTS, summary, round } from './lib.mjs';

const prefix = process.argv[2] ?? '';
const rows = [];
for (const file of readdirSync(RESULTS)
  .filter((f) => f.endsWith('.raw.json') && f.startsWith(prefix) && !f.startsWith('smoke'))
  .sort()) {
  const { data } = JSON.parse(readFileSync(join(RESULTS, file), 'utf8'));
  const base = data.armed.baseLength;
  const keys = data.keys;
  const lengths = data.lengths;
  const stable = [];
  const first = [];
  let removed = 0;
  for (let i = 0; i < keys.length; i++) {
    const want = base + i + 1;
    let lastRise = null,
      firstRise = null,
      dipped = false;
    let prev = base + i; // length just before this key is at most base+i
    for (const l of lengths) {
      if (l.t < keys[i].t - 1) {
        prev = l.len;
        continue;
      }
      if (prev < want && l.len >= want) {
        if (firstRise === null) firstRise = l.t;
        else dipped = true;
        lastRise = l.t;
      }
      prev = l.len;
    }
    if (lastRise !== null) {
      stable.push(lastRise - keys[i].t);
      first.push(firstRise - keys[i].t);
      if (dipped) removed++;
    }
  }
  const gapsMs = keys.slice(1).map((k, i) => k.t - keys[i].t);
  rows.push({
    block: file.replace('.raw.json', ''),
    keys: keys.length,
    measured: stable.length,
    stable: stable.length ? summary(stable) : null,
    over50: stable.filter((v) => v > 50).length,
    over100: stable.filter((v) => v > 100).length,
    over250: stable.filter((v) => v > 250).length,
    removedThenRestored: removed,
    actualGapP50: gapsMs.length ? round(summary(gapsMs).p50) : null,
    settleMs: data.settleMs,
  });
}
const pad = (v, n) => String(v ?? '-').padStart(n);
console.log(
  'block'.padEnd(34),
  'keys  p50    p95    max   mean  >50  >100 >250  flick  gapP50 settle',
);
for (const r of rows)
  console.log(
    r.block.padEnd(34),
    pad(r.measured, 4),
    pad(r.stable?.p50, 6),
    pad(r.stable?.p95, 6),
    pad(r.stable?.max, 6),
    pad(r.stable?.mean, 6),
    pad(r.over50, 4),
    pad(r.over100, 5),
    pad(r.over250, 4),
    pad(r.removedThenRestored, 6),
    pad(r.actualGapP50, 7),
    pad(r.settleMs, 6),
  );
