/**
 * The device entry for the journal benchmark (TRD §12, §15 row 2).
 *
 * **Why a page and not a driver.** The desktop and throttled figures come from
 * Playwright, which cannot reach a phone without adb and a USB cable. This entry
 * exists so the same measurement can be taken by opening a URL, which is the
 * cheapest thing that produces the one number Playwright cannot: **an
 * unthrottled p95 of a single write, on real hardware.** A CPU throttle stalls
 * the thread rather than modelling a slower core, so its stalls land inside
 * individually-timed operations and become the tail — which is why the tail is
 * the statistic that has to come from a device rather than an emulation.
 *
 * **It imports the same module and the same constants as the Playwright spec**,
 * so the device run and the desktop run are the same experiment by construction
 * rather than by inspection. Two copies of the sizes and batch counts would be
 * two experiments reported in one table.
 *
 * **It refuses to run without a fine clock.** Chrome coarsens `performance.now()`
 * to 100 µs unless the page is cross-origin isolated, and a 12 µs write is
 * invisible at that granularity — so an unisolated run would produce a tail made
 * entirely of quantization and no way to tell from the number.
 */

import { LEVELS, RUN_DEFAULTS, SIZES, bench, type RunResult } from './journal-bench';

const el = (tag: string, text?: string, className?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className !== undefined) node.className = className;
  return node;
};

const percentile = (samples: readonly number[], p: number): number => {
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1] as number;
};

const us = (ms: number): string => `${(ms * 1000).toFixed(1)} µs`;

interface Row {
  metric: string;
  mean: number;
  tail: number;
  perBatch: number;
  note: string;
}

const styles = `
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0; padding: 1rem; }
  h1 { font-size: 1.1rem; margin: 0 0 .25rem; }
  p { margin: .4rem 0; }
  .bad { color: #b00020; font-weight: 600; }
  .good { color: #0a7d34; font-weight: 600; }
  button { font: inherit; padding: .7rem 1.1rem; margin: .6rem 0; width: 100%; }
  input { font: inherit; padding: .5rem; width: 100%; box-sizing: border-box; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; margin-top: .8rem; }
  th, td { border-bottom: 1px solid #8884; padding: .3rem .4rem; text-align: right; }
  th:first-child, td:first-child { text-align: left; }
  tr.total td { font-weight: 700; }
  #log { font: 12px ui-monospace, monospace; white-space: pre-wrap; opacity: .75; }
`;

const start = (): void => {
  document.head.append(el('style', styles));
  const app = el('div');
  document.body.append(app);

  const clock = bench();
  // One tiny run purely to read back the clock and isolation state before
  // anything is claimed, so a bad environment is visible rather than inferred.
  const probe = clock.run('seal', { bytes: 18, batches: 1, targetBatchMs: 1, singles: 1 });

  app.append(el('h1', 'done — journal write benchmark'));

  const isolated = probe.isolated;
  const status = el(
    'p',
    isolated
      ? `Cross-origin isolated. Clock resolution ${probe.resolutionMs.toFixed(3)} ms.`
      : `NOT cross-origin isolated — clock resolution ${probe.resolutionMs.toFixed(3)} ms. The per-write tail cannot be measured here.`,
    isolated ? 'good' : 'bad',
  );
  app.append(status);

  const label = el('input') as HTMLInputElement;
  label.value = /Pixel\s*\d+\w*/u.exec(navigator.userAgent)?.[0] ?? 'device';
  app.append(el('p', 'Device label (used as the project name in the record):'));
  app.append(label);

  const run = el('button', isolated ? 'Run the benchmark' : 'Run anyway (tail will be unusable)');
  app.append(run);

  const log = el('div', '', '');
  log.id = 'log';
  app.append(log);
  const table = el('table');
  app.append(table);

  run.addEventListener('click', () => {
    (run as HTMLButtonElement).disabled = true;
    log.textContent = 'Running. Keep the screen on and the phone still.\n';

    // Yield between levels so the page can paint progress: a benchmark that
    // freezes the tab for a minute looks indistinguishable from one that hung,
    // and the person holding the phone is the only one who can tell.
    const jobs: (() => void)[] = [];
    const rows: Row[] = [];
    const raw: RunResult[] = [];

    /**
     * A drift check, because this runner has a confound the Playwright one does
     * not: **a phone throttles when it gets warm, and the run takes a minute.**
     * The sizes are measured smallest first, so the largest payload is also the
     * latest and any thermal decay is indistinguishable from a payload effect.
     *
     * Repeating the first and last measurements at the end separates them. If
     * the repeat matches, the ordering is innocent; if it is slower, the number
     * to trust is the first one and the difference is the drift.
     */
    const drift: { bytes: number; first: number; repeat: number }[] = [];

    for (const { bytes, why } of SIZES) {
      for (const { level, label: levelLabel } of LEVELS) {
        jobs.push(() => {
          const result = clock.run(level, { bytes, ...RUN_DEFAULTS });
          raw.push(result);
          rows.push({
            metric: `journal write, ${levelLabel}, ${bytes} B`,
            mean: percentile(result.perOperation, 50),
            tail: percentile(result.singles, 95),
            perBatch: result.perBatch,
            note: `${why}; batch mean over ${RUN_DEFAULTS.batches}×${result.perBatch} on a ${result.resolutionMs.toFixed(3)} ms clock; p95 of ${RUN_DEFAULTS.singles} single writes`,
          });
          log.textContent += `${levelLabel}, ${bytes} B — mean ${us(rows[rows.length - 1]!.mean)}\n`;
        });
      }
    }

    const draw = (): void => {
      table.replaceChildren();
      const head = el('tr');
      for (const heading of ['Level', 'Bytes', 'Mean', 'p95 single'])
        head.append(el('th', heading));
      table.append(head);
      for (const row of rows) {
        const tr = el('tr', undefined, row.metric.includes('setItem') ? 'total' : '');
        const [, name] = /journal write, (.*), (\d+) B/u.exec(row.metric)?.slice(0, 3) ?? [];
        tr.append(el('td', name ?? row.metric));
        tr.append(el('td', /(\d+) B$/u.exec(row.metric)?.[1] ?? ''));
        tr.append(el('td', us(row.mean)));
        tr.append(el('td', us(row.tail)));
        table.append(tr);
      }
    };

    for (const bytes of [18, 4096]) {
      jobs.push(() => {
        const again = clock.run('seal', { bytes, ...RUN_DEFAULTS });
        const first = raw.find((r) => r.level === 'seal' && r.bytes === bytes);
        if (!first) return;
        const before = percentile(first.perOperation, 50);
        const after = percentile(again.perOperation, 50);
        drift.push({ bytes, first: before, repeat: after });
        rows.push({
          metric: `journal write, drift check — seal repeated, ${bytes} B`,
          mean: after,
          tail: percentile(again.singles, 95),
          perBatch: again.perBatch,
          note: `the same seal measured again at the end of the run; first ${us(before)}, repeat ${us(after)}, drift ${((after / before - 1) * 100).toFixed(0)}%`,
        });
        log.textContent += `drift check ${bytes} B — first ${us(before)}, repeat ${us(after)} (${((after / before - 1) * 100).toFixed(0)}%)\n`;
      });
    }

    const step = (index: number): void => {
      if (index >= jobs.length) {
        draw();
        const worst = Math.max(...drift.map((d) => d.repeat / d.first - 1), 0);
        log.textContent +=
          worst > 0.15
            ? `\nWARNING: up to ${(worst * 100).toFixed(0)}% slower on repeat — the device drifted during the run.\n`
            : '\nDrift within 15%: the size ordering did not distort the numbers.\n';
        const plaintext = raw.find((r) => r.level === 'plaintext' && r.bytes === 18);
        const stored = raw.find((r) => r.level === 'stored' && r.bytes === 18);
        if (plaintext && stored) {
          rows.push({
            metric: 'journal write, encryption overhead, 18 B',
            mean: percentile(stored.perOperation, 50) - percentile(plaintext.perOperation, 50),
            tail: 0,
            perBatch: stored.perBatch,
            note: 'batch mean of the full encrypted write minus the plaintext write that exists today',
          });
        }
        log.textContent += '\nSending to the harness…\n';
        void fetch('/results', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            project: label.value.trim() || 'device',
            userAgent: navigator.userAgent,
            isolated: probe.isolated,
            resolutionMs: probe.resolutionMs,
            rows,
          }),
        })
          .then((response) => {
            log.textContent += response.ok
              ? 'Recorded. You can close this page.\n'
              : `The harness refused the results (${response.status}).\n`;
          })
          .catch((error: unknown) => {
            log.textContent += `Could not reach the harness: ${String(error)}\n`;
          });
        return;
      }
      jobs[index]!();
      draw();
      setTimeout(() => step(index + 1), 30);
    };

    setTimeout(() => step(0), 30);
  });
};

start();
