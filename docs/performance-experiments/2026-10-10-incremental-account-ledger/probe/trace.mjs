// Main-thread attribution from a Chrome trace: what ran per key, and what ran between keys.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SourceMap } from 'node:module';
import { DIST, ORIGIN, pct, round } from './lib.mjs';

const INPUT = new Set(['keydown', 'keypress', 'beforeinput', 'textInput', 'input', 'keyup']);
const maps = new Map();
function mapped(url, line, column) {
  if (!url || !url.startsWith(ORIGIN + '/') || !url.endsWith('.js')) return null;
  const path = join(DIST, new URL(url).pathname + '.map');
  if (!existsSync(path)) return null;
  let map = maps.get(path);
  if (!map) {
    map = new SourceMap(JSON.parse(readFileSync(path, 'utf8')));
    maps.set(path, map);
  }
  for (const [l, c] of [
    [line - 1, column - 1],
    [line, column],
  ]) {
    if (l < 0 || c < 0) continue;
    const entry = map.findEntry(l, c);
    if ('originalSource' in entry)
      return `${entry.originalSource.replace(/^.*?(?=(src|account-protocol|wasm)\/)/, '').replace(/^.*node_modules\/\.pnpm\/[^/]+\/node_modules\//, 'npm:')}:${entry.originalLine + 1}`;
  }
  return null;
}

export function analyse(buffer) {
  const all = JSON.parse(buffer.toString()).traceEvents;
  // The renderer main thread is the one that dispatched the keydowns.
  const counts = new Map();
  for (const e of all)
    if (e.name === 'EventDispatch' && e.args?.data?.type === 'keydown') {
      const k = e.pid + ':' + e.tid;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  if (!counts.size) return { error: 'no keydown EventDispatch in trace', events: all.length };
  const [main] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const [pid, tid] = main.split(':').map(Number);
  const events = all
    .filter((e) => e.pid === pid && e.tid === tid && e.ph === 'X' && typeof e.dur === 'number')
    .sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const tasks = events.filter((e) => e.name === 'RunTask');
  const others = events.filter((e) => e.name !== 'RunTask');
  let j = 0;
  const rows = [];
  for (const task of tasks) {
    const end = task.ts + task.dur;
    while (j < others.length && others[j].ts < task.ts) j++;
    const inside = [];
    for (let k = j; k < others.length && others[k].ts < end; k++) inside.push(others[k]);
    const types = new Set();
    const names = new Map();
    let fn;
    for (const e of inside) {
      names.set(e.name, (names.get(e.name) ?? 0) + e.dur);
      if (e.name === 'EventDispatch') types.add(e.args?.data?.type);
      if (!fn && e.name === 'FunctionCall' && e.args?.data?.url)
        fn = {
          name: e.args.data.functionName,
          at:
            mapped(e.args.data.url, e.args.data.lineNumber, e.args.data.columnNumber) ??
            `${String(e.args.data.url).split('/').pop()}:${e.args.data.lineNumber}`,
        };
    }
    let kind = 'other';
    const callback = fn?.name ?? '';
    if ([...types].some((t) => INPUT.has(t))) kind = 'input';
    else if (names.has('TimerFire')) kind = 'timer';
    else if (
      /\.on(success|complete|error|abort|upgradeneeded)$/.test(callback) ||
      types.has('success') ||
      types.has('complete')
    )
      kind = 'indexeddb-callback';
    else if (types.has('message')) kind = 'message';
    else if (types.has('storage')) kind = 'storage-event';
    else if (names.has('FireAnimationFrame')) kind = 'animation-frame';
    else if (names.has('XHRReadyStateChange') || names.has('XHRLoad')) kind = 'xhr';
    else if (
      names.has('RunMicrotasks') ||
      names.has('v8.callFunction') ||
      names.has('FunctionCall')
    )
      kind = 'script(promise/other)';
    else if (
      names.has('ResourceReceiveResponse') ||
      names.has('ResourceReceivedData') ||
      names.has('ResourceFinish')
    )
      kind = 'network';
    else if (names.has('MajorGC') || names.has('MinorGC')) kind = 'gc-only';
    else if (
      names.has('Layout') ||
      names.has('UpdateLayoutTree') ||
      names.has('Paint') ||
      names.has('PrePaint') ||
      names.has('Layerize') ||
      names.has('Commit')
    )
      kind = 'rendering';
    rows.push({
      ts: task.ts,
      dur: task.dur,
      kind,
      types: [...types],
      fn,
      gc: (names.get('MinorGC') ?? 0) + (names.get('MajorGC') ?? 0),
      script: names.get('FunctionCall') ?? 0,
      micro: names.get('RunMicrotasks') ?? 0,
      layout: (names.get('Layout') ?? 0) + (names.get('UpdateLayoutTree') ?? 0),
    });
  }
  const keydowns = others
    .filter((e) => e.name === 'EventDispatch' && e.args?.data?.type === 'keydown')
    .map((e) => e.ts);
  const perKey = [];
  for (let i = 0; i < keydowns.length; i++) {
    const from = keydowns[i] - 500; // the RunTask starts slightly before its EventDispatch
    const to = i + 1 < keydowns.length ? keydowns[i + 1] - 500 : keydowns[i] + 400000;
    const mine = rows.filter((r) => r.ts >= from && r.ts < to);
    const sum = (f) => mine.filter(f).reduce((n, r) => n + r.dur, 0) / 1000;
    const byKind = {};
    for (const r of mine) byKind[r.kind] = (byKind[r.kind] ?? 0) + r.dur / 1000;
    perKey.push({
      input: sum((r) => r.kind === 'input'),
      total: sum(() => true),
      longest: Math.max(0, ...mine.map((r) => r.dur / 1000)),
      windowMs: (to - from) / 1000,
      byKind,
    });
  }
  const kinds = {};
  const first = keydowns[0] - 500,
    last = keydowns.at(-1) + 400000;
  for (const r of rows)
    if (r.ts >= first && r.ts < last) {
      kinds[r.kind] ??= { ms: 0, tasks: 0, over8: 0, over16: 0, over50: 0 };
      kinds[r.kind].ms += r.dur / 1000;
      kinds[r.kind].tasks++;
      if (r.dur > 8000) kinds[r.kind].over8++;
      if (r.dur > 16000) kinds[r.kind].over16++;
      if (r.dur > 50000) kinds[r.kind].over50++;
    }
  for (const k of Object.values(kinds)) {
    k.ms = round(k.ms);
    k.msPerKey = round(k.ms / keydowns.length);
  }
  const stat = (values) => ({
    p50: round(pct(values, 50)),
    p95: round(pct(values, 95)),
    max: round(Math.max(...values)),
    mean: round(values.reduce((a, b) => a + b, 0) / values.length),
  });
  const longest = rows
    .filter((r) => r.ts >= first && r.ts < last)
    .sort((a, b) => b.dur - a.dur)
    .slice(0, 25)
    .map((r) => ({
      ms: round(r.dur / 1000),
      kind: r.kind,
      types: r.types.join(','),
      fn: r.fn ? `${r.fn.name || '(anonymous)'} ${r.fn.at}` : undefined,
      gcMs: round(r.gc / 1000),
    }));
  // Non-input tasks grouped by their first script entry point.
  const entry = new Map();
  for (const r of rows)
    if (r.ts >= first && r.ts < last && r.kind !== 'input') {
      const key = `${r.kind} | ${r.fn ? `${r.fn.name || '(anonymous)'} ${r.fn.at}` : r.types.join(',') || '-'}`;
      const cur = entry.get(key) ?? { ms: 0, n: 0, max: 0 };
      cur.ms += r.dur / 1000;
      cur.n++;
      cur.max = Math.max(cur.max, r.dur / 1000);
      entry.set(key, cur);
    }
  const nonInput = [...entry.entries()]
    .sort((a, b) => b[1].ms - a[1].ms)
    .slice(0, 25)
    .map(([key, v]) => ({
      key,
      ms: round(v.ms),
      n: v.n,
      maxMs: round(v.max),
      msPerKey: round(v.ms / keydowns.length),
    }));
  return {
    keys: keydowns.length,
    spanMs: round((last - first) / 1000),
    inputTaskMsPerKey: stat(perKey.map((k) => k.input)),
    allMainThreadMsPerKey: stat(perKey.map((k) => k.total)),
    longestTaskInKeyWindowMs: stat(perKey.map((k) => k.longest)),
    kinds,
    longest,
    nonInput,
    gcMs: round(
      rows.filter((r) => r.ts >= first && r.ts < last).reduce((n, r) => n + r.gc, 0) / 1000,
    ),
  };
}

if (process.argv[1] === import.meta.filename && process.argv[2])
  console.log(JSON.stringify(analyse(readFileSync(process.argv[2])), null, 1));
