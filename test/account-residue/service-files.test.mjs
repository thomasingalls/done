import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fixture, report } from './fixtures.mjs';
import {
  createLocal,
  openLocal,
  writeAll,
  writingNeedles,
  prepareRecovery,
  select,
  sync,
  settled,
  close,
  recordNeedles,
} from './lifecycle.mjs';
import { collectFiles } from './files.mjs';
import { assess, LIMITS } from './matcher.mjs';
test(
  'actual private Account HTTP flow leaves no writing/factor sentinel in acquired service DB/WAL files',
  { timeout: 180000 },
  async (t) => {
    const f = await fixture(t),
      item = await createLocal(f),
      ns = writingNeedles();
    await openLocal(f, item);
    await writeAll(f, ns);
    await close(f);
    await prepareRecovery(f, item);
    await select(f, item);
    await sync(f, item);
    await settled(f);
    await close(f);
    await f.rpc('barrier');
    const before = collectFiles(dirname(f.dbPaths.core), 'service-files'),
      after = collectFiles(dirname(f.dbPaths.core), 'service-files');
    assert.deepEqual(after, before, 'Quiescent service file observations must agree');
    const needles = recordNeedles(item, ns).filter((n) => n.id !== 'retry');
    const result = assess([before, after], needles, ['service-files'], () => false, {
      ...LIMITS,
      containers: true,
    });
    report('service-files-raw', { before, after, needles });
    report('service-files', result);
    assert.equal(result.verdict, 'complete-no-prohibited-match');
    assert(
      result.acquired.some((r) => r.location.some((p) => String(p).endsWith('-wal'))),
      'Observe a real WAL before close',
    );
  },
);
