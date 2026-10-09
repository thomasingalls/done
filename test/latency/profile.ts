import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { SourceMap } from 'node:module';
import { gzipSync } from 'node:zlib';
import { expect, type Page, type TestInfo } from '@playwright/test';

/** Profiling is a separate diagnostic observation, never used as a budget measurement. */
export const profile = async (
  page: Page,
  info: TestInfo,
  label: string,
  act: () => Promise<void>,
) => {
  const session = await page.context().newCDPSession(page);
  await session.send('Profiler.enable');
  await session.send('Profiler.setSamplingInterval', { interval: 1000 });
  await session.send('Profiler.start');
  const save = async () => {
    const { profile: raw } = await session.send('Profiler.stop');
    await session.detach();
    expect(raw.samples?.length).toBeGreaterThan(0);
    expect(raw.timeDeltas?.length).toBe(raw.samples?.length);
    const maps = new Map<string, SourceMap>();
    const root = process.env['LATENCY_PROFILE_ROOT'];
    if (!root) throw Error('Profiling requires the owned diagnostic build.');
    const rows = raw.nodes.map((node) => {
      const f = node.callFrame;
      let source: string | undefined, line: number | undefined;
      if (f.url.startsWith(new URL(page.url()).origin + '/') && f.url.endsWith('.js')) {
        const path = resolve(root, '.' + new URL(f.url).pathname + '.map');
        if (!path.startsWith(resolve(root) + sep)) throw Error('Profile source path escape');
        let map = maps.get(path);
        if (!map) {
          map = new SourceMap(JSON.parse(readFileSync(path, 'utf8')));
          maps.set(path, map);
        }
        const entry = map.findEntry(f.lineNumber, f.columnNumber);
        if (!('originalSource' in entry)) throw Error('Missing profile source mapping');
        source = entry.originalSource;
        line = entry.originalLine + 1;
      }
      return {
        id: node.id,
        function: f.functionName,
        source,
        line,
        children: node.children ?? [],
        selfUs: 0,
      };
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const [index, id] of raw.samples!.entries()) {
      const row = byId.get(id);
      if (!row) throw Error('Unresolved CPU sample');
      row.selfUs += raw.timeDeltas![index]!;
    }
    const body = gzipSync(
      JSON.stringify({ project: info.project.name, label, intervalUs: 1000, raw, mapped: rows }),
    );
    expect(body.length, 'Bounded profile attachment').toBeLessThanOrEqual(262144);
    await info.attach(label + '.cpuprofile.json.gz', { body, contentType: 'application/gzip' });
    console.log('Captured CPU profile', info.project.name, label, raw.samples!.length, 'samples');
  };
  try {
    await act();
  } finally {
    await save();
  }
};
