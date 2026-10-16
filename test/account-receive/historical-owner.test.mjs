import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  native,
  selected,
  inventory,
  openReceive,
  closeReceive,
  receiveBundle,
} from './fixtures.mjs';

test(
  'genuine historical v8 artifact opens its supported storage before refusing current v9 without writes',
  { timeout: 60000 },
  async (t) => {
    // This revision predates v2 admission as well as receiving. Preserve its actual v1 service,
    // creation fixture and owner together; do not rewrite or re-sign a modern receipt for the control.
    const revision = '83785967428cfd04b2ebbe9179c33db772a79b08';
    const parent = resolve('test-results/historical-owner-control');
    mkdirSync(parent, { recursive: true });
    const directory = mkdtempSync(join(parent, 'supported-v8-'));
    const source = join(directory, 'source');
    mkdirSync(source);
    const archive = execFileSync(
      'git',
      [
        'archive',
        revision,
        'src',
        'account-protocol',
        'account-service',
        'test',
        'wasm',
        'scripts',
        'vendor-patches',
        'package.json',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    execFileSync('tar', ['-x', '-C', source], { input: archive });
    const argv = [
      '--test',
      '--test-concurrency=1',
      '--test-reporter=tap',
      '--test-name-pattern=^first submission is persisted exactly, idempotent, retained through compaction and suppressed after acceptance$',
      'test/account-delivery/native.test.mjs',
    ];
    const childEnv = { ...process.env };
    delete childEnv.NODE_TEST_CONTEXT;
    const output = execFileSync(process.execPath, argv, {
      env: childEnv,
      cwd: source,
      encoding: 'utf8',
      timeout: 40000,
      maxBuffer: 4 * 1024 * 1024,
    });
    writeFileSync(join(directory, 'supported-owner.log'), output);
    writeFileSync(
      join(directory, 'identity.json'),
      JSON.stringify(
        { revision, archiveSha256: createHash('sha256').update(archive).digest('hex'), argv },
        null,
        2,
      ) + '\n',
    );
    assert.match(output, /^# pass 1$/m);
    assert.match(output, /^# fail 0$/m);
    assert.match(
      output,
      /^ok \d+ - first submission is persisted exactly, idempotent, retained through compaction and suppressed after acceptance$/m,
    );
    const f = await native(t),
      item = await selected(f, 'historical-v9-refusal');
    assert.equal((await openReceive(f.page, item)).receivedThrough, 0);
    await closeReceive(f.page);
    const before = await inventory(f.page);
    await f.page.evaluate(await receiveBundle('old-reader'));
    await assert.rejects(openReceive(f.page, item), /Unsupported|Malformed/);
    assert.equal(await inventory(f.page), before);
  },
);
