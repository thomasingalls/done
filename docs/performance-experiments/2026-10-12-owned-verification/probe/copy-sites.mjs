import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SourceMap } from 'node:module';
const [directory, dist] = process.argv.slice(2);
const row = JSON.parse(readFileSync(join(directory, 'typing.json'), 'utf8'))[0];
const sites = new Map();
for (const copy of row.copies) {
  const caller = copy.stack.split('\n')[2];
  const match = caller.match(/http:\/\/localhost:53771(\/[^:]+):(\d+):(\d+)/);
  const map = new SourceMap(JSON.parse(readFileSync(join(dist, match[1] + '.map'), 'utf8')));
  const location = map.findEntry(Number(match[2]) - 1, Number(match[3]) - 1);
  const key = location.originalSource + ':' + (location.originalLine + 1);
  const site = sites.get(key) ?? { calls: 0, rows: 0, bytes: 0, compiledCaller: caller.trim() };
  site.calls++; site.rows += copy.rows; site.bytes += copy.bytes; sites.set(key, site);
}
const result = Object.fromEntries(sites);
writeFileSync(join(directory, 'copy-sites.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
