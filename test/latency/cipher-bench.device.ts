/**
 * The device entry for the cipher comparison (TRD §12, §15 rows 1–2).
 *
 * Served alongside the journal benchmark by `scripts/bench-journal-device.mjs`,
 * because the question it answers is only interesting on the hardware that
 * raised it: on a desktop every candidate is fast enough that the comparison
 * says nothing, and the 43× penalty this exists to explain does not appear.
 */

import { CANDIDATES, agree, runCandidate, type CipherResult } from './cipher-bench';
import { RUN_DEFAULTS, SIZES } from './journal-bench';

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

const styles = `
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0; padding: 1rem; }
  h1 { font-size: 1.1rem; margin: 0 0 .25rem; }
  p { margin: .4rem 0; }
  .bad { color: #b00020; font-weight: 600; }
  .good { color: #0a7d34; font-weight: 600; }
  button { font: inherit; padding: .7rem 1.1rem; margin: .6rem 0; width: 100%; }
  input { font: inherit; padding: .5rem; width: 100%; box-sizing: border-box; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: .8rem; }
  th, td { border-bottom: 1px solid #8884; padding: .3rem .35rem; text-align: right; }
  th:first-child, td:first-child { text-align: left; }
  #log { font: 12px ui-monospace, monospace; white-space: pre-wrap; opacity: .75; }
`;

const start = async (): Promise<void> => {
  document.head.append(el('style', styles));
  const app = el('div');
  document.body.append(app);
  app.append(el('h1', 'done — XChaCha20-Poly1305 implementations'));

  const log = el('div');
  log.id = 'log';

  // The vector is fetched rather than inlined so the page checks the same file
  // the generator publishes, not a copy that can quietly fall out of step.
  const response = await fetch('/vector');
  const vector = (await response.json()) as {
    k_journal: string;
    nonce: string;
    aad: string;
    plaintext: string;
    ciphertext: string;
  };

  const agreements = agree(vector, vector.ciphertext);
  const comparable = agreements.filter((a) => a.comparable);
  const allAgree = comparable.every((a) => a.agrees);
  app.append(
    el(
      'p',
      allAgree
        ? `All ${comparable.length} comparable implementations reproduce the published vector.`
        : `MISMATCH: ${comparable
            .filter((a) => !a.agrees)
            .map((a) => a.name)
            .join(', ')} does not reproduce the published vector.`,
      allAgree ? 'good' : 'bad',
    ),
  );

  // Instantiation cost is a result, not setup: it is the whole of what a WASM
  // dependency would add to start-up, and the journal cannot seal until it is
  // paid. Reported per candidate rather than hidden behind an await.
  const readyMs = new Map<string, number>();
  for (const candidate of CANDIDATES) readyMs.set(candidate.name, await candidate.ready());

  const isolatedProbe = globalThis.crossOriginIsolated;
  app.append(
    el(
      'p',
      isolatedProbe ? 'Cross-origin isolated.' : 'NOT cross-origin isolated — results unusable.',
      isolatedProbe ? 'good' : 'bad',
    ),
  );

  const label = el('input') as HTMLInputElement;
  label.value = 'device';
  app.append(el('p', 'Device label:'));
  app.append(label);

  const run = el('button', allAgree ? 'Run the comparison' : 'Refusing to run — vector mismatch');
  (run as HTMLButtonElement).disabled = !allAgree;
  app.append(run);
  app.append(log);
  const table = el('table');
  app.append(table);

  run.addEventListener('click', () => {
    (run as HTMLButtonElement).disabled = true;
    log.textContent = 'Running. Keep the screen on.\n';
    for (const [name, ms] of readyMs) {
      if (ms > 0)
        log.textContent += `${name}: callable ${ms.toFixed(1)} ms after the bundle evaluated\n`;
    }

    const results: CipherResult[] = [];
    const jobs: (() => void)[] = [];
    for (const { bytes } of SIZES) {
      for (const candidate of CANDIDATES) {
        jobs.push(() => {
          results.push(runCandidate(candidate, bytes));
        });
      }
    }

    const draw = (): void => {
      table.replaceChildren();
      const head = el('tr');
      for (const heading of ['Implementation', 'Bytes', 'Mean', 'p95', 'vs noble'])
        head.append(el('th', heading));
      table.append(head);
      for (const result of results) {
        const base = results.find((r) => r.bytes === result.bytes && r.name === '@noble/ciphers');
        const mean = percentile(result.perOperation, 50);
        const ratio = base ? mean / percentile(base.perOperation, 50) : 1;
        const tr = el('tr');
        tr.append(el('td', `${result.name}${result.kind === 'wasm' ? ' ⚙' : ''}`));
        tr.append(el('td', String(result.bytes)));
        tr.append(el('td', us(mean)));
        tr.append(el('td', us(percentile(result.singles, 95))));
        tr.append(el('td', base ? `${ratio.toFixed(2)}×` : '—'));
        table.append(tr);
      }
    };

    const step = (index: number): void => {
      if (index >= jobs.length) {
        draw();
        log.textContent += '\nSending to the harness…\n';
        void fetch('/results', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            project: label.value.trim() || 'device',
            userAgent: navigator.userAgent,
            isolated: isolatedProbe,
            resolutionMs: results[0]?.resolutionMs ?? 0,
            rows: results.map((result) => ({
              metric: `cipher, ${result.name}, ${result.bytes} B`,
              mean: percentile(result.perOperation, 50),
              tail: percentile(result.singles, 95),
              perBatch: result.perBatch,
              note: `${result.kind}; ${RUN_DEFAULTS.batches}×${result.perBatch}; instantiation ${(readyMs.get(result.name) ?? 0).toFixed(1)} ms; p95`,
            })),
          }),
        })
          .then((r) => {
            log.textContent += r.ok ? 'Recorded.\n' : `Refused (${r.status}).\n`;
          })
          .catch((error: unknown) => {
            log.textContent += `Could not reach the harness: ${String(error)}\n`;
          });
        return;
      }
      jobs[index]!();
      draw();
      log.textContent += `${results[results.length - 1]!.name}, ${results[results.length - 1]!.bytes} B\n`;
      setTimeout(() => step(index + 1), 30);
    };
    setTimeout(() => step(0), 30);
  });
};

void start();
