/**
 * What one journal record costs to write (TRD §12, §15 row 2).
 *
 * **The budget this measures is the only one in §12 that gates a selection
 * rather than a feature.** Row 2 chose XChaCha20-Poly1305 for the synchronous
 * crash journal against a `< 1 ms p95` budget, and recorded three figures taken
 * in Node on a development Mac — with two caveats against them, both of which
 * this file exists to remove: `Buffer.from().toString('base64')` is not what the
 * browser runs, and V8-in-Node is not V8-in-Chrome.
 *
 * **Four levels, because "what does the AEAD cost" is not the question that
 * matters.** What blocks a keystroke is the whole synchronous write — seal,
 * frame, base64, and a `localStorage.setItem` that is already there today. The
 * levels are cumulative, so the differences between them are the answer to a
 * question nobody has asked yet: *what does encryption add to a journal write
 * that already costs something?* If `setItem` dominates, the budget is pointed
 * at the wrong term and Stage 1 should know that before it starts.
 *
 * **The construction is bundled from the specification, not imported from the
 * app**, because Stage 1 has not built it yet — that is the point of measuring
 * now. So the first thing this does is reproduce a published vector byte for
 * byte, and refuse to measure if it cannot. A benchmark of the wrong
 * construction produces numbers that look exactly like the right ones.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { build } from 'vite';
import { CPU_THROTTLE, percentile, record } from './measure';
import {
  BUDGET_MS,
  LEVELS,
  RUN_DEFAULTS,
  SIZES,
  type Level,
  type RunResult,
} from './journal-bench';

test.describe.configure({ mode: 'serial' });

/**
 * How many single writes back the tail, named locally only because the record
 * note quotes it. Everything else about the measurement's shape is imported,
 * so the device runner and this one cannot drift apart.
 */
const SINGLES = RUN_DEFAULTS.singles;

let page: Page;
let project: string;

/**
 * Whether this project's CPU is throttled, and why it changes what can be read.
 *
 * **CDP's CPU throttle works by stalling the thread, not by simulating a slower
 * core**, so its stalls land *inside* individually-timed operations and become
 * the tail. That is not a theory: on the throttled project the plaintext level —
 * which performs no cryptography at all — shows the same five-fold tail-to-mean
 * ratio as the sealed levels, so the tail cannot be a property of the sealing.
 *
 * The batch mean is unaffected, because a stall amortized over hundreds of
 * operations is a small constant. So the throttled project measures a mean and
 * the unthrottled one measures both — **and this is the concrete reason the
 * budget's own statistic wants a real device**: an unthrottled handset is the
 * only place a p95 of one write is both slow enough to matter and honest.
 */
let throttled = false;

/**
 * Structural, because Vite 8 does not re-export Rollup's output types and
 * depending on `rollup` directly for one type would add a dependency to state
 * the shape of a value we already hold.
 */
interface BundleChunk {
  type: string;
  isEntry?: boolean;
  code?: string;
}

/**
 * Bundle the in-page benchmark.
 *
 * Vite rather than a hand-rolled inject: `@noble/ciphers` and `lib0/buffer` are
 * multi-file ES modules with bare specifiers, so the bundler is doing real work
 * and the alternative is reimplementing the primitive in the test — which would
 * measure a reimplementation.
 */
const bundle = async (): Promise<string> => {
  const output = (await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL('journal-bench.entry.ts', import.meta.url)),
        formats: ['iife'],
        name: 'journalBenchBundle',
        fileName: () => 'journal-bench.js',
      },
    },
  })) as unknown as { output: BundleChunk[] } | { output: BundleChunk[] }[];

  const chunks = (Array.isArray(output) ? output : [output]).flatMap((one) => one.output);
  const entry = chunks.find((chunk) => chunk.type === 'chunk' && chunk.isEntry === true);
  if (!entry?.code) throw new Error('no entry chunk in the benchmark bundle');
  return entry.code;
};

interface JournalVector {
  name: string;
  inputs: {
    workspace_id: string;
    gen: number;
    journal_storage_key: string;
    nonce: string;
    plaintext: string;
  };
  derived: { k_journal: string };
  expected: { record: string };
}

const keystrokeVector = (): JournalVector => {
  const file = fileURLToPath(new URL('../vectors/journal-aead.json', import.meta.url));
  const vectors = (JSON.parse(readFileSync(file, 'utf8')) as { vectors: JournalVector[] }).vectors;
  const found = vectors.find((one) => one.name === 'keystroke-update');
  if (!found) throw new Error('the keystroke-update vector is missing');
  return found;
};

test.beforeAll(async ({ browser }: { browser: Browser }, info) => {
  project = info.project.name;
  page = await (await browser.newContext()).newPage();

  // A minimal page on the server's own origin: a real origin, so localStorage
  // works, and none of the application, so the microbenchmark is not sharing a
  // main thread with React, Yjs and IndexedDB.
  await page.route('**/journal-bench', (route) =>
    route.fulfill({
      contentType: 'text/html',
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      body: '<!doctype html><title>bench</title>',
    }),
  );
  await page.goto('/journal-bench');
  await page.addScriptTag({ content: await bundle() });

  // Cross-origin isolation is what makes an individual write measurable at all:
  // Chrome coarsens performance.now() to 100 µs without it and 5 µs with it, and
  // a 13 µs operation is invisible at the former. Asserted rather than hoped
  // for, because silently losing it would turn the tail below into noise that
  // still looks like a measurement.
  expect(
    await page.evaluate(() => globalThis.crossOriginIsolated),
    'the bench page did not get a fine clock; the per-write tail will be unusable',
  ).toBe(true);

  if (info.project.name === 'android') {
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
    throttled = true;
  }
});

test.afterAll(async () => {
  await page.context().close();
});

test('the bundled construction reproduces its published vector', async () => {
  const vector = keystrokeVector();
  const result = await page.evaluate((input) => window.journalBench.verify(input), {
    k_journal: vector.derived.k_journal,
    workspace_id: vector.inputs.workspace_id,
    gen: vector.inputs.gen,
    journal_storage_key: vector.inputs.journal_storage_key,
    nonce: vector.inputs.nonce,
    plaintext: vector.inputs.plaintext,
    record: vector.expected.record,
  });

  // Not a soft check. Every number below is meaningless if this fails.
  expect(result.got, 'the benchmark is not measuring the selected construction').toBe(
    vector.expected.record,
  );
  expect(result.ok).toBe(true);
});

test('one journal record, by level and payload size', async () => {
  const results: RunResult[] = [];

  for (const { bytes, why } of SIZES) {
    for (const { level, label } of LEVELS) {
      const result = await page.evaluate(
        (input) => window.journalBench.run(input.level, input.options),
        {
          level,
          options: { bytes, ...RUN_DEFAULTS },
        },
      );
      results.push(result);

      // Two numbers, and which one is trustworthy depends on the project. The
      // batch mean is precise everywhere. The tail is what the budget is
      // actually written against — and it is only attributable where the CPU is
      // not throttled, for the reason recorded on THROTTLED_TAIL below.
      const mean = percentile(result.perOperation, 50);
      const tail = percentile(result.singles, 95);

      record({
        project,
        metric: `journal write, ${label}, ${bytes} B`,
        value: mean,
        samples: RUN_DEFAULTS.batches * result.perBatch,
        note: `${why}; batch mean over ${RUN_DEFAULTS.batches}×${result.perBatch} on a ${result.resolutionMs.toFixed(3)} ms clock; p95 of ${SINGLES} single writes ${(tail * 1000).toFixed(0)} µs${throttled ? ' (not attributable — CPU throttled)' : ''}`,
      });
    }
  }

  const at = (level: Level, bytes: number): RunResult => {
    const found = results.find((one) => one.level === level && one.bytes === bytes);
    if (!found) throw new Error(`no result for ${level} at ${bytes} B`);
    return found;
  };

  // The common case, and the level the budget actually governs: what a keystroke
  // pays synchronously before it can be considered journalled.
  const stored = at('stored', 18);
  expect(
    percentile(stored.perOperation, 50),
    `the mean synchronous journal write at the common payload size is inside the ${BUDGET_MS} ms budget in TRD §12`,
  ).toBeLessThan(BUDGET_MS);

  // The budget is a p95 of one write rather than a mean, so the tail is the
  // statistic it names — but only where it is attributable.
  if (!throttled) {
    expect(
      percentile(stored.singles, 95),
      `the p95 single journal write at the common payload size is the ${BUDGET_MS} ms budget in TRD §12`,
    ).toBeLessThan(BUDGET_MS);
  }

  // What encryption adds, as opposed to what the path costs. Recorded rather
  // than asserted: there is no budget on the difference, and inventing one here
  // would be a budget nobody agreed to.
  const added =
    percentile(at('stored', 18).perOperation, 50) -
    percentile(at('plaintext', 18).perOperation, 50);
  record({
    project,
    metric: 'journal write, encryption overhead, 18 B',
    value: added,
    samples: RUN_DEFAULTS.batches,
    note: 'batch mean of the full encrypted write minus the plaintext write that exists today; means rather than tails, because the difference of two tails is not the tail of a difference',
  });
});
